/**
 * LINE チャネル設定の取得と ID トークン検証。
 * 店舗ごとの store_plugins.config から読み取り、未設定時は環境変数にフォールバックする。
 */
import { supabaseAdmin } from '../../config/supabase';

export interface LineChannelConfig {
  channelId: string | undefined;
  channelSecret: string | undefined;
  callbackUrl: string | undefined;
}

export async function getLineConfig(storeId: string): Promise<LineChannelConfig> {
  const { data } = await supabaseAdmin
    .from('store_plugins')
    .select('config')
    .eq('store_id', storeId)
    .eq('plugin_name', 'line_attendance')
    .maybeSingle();

  const cfg = (data?.config as Record<string, unknown>) || {};
  return {
    channelId: (cfg.line_login_channel_id as string) || process.env.LINE_LOGIN_CHANNEL_ID,
    channelSecret: (cfg.line_login_channel_secret as string) || process.env.LINE_LOGIN_CHANNEL_SECRET,
    callbackUrl: (cfg.line_login_callback_url as string) || process.env.LINE_LOGIN_CALLBACK_URL,
  };
}

/**
 * LIFF ID トークンを LINE の verify エンドポイントで検証する。
 * 成功時は sub (= LINE userId) を返し、失敗時は null を返す。
 *
 * LIFF のフロントから送られてくる lineUserId を単にそのまま信用すると、
 * 攻撃者が任意の lineUserId を送信して別ユーザーとして打刻できてしまう。
 * このため LIFF 経由の全リクエストで必ず ID トークン検証を通すこと。
 *
 * @see https://developers.line.biz/ja/reference/line-login/#verify-id-token
 */
export async function verifyLineIdToken(
  idToken: string,
  channelId: string,
): Promise<{ sub: string } | null> {
  try {
    const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { sub?: string; aud?: string; exp?: number };
    if (!data.sub || data.aud !== channelId) return null;
    if (data.exp && data.exp * 1000 < Date.now()) return null;
    return { sub: data.sub };
  } catch (e) {
    console.warn('[line] id_token verify failed', e);
    return null;
  }
}
