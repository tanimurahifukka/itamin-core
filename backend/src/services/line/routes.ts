/**
 * LINE連携API
 * - LINE Login 開始 / callback
 * - 連携コード発行・使用
 * - 連携状態管理
 *
 * LINE チャネル情報は施設（store）単位で store_plugins.config から読み取る。
 * 未設定の場合は process.env にフォールバックする。
 */
import { Router, Request, Response } from 'express';
import { requireAuth } from '../../middleware/auth';
import { supabaseAdmin } from '../../config/supabase';
import { requireManagedStore, requireStoreMembership } from '../../auth/authorization';
import { writeEvent } from '../attendance/helpers';
import crypto from 'crypto';

const router = Router();

function createLineLoginState(storeId: string) {
  return `itamin:${Buffer.from(JSON.stringify({
    storeId,
    ts: Date.now(),
  })).toString('base64url')}`;
}

/**
 * 施設のLINE設定を取得する。
 * store_plugins.config → process.env の優先順でフォールバック。
 */
async function getLineConfig(storeId: string): Promise<{
  channelId: string | undefined;
  channelSecret: string | undefined;
  callbackUrl: string | undefined;
}> {
  const { data } = await supabaseAdmin
    .from('store_plugins')
    .select('config')
    .eq('store_id', storeId)
    .eq('plugin_name', 'line_attendance')
    .maybeSingle();

  const cfg = data?.config || {};
  return {
    channelId: cfg.line_login_channel_id || process.env.LINE_LOGIN_CHANNEL_ID,
    channelSecret: cfg.line_login_channel_secret || process.env.LINE_LOGIN_CHANNEL_SECRET,
    callbackUrl: cfg.line_login_callback_url || process.env.LINE_LOGIN_CALLBACK_URL,
  };
}

// ================================================================
// LINE Login 開始（リダイレクト URL を返す）
// ================================================================
router.get('/login', async (req: Request, res: Response) => {
  const storeId = req.query.storeId as string;
  if (!storeId) { res.status(400).json({ error: 'storeId is required' }); return; }

  const lineCfg = await getLineConfig(storeId);
  if (!lineCfg.channelId || !lineCfg.callbackUrl) {
    res.status(500).json({ error: 'この施設のLINE Login が設定されていません。設定画面でLINEチャネル情報を入力してください。' });
    return;
  }

  const state = createLineLoginState(storeId);
  const nonce = crypto.randomBytes(16).toString('hex');

  const url = `https://access.line.me/oauth2/v2.1/authorize?` +
    `response_type=code&client_id=${lineCfg.channelId}` +
    `&redirect_uri=${encodeURIComponent(lineCfg.callbackUrl)}` +
    `&state=${state}&scope=profile%20openid&nonce=${nonce}`;

  res.json({ url, state, nonce });
});

// ================================================================
// LINE Login Callback（認可コード → トークン → プロフィール取得）
// ================================================================
router.post('/callback', async (req: Request, res: Response) => {
  try {
    const { code, state, storeId } = req.body;
    if (!code) { res.status(400).json({ error: 'code is required' }); return; }
    if (!storeId) { res.status(400).json({ error: 'storeId is required' }); return; }

    const lineCfg = await getLineConfig(storeId);

    if (!lineCfg.channelId || !lineCfg.channelSecret || !lineCfg.callbackUrl) {
      res.status(500).json({ error: 'LINE Login not configured' });
      return;
    }

    // トークン交換
    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: lineCfg.callbackUrl!,
        client_id: lineCfg.channelId!,
        client_secret: lineCfg.channelSecret!,
      }),
    });
    const tokenData: any = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error('[line callback] token error:', tokenData);
      res.status(400).json({ error: 'LINEトークン取得に失敗しました' });
      return;
    }

    // プロフィール取得
    const profileRes = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile: any = await profileRes.json();
    if (!profileRes.ok) {
      res.status(400).json({ error: 'LINEプロフィール取得に失敗しました' });
      return;
    }

    // 既にリンク済みか確認
    const { data: existingLink } = await supabaseAdmin
      .from('line_user_links')
      .select('user_id, status')
      .eq('line_user_id', profile.userId)
      .maybeSingle();

    res.json({
      lineUserId: profile.userId,
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl,
      linked: !!existingLink && existingLink.status === 'active',
      linkedUserId: existingLink?.user_id || null,
    });
  } catch (e: any) {
    console.error('[line POST /callback]', e);
    res.status(500).json({ error: e.message });
  }
});

// ================================================================
// 連携コードで紐付け
// ================================================================
router.post('/link-with-code', async (req: Request, res: Response) => {
  try {
    const { code, lineUserId, displayName, pictureUrl } = req.body;
    if (!code || !lineUserId) {
      res.status(400).json({ error: 'code and lineUserId are required' });
      return;
    }

    // 既に他アカウントにリンク済みチェック
    const { data: existingLink } = await supabaseAdmin
      .from('line_user_links')
      .select('user_id')
      .eq('line_user_id', lineUserId)
      .eq('status', 'active')
      .maybeSingle();

    if (existingLink) {
      res.status(409).json({ error: 'このLINEアカウントは別のスタッフに連携済みです', code: 'LINE_ALREADY_LINKED' });
      return;
    }

    // コード検証
    const { data: token } = await supabaseAdmin
      .from('line_link_tokens')
      .select('*')
      .eq('code', code)
      .eq('status', 'active')
      .maybeSingle();

    if (!token) {
      res.status(400).json({ error: '連携コードが正しくありません', code: 'INVALID_LINK_CODE' });
      return;
    }

    if (new Date(token.expires_at) < new Date()) {
      await supabaseAdmin.from('line_link_tokens')
        .update({ status: 'expired' })
        .eq('id', token.id);
      res.status(400).json({ error: '連携コードの有効期限が切れています', code: 'LINK_CODE_EXPIRED' });
      return;
    }

    // リンク作成
    const { error: linkError } = await supabaseAdmin
      .from('line_user_links')
      .insert({
        user_id: token.user_id,
        line_user_id: lineUserId,
        display_name: displayName || null,
        picture_url: pictureUrl || null,
        status: 'active',
        linked_at: new Date().toISOString(),
      });

    if (linkError) {
      console.error('[line link-with-code] insert error:', linkError);
      res.status(500).json({ error: 'LINE連携に失敗しました' });
      return;
    }

    // コードを使用済みに
    await supabaseAdmin.from('line_link_tokens')
      .update({ status: 'used', used_at: new Date().toISOString() })
      .eq('id', token.id);

    // 監査ログ
    await writeEvent(supabaseAdmin, {
      storeId: token.store_id,
      userId: token.user_id,
      eventType: 'line_linked',
      payload: { lineUserId, displayName },
    });

    res.json({
      message: 'LINE連携が完了しました',
      userId: token.user_id,
    });
  } catch (e: any) {
    console.error('[line POST /link-with-code]', e);
    res.status(500).json({ error: e.message });
  }
});

// ================================================================
// LINE ユーザーIDから ITAMIN ユーザーを解決
// ================================================================
router.post('/resolve', async (req: Request, res: Response) => {
  try {
    const { lineUserId } = req.body;
    if (!lineUserId) { res.status(400).json({ error: 'lineUserId is required' }); return; }

    const { data: link } = await supabaseAdmin
      .from('line_user_links')
      .select('user_id, display_name, status')
      .eq('line_user_id', lineUserId)
      .eq('status', 'active')
      .maybeSingle();

    if (!link) {
      res.json({ linked: false });
      return;
    }

    // last_login_at 更新
    await supabaseAdmin.from('line_user_links')
      .update({ last_login_at: new Date().toISOString() })
      .eq('line_user_id', lineUserId);

    res.json({ linked: true, userId: link.user_id, displayName: link.display_name });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================================
// 管理者向け: 連携コード発行
// ================================================================
router.post('/admin/link-tokens', requireAuth, async (req: Request, res: Response) => {
  try {
    const { storeId, userId } = req.body;
    if (!storeId || !userId) { res.status(400).json({ error: 'storeId and userId are required' }); return; }

    const mgmt = await requireManagedStore(req, res, storeId);
    if (!mgmt) return;

    // 旧コードを無効化
    await supabaseAdmin.from('line_link_tokens')
      .update({ status: 'revoked' })
      .eq('user_id', userId)
      .eq('store_id', storeId)
      .eq('status', 'active');

    // 6桁数字コード生成
    const code = String(crypto.randomInt(100000, 999999));
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15分

    const { data, error } = await supabaseAdmin
      .from('line_link_tokens')
      .insert({
        user_id: userId,
        store_id: storeId,
        issued_by: req.user!.id,
        code,
        expires_at: expiresAt,
        status: 'active',
      })
      .select()
      .single();

    if (error) { res.status(500).json({ error: error.message }); return; }

    res.status(201).json({
      token: { id: data.id, code, expiresAt, userId },
      message: '連携コードを発行しました',
    });
  } catch (e: any) {
    console.error('[line POST /admin/link-tokens]', e);
    res.status(500).json({ error: e.message });
  }
});

// ================================================================
// 管理者向け: LINE 連携状態一覧
// ================================================================
router.get('/admin/links', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.query.storeId as string;
    if (!storeId) { res.status(400).json({ error: 'storeId is required' }); return; }

    const mgmt = await requireManagedStore(req, res, storeId);
    if (!mgmt) return;

    // 店舗スタッフ一覧
    const { data: staff } = await supabaseAdmin
      .from('store_staff')
      .select('id, user_id, role, user:profiles(name, picture)')
      .eq('store_id', storeId);

    const userIds = (staff || []).map((s: any) => s.user_id);

    // LINE連携情報
    const { data: links } = userIds.length > 0
      ? await supabaseAdmin
          .from('line_user_links')
          .select('user_id, line_user_id, display_name, status, linked_at, last_login_at')
          .in('user_id', userIds)
      : { data: [] };

    // アクティブな連携コード
    const { data: tokens } = userIds.length > 0
      ? await supabaseAdmin
          .from('line_link_tokens')
          .select('user_id, code, expires_at, status')
          .in('user_id', userIds)
          .eq('store_id', storeId)
          .eq('status', 'active')
      : { data: [] };

    const linkMap = new Map<string, any>();
    for (const l of links || []) linkMap.set(l.user_id, l);
    const tokenMap = new Map<string, any>();
    for (const t of tokens || []) tokenMap.set(t.user_id, t);

    const result = (staff || []).map((s: any) => {
      const link = linkMap.get(s.user_id);
      const activeToken = tokenMap.get(s.user_id);
      return {
        userId: s.user_id,
        staffId: s.id,
        staffName: s.user?.name || '—',
        role: s.role,
        lineLink: link ? {
          lineUserId: link.line_user_id,
          displayName: link.display_name,
          status: link.status,
          linkedAt: link.linked_at,
          lastLoginAt: link.last_login_at,
        } : null,
        activeToken: activeToken ? {
          code: activeToken.code,
          expiresAt: activeToken.expires_at,
        } : null,
      };
    });

    res.json({ staff: result });
  } catch (e: any) {
    console.error('[line GET /admin/links]', e);
    res.status(500).json({ error: e.message });
  }
});

// ================================================================
// スタッフ向け: 自分のLINE連携状態
// ================================================================
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const { data: link } = await supabaseAdmin
      .from('line_user_links')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('name, picture')
      .eq('id', userId)
      .maybeSingle();

    res.json({
      profile: { name: profile?.name, picture: profile?.picture },
      lineLink: link ? {
        displayName: link.display_name,
        pictureUrl: link.picture_url,
        status: link.status,
        linkedAt: link.linked_at,
      } : null,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export const lineRouter = router;
