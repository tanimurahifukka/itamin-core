import { supabaseAdmin } from '../config/supabase';

export interface AuditLogEntry {
  storeId: string;
  actorId: string;
  actorName?: string | null;
  actorRole?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  targetName?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * 監査ログを書き込む。失敗しても呼び出し元の処理は継続させる
 * (ログ書き込み失敗で本来の操作を中断させない)。
 */
export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from('audit_logs').insert({
      store_id: entry.storeId,
      actor_id: entry.actorId,
      actor_name: entry.actorName ?? null,
      actor_role: entry.actorRole ?? null,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      target_name: entry.targetName ?? null,
      metadata: entry.metadata ?? {},
    });
    if (error) {
      console.error('[audit] write failed', { action: entry.action, code: error.code, message: error.message });
    }
  } catch (e) {
    console.error('[audit] write exception', e);
  }
}

/**
 * 対象ユーザーの既存 Supabase セッションを即時無効化する。
 * updateUserById でのパスワード変更は refresh_token を失効させるが、
 * 既発行 access_token は TTL まで有効なため、併用して強制ログアウトする。
 */
export async function revokeUserSessions(targetUserId: string): Promise<void> {
  try {
    const { error } = await supabaseAdmin.rpc('admin_revoke_user_sessions', {
      target_user_id: targetUserId,
    });
    if (error) {
      console.error('[audit] revoke sessions failed', { targetUserId, code: error.code, message: error.message });
    }
  } catch (e) {
    console.error('[audit] revoke sessions exception', e);
  }
}
