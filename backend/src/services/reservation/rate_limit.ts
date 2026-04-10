// ============================================================
// Rate limit helper for public reservation endpoints
// ============================================================
// DB ベースの簡易レート制限。公開予約 API のスパム・ブルートフォース抑止用。
// より厳密にやるなら Redis や Upstash が望ましいが MVP では Supabase の
// reservation_rate_limits テーブルで十分。

import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../config/supabase';

export function getClientIp(req: Request): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string') return xf.split(',')[0].trim();
  if (Array.isArray(xf) && xf.length > 0) return xf[0];
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export interface RateLimitConfig {
  action: string;      // 'public.reservation.create' 等
  windowSec: number;   // 計測窓
  max: number;         // 窓内の最大試行回数
}

export async function checkAndLogRateLimit(
  ip: string,
  storeId: string | null,
  cfg: RateLimitConfig,
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  const sinceIso = new Date(Date.now() - cfg.windowSec * 1000).toISOString();

  const { count } = await supabaseAdmin
    .from('reservation_rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .eq('action', cfg.action)
    .gte('created_at', sinceIso);

  if ((count || 0) >= cfg.max) {
    return { allowed: false, retryAfterSec: cfg.windowSec };
  }

  await supabaseAdmin.from('reservation_rate_limits').insert({
    ip,
    store_id: storeId,
    action: cfg.action,
  });

  return { allowed: true };
}

/**
 * Express middleware factory. リクエスト body に storeId が入っていれば
 * それを記録するが、なくても IP 単独でカウントする。
 */
export function rateLimit(cfg: RateLimitConfig) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ip = getClientIp(req);
    const storeId =
      (req.body && typeof (req.body as { storeId?: string }).storeId === 'string'
        ? (req.body as { storeId: string }).storeId
        : null) ||
      (req.params && typeof req.params.slug === 'string' ? null : null);

    try {
      const result = await checkAndLogRateLimit(ip, storeId, cfg);
      if (!result.allowed) {
        res.setHeader('Retry-After', String(result.retryAfterSec || cfg.windowSec));
        res.status(429).json({
          error: 'リクエストが多すぎます。しばらくしてから再度お試しください。',
        });
        return;
      }
      next();
    } catch (err) {
      // レート制限の失敗はアプリ本体を止めない
      console.warn('[rate-limit] check failed', err);
      next();
    }
  };
}

/**
 * 1 時間以上古いレート制限ログを削除するハウスキーパー。
 * cron から呼ぶ。
 */
export async function cleanupOldRateLimitLogs(olderThanSec: number = 3600): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanSec * 1000).toISOString();
  const { count, error } = await supabaseAdmin
    .from('reservation_rate_limits')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff);
  if (error) {
    console.warn('[rate-limit] cleanup failed', error.message);
    return 0;
  }
  return count || 0;
}
