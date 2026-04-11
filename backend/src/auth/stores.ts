import { Router, Request, Response } from 'express';
import { randomBytes, timingSafeEqual } from 'crypto';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import { requireManagedStore, requireStoreMembership, canResetStaffPassword, VALID_STAFF_ROLES } from './authorization';
import { writeAuditLog, revokeUserSessions } from '../lib/audit';

const router = Router();
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;

const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const DEFAULT_INVITE_TTL_HOURS = 72;

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return timingSafeEqual(bufA, bufB);
}

function serializeStoreAccount(store: any) {
  return {
    id: store.id,
    name: store.name || '',
    address: store.address || '',
    phone: store.phone || '',
    slug: store.slug || '',
    openTime: store.settings?.open_time || '',
    closeTime: store.settings?.close_time || '',
  };
}

function normalizeNullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// ============================================================
// 初期パスワード管理 (storeId / 'itamin1234' フォールバック禁止 — C1/H6)
// ============================================================
// 英数字 + 記号 で12文字以上の安全なランダムパスワードを生成する
function generateInitialPassword(): string {
  const bytes = randomBytes(18);
  // URL-safe base64 → 24 文字, 先頭 16 文字を使用し末尾に記号を付与
  const base = bytes.toString('base64url').slice(0, 16);
  return `${base}!A1`;
}

// 店舗の初期パスワードを取得。未設定なら安全なランダム値を生成して保存する。
// 既存の 'itamin1234' / storeId フォールバックは完全に廃止。
async function getOrCreateInitialPassword(storeId: string): Promise<string> {
  const { data: storeData } = await supabaseAdmin
    .from('stores')
    .select('settings')
    .eq('id', storeId)
    .maybeSingle();

  const existing = (storeData as any)?.settings?.initial_password as string | undefined;
  if (existing && existing.length >= 12) return existing;

  const generated = generateInitialPassword();
  const nextSettings = { ...((storeData as any)?.settings || {}), initial_password: generated };
  await supabaseAdmin
    .from('stores')
    .update({ settings: nextSettings })
    .eq('id', storeId);
  return generated;
}

// ============================================================
// スタッフ PIN (NFC 清掃 / NFC 打刻で共用)
// ============================================================

// 店舗内で衝突しない 4 桁 PIN をランダム生成
async function generateUniqueStaffPin(storeId: string, maxRetries = 100): Promise<string | null> {
  for (let i = 0; i < maxRetries; i++) {
    const pin = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const { data } = await supabaseAdmin
      .from('staff_cleaning_pins')
      .select('membership_id')
      .eq('store_id', storeId)
      .eq('pin', pin)
      .maybeSingle();
    if (!data) return pin;
  }
  return null;
}

// スタッフに PIN が無ければ発行する (既存 PIN は上書きしない)
// スタッフ追加系エンドポイントから呼ばれる。失敗してもスタッフ追加自体は成功扱い。
async function ensureStaffPin(storeId: string, membershipId: string): Promise<void> {
  try {
    const { data: existing } = await supabaseAdmin
      .from('staff_cleaning_pins')
      .select('membership_id')
      .eq('membership_id', membershipId)
      .maybeSingle();
    if (existing) return;

    const pin = await generateUniqueStaffPin(storeId);
    if (!pin) {
      console.warn('[ensureStaffPin] could not generate unique pin', { storeId, membershipId });
      return;
    }

    const { error } = await supabaseAdmin
      .from('staff_cleaning_pins')
      .insert({ membership_id: membershipId, store_id: storeId, pin });
    if (error) {
      console.warn('[ensureStaffPin] insert failed', { storeId, membershipId, error: error.message });
    }
  } catch (e) {
    console.warn('[ensureStaffPin] unexpected error', e);
  }
}

async function getInvitationRedirectUrl(params: {
  storeId: string;
  email: string;
  name: string;
  origin?: string;
}) {
  const { storeId, email, name, origin } = params;
  const { data: store } = await supabaseAdmin
    .from('stores')
    .select('name')
    .eq('id', storeId)
    .maybeSingle();

  const redirectUrl = new URL(origin || 'https://itamin-core.vercel.app');
  redirectUrl.searchParams.set('invite', '1');
  redirectUrl.searchParams.set('email', email);
  redirectUrl.searchParams.set('name', name);
  redirectUrl.searchParams.set('storeName', store?.name || '');
  return redirectUrl.toString();
}

// ============================================================
// 招待トークン発行 (owner/manager 認証必須)
// ============================================================
router.post('/:storeId/invitations', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const intendedEmail = typeof req.body?.intendedEmail === 'string'
      ? req.body.intendedEmail.trim().toLowerCase()
      : null;
    const intendedRole = typeof req.body?.intendedRole === 'string'
      ? req.body.intendedRole.trim()
      : 'part_time';
    const maxUsesRaw = Number(req.body?.maxUses);
    const maxUses = Number.isFinite(maxUsesRaw) && maxUsesRaw >= 1 ? Math.floor(maxUsesRaw) : 1;
    const ttlHoursRaw = Number(req.body?.ttlHours);
    const ttlHours = Number.isFinite(ttlHoursRaw) && ttlHoursRaw > 0
      ? Math.min(Math.floor(ttlHoursRaw), 24 * 30)
      : DEFAULT_INVITE_TTL_HOURS;

    if (!VALID_STAFF_ROLES.includes(intendedRole as typeof VALID_STAFF_ROLES[number])) {
      res.status(400).json({ error: 'ロール指定が不正です' });
      return;
    }
    if (intendedRole === 'owner') {
      res.status(400).json({ error: 'owner ロールは招待経路では付与できません' });
      return;
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + ttlHours * 3600_000).toISOString();

    const { data: invitation, error: insertErr } = await supabaseAdmin
      .from('store_invitations')
      .insert({
        store_id: storeId,
        token,
        intended_email: intendedEmail,
        intended_role: intendedRole,
        max_uses: maxUses,
        created_by: req.user!.id,
        expires_at: expiresAt,
      })
      .select('id, token, expires_at, max_uses, intended_email, intended_role')
      .single();

    if (insertErr) {
      res.status(500).json({ error: insertErr.message });
      return;
    }

    await writeAuditLog({
      storeId,
      actorId: req.user!.id,
      action: 'store_invitation_create',
      targetType: 'store_invitation',
      targetId: (invitation as any).id,
      metadata: { intendedEmail, intendedRole, maxUses, ttlHours },
    });

    res.status(201).json({
      invitation: {
        id: (invitation as any).id,
        token: (invitation as any).token,
        expiresAt: (invitation as any).expires_at,
        maxUses: (invitation as any).max_uses,
        intendedEmail: (invitation as any).intended_email,
        intendedRole: (invitation as any).intended_role,
      },
    });
  } catch (e: any) {
    console.error('[stores POST /:storeId/invitations] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// 招待一覧 (owner/manager)
router.get('/:storeId/invitations', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const { data, error } = await supabaseAdmin
      .from('store_invitations')
      .select('id, intended_email, intended_role, max_uses, used_count, created_at, expires_at, revoked_at')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ invitations: data || [] });
  } catch (e: any) {
    console.error('[stores GET /:storeId/invitations] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// 招待の失効 (owner/manager)
router.delete('/:storeId/invitations/:invitationId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const invitationId = req.params.invitationId as string;
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const { error } = await supabaseAdmin
      .from('store_invitations')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', invitationId)
      .eq('store_id', storeId)
      .is('revoked_at', null);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    await writeAuditLog({
      storeId,
      actorId: req.user!.id,
      action: 'store_invitation_revoke',
      targetType: 'store_invitation',
      targetId: invitationId,
    });

    res.json({ ok: true });
  } catch (e: any) {
    console.error('[stores DELETE /:storeId/invitations/:invitationId] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// 公開：招待トークン経由のスタッフ登録
// （認証不要だが有効な招待トークン必須。C1 対策 2026-04-11）
// ============================================================
router.post('/:storeId/join', async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const inviteToken = typeof req.body?.inviteToken === 'string' ? req.body.inviteToken.trim() : '';

    if (!inviteToken || !INVITE_TOKEN_PATTERN.test(inviteToken)) {
      res.status(403).json({ error: '招待トークンが必要です。オーナーから招待URLを受け取ってください。' });
      return;
    }
    if (!name) { res.status(400).json({ error: '名前は必須です' }); return; }
    if (!email) { res.status(400).json({ error: 'メールアドレスは必須です' }); return; }
    if (password.length < 8) { res.status(400).json({ error: 'パスワードは8文字以上で入力してください' }); return; }

    // 招待トークン検証
    const { data: invitation } = await supabaseAdmin
      .from('store_invitations')
      .select('id, store_id, token, intended_email, intended_role, max_uses, used_count, expires_at, revoked_at')
      .eq('store_id', storeId)
      .eq('token', inviteToken)
      .maybeSingle();

    if (!invitation) {
      res.status(403).json({ error: '招待トークンが無効です' });
      return;
    }
    // timing-safe 比較 (DB 一致後の保険)
    if (!constantTimeEquals((invitation as any).token, inviteToken)) {
      res.status(403).json({ error: '招待トークンが無効です' });
      return;
    }
    if ((invitation as any).revoked_at) {
      res.status(403).json({ error: 'この招待は失効しています' });
      return;
    }
    if (new Date((invitation as any).expires_at).getTime() < Date.now()) {
      res.status(403).json({ error: 'この招待は期限切れです' });
      return;
    }
    if ((invitation as any).used_count >= (invitation as any).max_uses) {
      res.status(403).json({ error: 'この招待は使用上限に達しています' });
      return;
    }
    if ((invitation as any).intended_email && (invitation as any).intended_email !== email) {
      res.status(403).json({ error: 'この招待は別のメールアドレス用です' });
      return;
    }

    const intendedRole = (invitation as any).intended_role || 'part_time';
    if (intendedRole === 'owner') {
      // 安全ネット: owner 昇格は招待経路では許可しない
      res.status(403).json({ error: '招待経路で owner ロールは付与できません' });
      return;
    }

    // 店舗の存在確認
    const { data: store, error: storeErr } = await supabaseAdmin
      .from('stores')
      .select('id, name')
      .eq('id', storeId)
      .maybeSingle();

    if (storeErr || !store) {
      res.status(404).json({ error: '事業所が見つかりません' });
      return;
    }

    // 既存ユーザーチェック
    const { data: { users: authUsers } } = await supabaseAdmin.auth.admin.listUsers();
    let authUser = (authUsers as { id: string; email?: string }[]).find(u => u.email === email);

    if (authUser) {
      const { data: existing } = await supabaseAdmin
        .from('store_staff')
        .select('id')
        .eq('store_id', storeId)
        .eq('user_id', authUser.id)
        .maybeSingle();

      if (existing) {
        res.status(409).json({ error: '既にこの事業所に登録済みです。ログインしてください。' });
        return;
      }
    } else {
      const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name },
      });

      if (createErr) {
        res.status(500).json({ error: createErr.message });
        return;
      }
      authUser = newUser.user;

      await supabaseAdmin
        .from('profiles')
        .upsert({
          id: authUser.id,
          name,
          email,
        }, { onConflict: 'id' });
    }

    const { data: newMembership, error: staffErr } = await supabaseAdmin
      .from('store_staff')
      .insert({
        store_id: storeId,
        user_id: authUser!.id,
        role: intendedRole,
      })
      .select('id')
      .single();

    if (staffErr) {
      res.status(500).json({ error: staffErr.message });
      return;
    }

    if (newMembership?.id) {
      await ensureStaffPin(storeId, newMembership.id);
    }

    // 招待トークンの使用回数を増やす
    await supabaseAdmin
      .from('store_invitations')
      .update({ used_count: ((invitation as any).used_count || 0) + 1 })
      .eq('id', (invitation as any).id);

    await writeAuditLog({
      storeId,
      actorId: authUser!.id,
      action: 'store_join_via_invitation',
      targetType: 'store_staff',
      targetId: newMembership?.id ?? undefined,
      metadata: { invitationId: (invitation as any).id, email, intendedRole },
    });

    res.status(201).json({
      ok: true,
      message: `${store.name} にスタッフ登録しました。ログインしてください。`,
      storeName: store.name,
    });
  } catch (e: any) {
    console.error('[stores POST /:storeId/join] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// 公開：店舗情報取得（名前のみ、認証不要）
router.get('/:storeId/info', async (_req: Request, res: Response) => {
  try {
    const storeId = String(_req.params.storeId);
    const { data, error } = await supabaseAdmin
      .from('stores')
      .select('id, name')
      .eq('id', storeId)
      .maybeSingle();

    if (error || !data) {
      res.status(404).json({ error: '事業所が見つかりません' });
      return;
    }

    res.json({ store: { id: data.id, name: data.name } });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// 施設アカウント（事業所情報）取得
router.get('/:storeId/account', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const { data: store, error } = await supabaseAdmin
      .from('stores')
      .select('id, name, address, phone, slug, settings')
      .eq('id', storeId)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    if (!store) {
      res.status(404).json({ error: '事業所が見つかりません' });
      return;
    }

    res.json({ account: serializeStoreAccount(store) });
  } catch (e: any) {
    console.error('[stores GET /:storeId/account] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// 施設アカウント（事業所情報）更新
router.put('/:storeId/account', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const name = req.body?.name;
    const address = req.body?.address;
    const phone = req.body?.phone;
    const slug = req.body?.slug;
    const openTime = req.body?.openTime;
    const closeTime = req.body?.closeTime;

    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: '施設名は必須です' });
      return;
    }

    if (address !== undefined && typeof address !== 'string') {
      res.status(400).json({ error: '住所は文字列で指定してください' });
      return;
    }

    if (phone !== undefined && typeof phone !== 'string') {
      res.status(400).json({ error: '電話番号は文字列で指定してください' });
      return;
    }

    if (slug !== undefined && slug !== null && typeof slug !== 'string') {
      res.status(400).json({ error: '公開URL は文字列で指定してください' });
      return;
    }
    let normalizedSlug: string | null | undefined = undefined;
    if (typeof slug === 'string') {
      const trimmed = slug.trim().toLowerCase();
      if (trimmed === '') {
        normalizedSlug = null;
      } else if (!SLUG_PATTERN.test(trimmed)) {
        res.status(400).json({ error: '公開URL は英小文字・数字・ハイフンで 2〜63 文字にしてください' });
        return;
      } else {
        normalizedSlug = trimmed;
      }
    }

    if (openTime !== undefined && (typeof openTime !== 'string' || (openTime.trim() && !TIME_PATTERN.test(openTime.trim())))) {
      res.status(400).json({ error: '営業開始は HH:MM 形式で入力してください' });
      return;
    }

    if (closeTime !== undefined && (typeof closeTime !== 'string' || (closeTime.trim() && !TIME_PATTERN.test(closeTime.trim())))) {
      res.status(400).json({ error: '営業終了は HH:MM 形式で入力してください' });
      return;
    }

    const { data: currentStore, error: currentStoreError } = await supabaseAdmin
      .from('stores')
      .select('id, settings')
      .eq('id', storeId)
      .maybeSingle();

    if (currentStoreError) {
      res.status(500).json({ error: currentStoreError.message });
      return;
    }

    if (!currentStore) {
      res.status(404).json({ error: '事業所が見つかりません' });
      return;
    }

    const settings = { ...(currentStore.settings || {}) };
    if (typeof openTime === 'string') {
      const trimmed = openTime.trim();
      if (trimmed) settings.open_time = trimmed;
      else delete settings.open_time;
    }
    if (typeof closeTime === 'string') {
      const trimmed = closeTime.trim();
      if (trimmed) settings.close_time = trimmed;
      else delete settings.close_time;
    }

    const updates: Record<string, any> = {
      name: name.trim(),
      settings,
    };

    if (typeof address === 'string') updates.address = normalizeNullableText(address);
    if (typeof phone === 'string') updates.phone = normalizeNullableText(phone);
    if (normalizedSlug !== undefined) updates.slug = normalizedSlug;

    const { data: updatedStore, error: updateError } = await supabaseAdmin
      .from('stores')
      .update(updates)
      .eq('id', storeId)
      .select('id, name, address, phone, slug, settings')
      .single();

    if (updateError) {
      if (updateError.code === '23505' || /duplicate/i.test(updateError.message)) {
        res.status(409).json({ error: 'この公開URL は既に使用されています' });
        return;
      }
      res.status(500).json({ error: updateError.message });
      return;
    }

    res.json({
      ok: true,
      message: '施設アカウントを更新しました',
      account: serializeStoreAccount(updatedStore),
    });
  } catch (e: any) {
    console.error('[stores PUT /:storeId/account] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// 店舗作成（サーバーサイドでRLSバイパス — 認証済みユーザーのみ）
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const name = req.body?.name;
    const address = req.body?.address;
    if (!name) {
      res.status(400).json({ error: '店舗名は必須です' });
      return;
    }

    const userId = req.user!.id;

    // 店舗を作成（service role でRLSバイパス）
    const { data: store, error: storeErr } = await supabaseAdmin
      .from('stores')
      .insert({ name, address, owner_id: userId })
      .select()
      .single();

    if (storeErr) {
      res.status(500).json({ error: storeErr.message });
      return;
    }

    // オーナーをスタッフとして自動登録
    const { data: staff, error: staffErr } = await supabaseAdmin
      .from('store_staff')
      .insert({ store_id: store.id, user_id: userId, role: 'owner' })
      .select()
      .single();

    if (staffErr) {
      res.status(500).json({ error: staffErr.message });
      return;
    }

    await ensureStaffPin(store.id, staff.id);

    res.status(201).json({ store, staffId: staff.id });
  } catch (e: any) {
    console.error('[stores POST /] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// 自分の所属店舗一覧
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const supabase = supabaseAdmin;

    const { data, error } = await supabase
      .from('store_staff')
      .select('role, store:stores(id, name, address)')
      .eq('user_id', req.user!.id);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const stores = (data || []).map((d: any) => ({
      id: d.store.id,
      name: d.store.name,
      address: d.store.address,
      role: d.role,
    }));

    res.json({ stores });
  } catch (e: any) {
    console.error('[stores GET /] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// 初期パスワード取得
router.get('/:storeId/initial-password', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const initialPassword = await getOrCreateInitialPassword(storeId);
    res.json({ initialPassword });
  } catch (e: any) {
    console.error('[stores GET /:storeId/initial-password] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// 初期パスワード変更
router.put('/:storeId/initial-password', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const password = req.body?.password;
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    if (!password || password.length < 12) {
      res.status(400).json({ error: '初期パスワードは12文字以上で設定してください' });
      return;
    }

    // settings JSONB を更新
    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('settings')
      .eq('id', storeId)
      .single();

    const settings = { ...(store?.settings || {}), initial_password: password };
    const { error } = await supabaseAdmin
      .from('stores')
      .update({ settings })
      .eq('id', storeId);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ ok: true, message: '初期パスワードを変更しました' });
  } catch (e: any) {
    console.error('[stores PUT /:storeId/initial-password] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// スタッフ招待（既存ユーザーは即追加、未登録は招待メール送信）
router.post('/:storeId/staff', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const name = req.body?.name;
    const email = req.body?.email;
    const role = req.body?.role ?? 'part_time';
    const hourlyWage = req.body?.hourlyWage;
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) {
      return;
    }

    if (!email || !name) {
      res.status(400).json({ error: '名前とメールアドレスは必須です' });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: '有効なメールアドレスを入力してください' });
      return;
    }

    if (!VALID_STAFF_ROLES.includes(role)) {
      res.status(400).json({ error: '不正な role が指定されています' });
      return;
    }

    // 既存ユーザーか検索
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();

    if (profile) {
      // 既存ユーザー → 即スタッフ追加
      const { data: staff, error } = await supabaseAdmin
        .from('store_staff')
        .insert({
          store_id: storeId,
          user_id: profile.id,
          role,
          hourly_wage: hourlyWage,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          res.status(409).json({ error: '既にこの事業所に所属しています' });
        } else {
          res.status(500).json({ error: error.message });
        }
        return;
      }

      await ensureStaffPin(storeId, staff.id);

      res.status(201).json({ staff, invited: false });
    } else {
      // 未登録ユーザー → 初期パスワードでユーザー作成 + 即スタッフ追加
      // 初期パスワード未設定時は安全なランダム値を自動生成(storeId/固定値禁止)
      const initialPassword = await getOrCreateInitialPassword(storeId);

      const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: initialPassword,
        email_confirm: true,
        user_metadata: { full_name: name, password_changed: false },
      });

      if (createErr) {
        res.status(500).json({ error: createErr.message });
        return;
      }

      // スタッフとして追加（profilesはauth triggerで自動作成される）
      const { data: newStaff, error: staffErr } = await supabaseAdmin
        .from('store_staff')
        .insert({
          store_id: storeId,
          user_id: newUser.user.id,
          role,
          hourly_wage: hourlyWage,
        })
        .select('id')
        .single();

      if (staffErr) {
        res.status(500).json({ error: staffErr.message });
        return;
      }

      if (newStaff?.id) {
        await ensureStaffPin(storeId, newStaff.id);
      }

      res.status(201).json({
        invited: false,
        message: `${name} さんを追加しました。初期パスワードは事業所IDです。`,
      });
    }
  } catch (e: any) {
    console.error('[stores POST /:storeId/staff] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// 未登録の招待一覧
router.get('/:storeId/invitations', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) {
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('store_invitations')
      .select('id, name, email, role, hourly_wage, created_at')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({
      invitations: (data || []).map((inv: any) => ({
        id: inv.id,
        name: inv.name,
        email: inv.email,
        role: inv.role,
        hourlyWage: inv.hourly_wage,
        createdAt: inv.created_at,
      })),
    });
  } catch (e: any) {
    console.error('[stores GET /:storeId/invitations] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// 招待キャンセル（削除）
router.delete('/:storeId/invitations/:invitationId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const invitationId = req.params.invitationId as string;
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const { error } = await supabaseAdmin
      .from('store_invitations')
      .delete()
      .eq('id', invitationId)
      .eq('store_id', storeId);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ ok: true, message: '招待をキャンセルしました' });
  } catch (e: any) {
    console.error('[stores DELETE /:storeId/invitations/:invitationId] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// 招待メール再送
router.post('/:storeId/invitations/:invitationId/resend', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const invitationId = req.params.invitationId as string;
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) {
      return;
    }

    const { data: invitation, error } = await supabaseAdmin
      .from('store_invitations')
      .select('id, name, email')
      .eq('id', invitationId)
      .eq('store_id', storeId)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    if (!invitation) {
      res.status(404).json({ error: '招待が見つかりません' });
      return;
    }

    const redirectTo = await getInvitationRedirectUrl({
      storeId,
      email: invitation.email,
      name: invitation.name || invitation.email,
      origin: req.headers.origin,
    });

    const { error: mailErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(invitation.email, {
      redirectTo,
      data: { full_name: invitation.name || invitation.email },
    });

    if (mailErr) {
      res.status(500).json({ error: mailErr.message || '招待メール送信に失敗しました' });
      return;
    }

    res.json({ ok: true, message: '招待メールを再送しました' });
  } catch (e: any) {
    console.error('[stores POST /:storeId/invitations/:invitationId/resend] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// スタッフ情報更新（時給など）
router.put('/:storeId/staff/:staffId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const staffId = req.params.staffId as string;
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const hourlyWage = req.body?.hourlyWage;
    const transportFee = req.body?.transportFee;
    const joinedAt = req.body?.joinedAt;
    const newRole = req.body?.role;

    const updates: Record<string, any> = {};
    if (hourlyWage !== undefined) updates.hourly_wage = hourlyWage;
    if (transportFee !== undefined) updates.transport_fee = transportFee;
    if (joinedAt !== undefined) updates.joined_at = joinedAt;
    if (newRole !== undefined) {
      if (!VALID_STAFF_ROLES.includes(newRole) || newRole === 'owner') {
        res.status(400).json({ error: '不正なロールです' });
        return;
      }
      // オーナーのみロール変更可
      if (membership.role !== 'owner') {
        res.status(403).json({ error: 'ロール変更はオーナーのみ可能です' });
        return;
      }
      updates.role = newRole;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: '更新するフィールドがありません' });
      return;
    }

    const { error } = await supabaseAdmin
      .from('store_staff')
      .update(updates)
      .eq('id', staffId)
      .eq('store_id', storeId);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ ok: true });
  } catch (e: any) {
    console.error('[stores PUT /:storeId/staff/:staffId] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// スタッフ退職（削除）
router.delete('/:storeId/staff/:staffId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const staffId = req.params.staffId as string;
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    // 対象スタッフを取得
    const { data: target, error: findErr } = await supabaseAdmin
      .from('store_staff')
      .select('id, role, user:profiles(name)')
      .eq('id', staffId)
      .eq('store_id', storeId)
      .maybeSingle();

    if (findErr || !target) {
      res.status(404).json({ error: 'スタッフが見つかりません' });
      return;
    }

    // オーナーは退職させられない
    if (target.role === 'owner') {
      res.status(400).json({ error: 'オーナーを退職させることはできません' });
      return;
    }

    // 削除実行
    const { error: delErr } = await supabaseAdmin
      .from('store_staff')
      .delete()
      .eq('id', staffId);

    if (delErr) {
      res.status(500).json({ error: delErr.message });
      return;
    }

    res.json({ ok: true, message: `${(target as any).user?.name || 'スタッフ'} さんを退職処理しました` });
  } catch (e: any) {
    console.error('[stores DELETE /:storeId/staff/:staffId] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// スタッフのパスワードリセット
// 権限は staff プラグインの password_reset_roles 設定で制御（デフォルト: owner, manager）
router.post('/:storeId/staff/:staffId/reset-password', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const staffId = req.params.staffId as string;

    // 基本の所属チェック
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    // 設定に基づく権限チェック
    const allowed = await canResetStaffPassword(storeId, membership.role);
    if (!allowed) {
      res.status(403).json({ error: 'パスワードリセットの権限がありません' });
      return;
    }

    // 対象スタッフを取得（同じ店舗内のみ）
    const { data: target, error: findErr } = await supabaseAdmin
      .from('store_staff')
      .select('id, user_id, role, user:profiles(name, email)')
      .eq('id', staffId)
      .eq('store_id', storeId)
      .maybeSingle();

    if (findErr || !target) {
      res.status(404).json({ error: 'スタッフが見つかりません' });
      return;
    }

    // 自分以上の権限のスタッフのパスワードはリセットできない
    // 例: manager は owner のパスワードをリセットできない
    const roleHierarchy: Record<string, number> = {
      owner: 4, manager: 3, leader: 2, full_time: 1, part_time: 0,
    };
    const myRank = roleHierarchy[membership.role] ?? 0;
    const targetRank = roleHierarchy[(target as any).role] ?? 0;
    if (targetRank >= myRank) {
      res.status(403).json({ error: '自分と同等以上のロールのスタッフのパスワードはリセットできません' });
      return;
    }

    // リクエストボディに password があればそれを使う、なければ店舗の初期パスワード
    const customPassword = typeof req.body?.password === 'string' ? req.body.password.trim() : '';

    let newPassword = customPassword;
    if (!newPassword) {
      newPassword = await getOrCreateInitialPassword(storeId);
    }

    if (newPassword.length < 8) {
      res.status(400).json({ error: 'パスワードは8文字以上にしてください' });
      return;
    }

    // 対象ユーザーの現在の user_metadata を取得
    const { data: { user: authUser }, error: getErr } = await supabaseAdmin.auth.admin.getUserById((target as any).user_id);
    if (getErr || !authUser) {
      res.status(404).json({ error: '認証アカウントが見つかりません' });
      return;
    }

    // Supabase Auth のパスワードを更新
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
      password: newPassword,
      user_metadata: {
        ...authUser.user_metadata,
        password_changed: false,
      },
    });

    if (updateErr) {
      console.error('[stores POST reset-password] update failed:', updateErr);
      res.status(500).json({ error: 'パスワードリセットに失敗しました' });
      return;
    }

    // 対象ユーザーの既存セッションを即時 revoke
    await revokeUserSessions((target as any).user_id);

    // actor (操作者) の情報を取得してログに記録
    const { data: actorProfile } = await supabaseAdmin
      .from('profiles')
      .select('name')
      .eq('id', req.user!.id)
      .maybeSingle();

    await writeAuditLog({
      storeId,
      actorId: req.user!.id,
      actorName: (actorProfile as any)?.name || req.user!.email || null,
      actorRole: membership.role,
      action: 'password_reset',
      targetType: 'staff',
      targetId: staffId,
      targetName: (target as any).user?.name || (target as any).user?.email || null,
      metadata: {
        custom_password_used: !!customPassword,
        target_role: (target as any).role,
        sessions_revoked: true,
      },
    });

    console.log(`[stores] password reset: store=${storeId} staff=${staffId} by=${req.user!.id} role=${membership.role}`);

    res.json({
      ok: true,
      message: `${(target as any).user?.name || 'スタッフ'} さんのパスワードをリセットしました`,
      password: newPassword,
      forceChange: true,
    });
  } catch (e: any) {
    console.error('[stores POST /:storeId/staff/:staffId/reset-password] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// 店舗の監査ログ取得 (管理者のみ)
// クエリ: ?action=password_reset&limit=50
router.get('/:storeId/audit-log', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;

    // 管理者ロールのみ
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const action = typeof req.query.action === 'string' ? req.query.action : undefined;
    const rawLimit = Number(req.query.limit);
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1), 200);

    let query = supabaseAdmin
      .from('audit_logs')
      .select('id, actor_id, actor_name, actor_role, action, target_type, target_id, target_name, metadata, created_at')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (action) {
      query = query.eq('action', action);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[stores GET audit-log] error:', error);
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ entries: data || [] });
  } catch (e: any) {
    console.error('[stores GET /:storeId/audit-log] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// 店舗のスタッフ一覧
router.get('/:storeId/staff', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const supabase = supabaseAdmin;

    const { data, error } = await supabase
      .from('store_staff')
      .select('id, role, hourly_wage, transport_fee, joined_at, user:profiles(id, name, email, picture)')
      .eq('store_id', storeId);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    // auth.usersから最終ログイン時間を取得
    const userIds = (data || []).map((staff: any) => staff.user?.id).filter(Boolean);
    const lastSignInMap = new Map<string, string | null>();

    if (userIds.length > 0) {
      const { data: { users: allUsers } } = await supabaseAdmin.auth.admin.listUsers();
      for (const user of allUsers as { id: string; last_sign_in_at?: string }[]) {
        if (userIds.includes(user.id)) {
          lastSignInMap.set(user.id, user.last_sign_in_at || null);
        }
      }
    }

    const staff = (data || []).map((staff: any) => ({
      id: staff.id,
      role: staff.role,
      hourlyWage: staff.hourly_wage,
      transportFee: staff.transport_fee || 0,
      joinedAt: staff.joined_at,
      userId: staff.user.id,
      userName: staff.user.name,
      email: staff.user.email,
      picture: staff.user.picture,
      lastSignInAt: lastSignInMap.get(staff.user.id) || null,
    }));

    res.json({ staff });
  } catch (e: any) {
    console.error('[stores GET /:storeId/staff] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// 再入職（退職済みスタッフを再追加 + パスワードリセット）
router.post('/:storeId/staff/rehire', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const role = req.body?.role || 'part_time';
    const hourlyWage = req.body?.hourlyWage ?? 0;

    if (!email) {
      res.status(400).json({ error: 'メールアドレスは必須です' });
      return;
    }

    if (!VALID_STAFF_ROLES.includes(role)) {
      res.status(400).json({ error: '無効なロールです' });
      return;
    }

    // 既にこの店舗に所属していないか確認
    const { data: existing } = await supabaseAdmin
      .from('store_staff')
      .select('id, user:profiles(email)')
      .eq('store_id', storeId);

    const alreadyMember = (existing || []).find((staff: any) => staff.user?.email === email);
    if (alreadyMember) {
      res.status(409).json({ error: 'このスタッフは既に所属しています' });
      return;
    }

    // auth.usersからユーザーを探す
    const { data: { users: resetUsers }, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) {
      res.status(500).json({ error: listErr.message });
      return;
    }

    const authUser = (resetUsers as { id: string; email?: string; user_metadata?: Record<string, unknown> }[]).find(user => user.email === email);
    if (!authUser) {
      res.status(404).json({ error: 'このメールアドレスのアカウントが見つかりません。新規招待してください。' });
      return;
    }

    // パスワードを店舗の初期パスワードにリセット
    const { data: pwSetting } = await supabaseAdmin
      .from('store_settings')
      .select('value')
      .eq('store_id', storeId)
      .eq('key', 'initial_password')
      .maybeSingle();

    const initialPassword = pwSetting?.value || 'itamin1234';

    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
      password: initialPassword,
      user_metadata: {
        ...authUser.user_metadata,
        password_changed: false,
      },
    });

    if (updateErr) {
      console.error('[stores POST /:storeId/staff/rehire] password reset failed:', updateErr);
      res.status(500).json({ error: 'パスワードリセットに失敗しました' });
      return;
    }

    // store_staffに再追加
    const { data: staff, error: insertErr } = await supabaseAdmin
      .from('store_staff')
      .insert({
        store_id: storeId,
        user_id: authUser.id,
        role,
        hourly_wage: hourlyWage,
      })
      .select()
      .single();

    if (insertErr) {
      console.error('[stores POST /:storeId/staff/rehire] insert failed:', insertErr);
      res.status(500).json({ error: insertErr.message });
      return;
    }

    await ensureStaffPin(storeId, staff.id);

    res.status(201).json({
      ok: true,
      message: `${email} さんを再入職しました（パスワードは初期パスワードにリセット済み）`,
      staff,
    });
  } catch (e: any) {
    console.error('[stores POST /:storeId/staff/rehire] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// スタッフ PIN 管理 (NFC 清掃 / NFC 打刻で共用)
// ============================================================
// 注: テーブル名は歴史的経緯で staff_cleaning_pins のままだが、
//     用途は清掃チェックインと打刻の両方。エンドポイントは
//     /staff-pins/* に統一する。

// 自分の PIN を取得 (スタッフ本人が閲覧用、管理者権限不要)
// 未発行の場合はその場で発行する
router.get('/:storeId/staff-pins/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const { data: staff, error: staffErr } = await supabaseAdmin
      .from('store_staff')
      .select('id')
      .eq('store_id', storeId)
      .eq('user_id', req.user!.id)
      .maybeSingle();

    if (staffErr || !staff) {
      res.status(404).json({ error: 'この店舗のスタッフ情報が見つかりません' });
      return;
    }

    // 既存 PIN を取得
    const { data: existing } = await supabaseAdmin
      .from('staff_cleaning_pins')
      .select('pin')
      .eq('membership_id', staff.id)
      .maybeSingle();

    if (existing?.pin) {
      res.json({ pin: existing.pin });
      return;
    }

    // 未発行ならその場で発行してから返す
    await ensureStaffPin(storeId, staff.id);

    const { data: fresh } = await supabaseAdmin
      .from('staff_cleaning_pins')
      .select('pin')
      .eq('membership_id', staff.id)
      .maybeSingle();

    res.json({ pin: fresh?.pin || null });
  } catch (e: any) {
    console.error('[stores GET /:storeId/staff-pins/me] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// スタッフごとの PIN 一覧 (管理者のみ)
router.get('/:storeId/staff-pins', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const { data, error } = await supabaseAdmin
      .from('staff_cleaning_pins')
      .select('membership_id, pin, updated_at, staff:store_staff!inner(id, user:profiles(name))')
      .eq('store_id', storeId);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const pins = (data || []).map((row: any) => ({
      membershipId: row.membership_id,
      pin: row.pin,
      updatedAt: row.updated_at,
      staffName: row.staff?.user?.name || '',
    }));

    res.json({ pins });
  } catch (e: any) {
    console.error('[stores GET /:storeId/staff-pins] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// スタッフ個別の PIN 発行/再発行
router.post('/:storeId/staff-pins/:staffId/regenerate', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const staffId = req.params.staffId as string;

    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    // 対象スタッフが同じ店舗に属するか確認
    const { data: target, error: targetErr } = await supabaseAdmin
      .from('store_staff')
      .select('id, user:profiles(name)')
      .eq('id', staffId)
      .eq('store_id', storeId)
      .maybeSingle();

    if (targetErr || !target) {
      res.status(404).json({ error: 'スタッフが見つかりません' });
      return;
    }

    const pin = await generateUniqueStaffPin(storeId);
    if (!pin) {
      res.status(500).json({ error: 'PIN を生成できませんでした' });
      return;
    }

    // upsert
    const { error: upErr } = await supabaseAdmin
      .from('staff_cleaning_pins')
      .upsert({
        membership_id: staffId,
        store_id: storeId,
        pin,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'membership_id' });

    if (upErr) {
      res.status(500).json({ error: upErr.message });
      return;
    }

    await writeAuditLog({
      storeId,
      actorId: req.user!.id,
      actorRole: membership.role,
      action: 'staff_pin.regenerate',
      targetType: 'staff',
      targetId: staffId,
      targetName: (target as any).user?.name || null,
      metadata: {},
    });

    res.json({ ok: true, pin, staffName: (target as any).user?.name || null });
  } catch (e: any) {
    console.error('[stores POST /:storeId/staff-pins/:staffId/regenerate] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// スタッフ個別の PIN 削除
router.delete('/:storeId/staff-pins/:staffId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const staffId = req.params.staffId as string;

    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const { error } = await supabaseAdmin
      .from('staff_cleaning_pins')
      .delete()
      .eq('store_id', storeId)
      .eq('membership_id', staffId);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    await writeAuditLog({
      storeId,
      actorId: req.user!.id,
      actorRole: membership.role,
      action: 'staff_pin.delete',
      targetType: 'staff',
      targetId: staffId,
      metadata: {},
    });

    res.json({ ok: true });
  } catch (e: any) {
    console.error('[stores DELETE /:storeId/staff-pins/:staffId] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// NFC cleaning: 場所 (location) 管理
// ============================================================

// NFC location 一覧 (店舗メンバー全員)
router.get('/:storeId/nfc-locations', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const { data, error } = await supabaseAdmin
      .from('nfc_cleaning_locations')
      .select('id, slug, name, template_id, active, created_at, updated_at')
      .eq('store_id', storeId)
      .order('created_at', { ascending: true });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    // テンプレート名を併せて返す
    const templateIds = Array.from(new Set((data || []).map((d: any) => d.template_id).filter(Boolean)));
    let templateMap: Record<string, string> = {};
    if (templateIds.length > 0) {
      const { data: templates } = await supabaseAdmin
        .from('checklist_templates')
        .select('id, name')
        .in('id', templateIds);
      for (const t of templates || []) {
        templateMap[(t as any).id] = (t as any).name;
      }
    }

    const origin = `${req.protocol}://${req.get('host')}`;
    const locations = (data || []).map((row: any) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      templateId: row.template_id,
      templateName: row.template_id ? templateMap[row.template_id] || null : null,
      active: row.active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      url: `${origin}/nfc/clean?loc=${row.id}`,
    }));

    res.json({ locations });
  } catch (e: any) {
    console.error('[stores GET /:storeId/nfc-locations] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// NFC location 作成 (管理者のみ)
router.post('/:storeId/nfc-locations', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const slug = typeof req.body?.slug === 'string' ? req.body.slug.trim() : '';
    const templateId = typeof req.body?.templateId === 'string' ? req.body.templateId : null;

    if (!name) { res.status(400).json({ error: '名前は必須です' }); return; }
    if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
      res.status(400).json({ error: 'slug は半角英数とハイフンで入力してください' });
      return;
    }

    // テンプレートが指定されていれば、同じ店舗のテンプレートか確認
    if (templateId) {
      const { data: tpl } = await supabaseAdmin
        .from('checklist_templates')
        .select('id, store_id')
        .eq('id', templateId)
        .maybeSingle();
      if (!tpl || (tpl as any).store_id !== storeId) {
        res.status(400).json({ error: '無効なテンプレートです' });
        return;
      }
    }

    const { data, error } = await supabaseAdmin
      .from('nfc_cleaning_locations')
      .insert({ store_id: storeId, slug, name, template_id: templateId, active: true })
      .select('id, slug, name, template_id, active')
      .single();

    if (error) {
      if ((error as any).code === '23505') {
        res.status(409).json({ error: '同じ slug の場所がすでに存在します' });
        return;
      }
      res.status(500).json({ error: error.message });
      return;
    }

    await writeAuditLog({
      storeId,
      actorId: req.user!.id,
      actorRole: membership.role,
      action: 'nfc_location.create',
      targetType: 'nfc_location',
      targetId: (data as any).id,
      targetName: name,
      metadata: { slug, templateId },
    });

    const origin = `${req.protocol}://${req.get('host')}`;
    res.status(201).json({
      ok: true,
      location: {
        ...(data as any),
        url: `${origin}/nfc/clean?loc=${(data as any).id}`,
      },
    });
  } catch (e: any) {
    console.error('[stores POST /:storeId/nfc-locations] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// NFC location 更新 (管理者のみ)
router.put('/:storeId/nfc-locations/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const id = req.params.id as string;
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (typeof req.body?.name === 'string') patch.name = req.body.name.trim();
    if (typeof req.body?.slug === 'string') {
      if (!/^[a-z0-9-]+$/i.test(req.body.slug)) {
        res.status(400).json({ error: 'slug は半角英数とハイフンで入力してください' });
        return;
      }
      patch.slug = req.body.slug.trim();
    }
    if ('templateId' in (req.body || {})) patch.template_id = req.body.templateId || null;
    if (typeof req.body?.active === 'boolean') patch.active = req.body.active;

    const { data, error } = await supabaseAdmin
      .from('nfc_cleaning_locations')
      .update(patch)
      .eq('id', id)
      .eq('store_id', storeId)
      .select('id, slug, name, template_id, active')
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    await writeAuditLog({
      storeId,
      actorId: req.user!.id,
      actorRole: membership.role,
      action: 'nfc_location.update',
      targetType: 'nfc_location',
      targetId: id,
      metadata: patch,
    });

    res.json({ ok: true, location: data });
  } catch (e: any) {
    console.error('[stores PUT /:storeId/nfc-locations/:id] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// NFC location 削除 (管理者のみ)
router.delete('/:storeId/nfc-locations/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const id = req.params.id as string;
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const { error } = await supabaseAdmin
      .from('nfc_cleaning_locations')
      .delete()
      .eq('id', id)
      .eq('store_id', storeId);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    await writeAuditLog({
      storeId,
      actorId: req.user!.id,
      actorRole: membership.role,
      action: 'nfc_location.delete',
      targetType: 'nfc_location',
      targetId: id,
      metadata: {},
    });

    res.json({ ok: true });
  } catch (e: any) {
    console.error('[stores DELETE /:storeId/nfc-locations/:id] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// 店舗のチェックリストテンプレート一覧 (NFC location 作成時のセレクト用)
router.get('/:storeId/checklist-templates', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const { data, error } = await supabaseAdmin
      .from('checklist_templates')
      .select('id, name, description, scope, timing')
      .eq('store_id', storeId)
      .order('name', { ascending: true });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ templates: data || [] });
  } catch (e: any) {
    console.error('[stores GET /:storeId/checklist-templates] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

export const storesRouter = router;
