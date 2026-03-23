import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { createSupabaseClient, supabaseAdmin } from '../config/supabase';
import { requireManagedStore, VALID_STAFF_ROLES } from './authorization';

const router = Router();

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

// 店舗作成（サーバーサイドでRLSバイパス — 認証済みユーザーのみ）
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const { name, address } = req.body;
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

  res.status(201).json({ store, staffId: staff.id });
});

// 自分の所属店舗一覧
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const supabase = createSupabaseClient(req.accessToken!);

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
});

// 初期パスワード取得
router.get('/:storeId/initial-password', requireAuth, async (req: Request, res: Response) => {
  const storeId = req.params.storeId as string;
  const membership = await requireManagedStore(req, res, storeId);
  if (!membership) return;

  const { data } = await supabaseAdmin
    .from('stores')
    .select('settings')
    .eq('id', storeId)
    .single();

  const initialPassword = data?.settings?.initial_password || storeId;
  res.json({ initialPassword });
});

// 初期パスワード変更
router.put('/:storeId/initial-password', requireAuth, async (req: Request, res: Response) => {
  const storeId = req.params.storeId as string;
  const { password } = req.body;
  const membership = await requireManagedStore(req, res, storeId);
  if (!membership) return;

  if (!password || password.length < 6) {
    res.status(400).json({ error: '6文字以上で設定してください' });
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
});

// スタッフ招待（既存ユーザーは即追加、未登録は招待メール送信）
router.post('/:storeId/staff', requireAuth, async (req: Request, res: Response) => {
  const storeId = req.params.storeId as string;
  const { name, email, role = 'part_time', hourlyWage } = req.body;
  const membership = await requireManagedStore(req, res, storeId);
  if (!membership) {
    return;
  }

  if (!email || !name) {
    res.status(400).json({ error: '名前とメールアドレスは必須です' });
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

    res.status(201).json({ staff, invited: false });
  } else {
    // 未登録ユーザー → 初期パスワードでユーザー作成 + 即スタッフ追加
    const { data: storeData } = await supabaseAdmin
      .from('stores')
      .select('settings')
      .eq('id', storeId)
      .single();
    const initialPassword = storeData?.settings?.initial_password || storeId;

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
    const { error: staffErr } = await supabaseAdmin
      .from('store_staff')
      .insert({
        store_id: storeId,
        user_id: newUser.user.id,
        role,
        hourly_wage: hourlyWage,
      });

    if (staffErr) {
      res.status(500).json({ error: staffErr.message });
      return;
    }

    res.status(201).json({
      invited: false,
      message: `${name} さんを追加しました。初期パスワードは事業所IDです。`,
    });
  }
});

// 未登録の招待一覧
router.get('/:storeId/invitations', requireAuth, async (req: Request, res: Response) => {
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
});

// 招待キャンセル（削除）
router.delete('/:storeId/invitations/:invitationId', requireAuth, async (req: Request, res: Response) => {
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
});

// 招待メール再送
router.post('/:storeId/invitations/:invitationId/resend', requireAuth, async (req: Request, res: Response) => {
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
});

// スタッフ情報更新（時給など）
router.put('/:storeId/staff/:staffId', requireAuth, async (req: Request, res: Response) => {
  const storeId = req.params.storeId as string;
  const staffId = req.params.staffId as string;
  const membership = await requireManagedStore(req, res, storeId);
  if (!membership) return;

  const { hourlyWage } = req.body;

  const updates: Record<string, any> = {};
  if (hourlyWage !== undefined) updates.hourly_wage = hourlyWage;

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
});

// スタッフ退職（削除）
router.delete('/:storeId/staff/:staffId', requireAuth, async (req: Request, res: Response) => {
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
});

// 店舗のスタッフ一覧
router.get('/:storeId/staff', requireAuth, async (req: Request, res: Response) => {
  const storeId = req.params.storeId as string;
  const supabase = createSupabaseClient(req.accessToken!);

  const { data, error } = await supabase
    .from('store_staff')
    .select('id, role, hourly_wage, joined_at, user:profiles(id, name, email, picture)')
    .eq('store_id', storeId);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const staff = (data || []).map((s: any) => ({
    id: s.id,
    role: s.role,
    hourlyWage: s.hourly_wage,
    joinedAt: s.joined_at,
    userId: s.user.id,
    userName: s.user.name,
    email: s.user.email,
    picture: s.user.picture,
  }));

  res.json({ staff });
});

export const storesRouter = router;
