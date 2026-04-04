/**
 * 勤怠ドメイン共通ヘルパー
 */

/**
 * business_date を算出する。cutoffHour 未満のローカル時刻なら前日扱い。
 */
export function calcBusinessDate(at: Date, timezone: string, cutoffHour: number): string {
  const local = new Date(at.toLocaleString('en-US', { timeZone: timezone }));
  if (local.getHours() < cutoffHour) {
    local.setDate(local.getDate() - 1);
  }
  const y = local.getFullYear();
  const m = String(local.getMonth() + 1).padStart(2, '0');
  const d = String(local.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 次の session_no を決定する。
 */
export async function nextSessionNo(
  supabase: any,
  userId: string,
  businessDate: string
): Promise<number> {
  const { data } = await supabase
    .from('attendance_records')
    .select('session_no')
    .eq('user_id', userId)
    .eq('business_date', businessDate)
    .order('session_no', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.session_no ?? 0) + 1;
}

/**
 * 休憩合計（分）を算出する。
 */
export function calcBreakMinutes(breaks: { started_at: string; ended_at: string | null }[]): number {
  let total = 0;
  for (const b of breaks) {
    if (b.ended_at) {
      total += (new Date(b.ended_at).getTime() - new Date(b.started_at).getTime()) / 60000;
    }
  }
  return Math.round(total);
}

/**
 * 冪等チェック用: 同じ idempotencyKey のイベントが既に存在するか
 */
export async function checkIdempotency(
  supabase: any,
  idempotencyKey: string | undefined
): Promise<{ duplicate: boolean; existingRecordId?: string }> {
  if (!idempotencyKey) return { duplicate: false };
  const { data } = await supabase
    .from('attendance_events')
    .select('attendance_record_id')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (data) return { duplicate: true, existingRecordId: data.attendance_record_id };
  return { duplicate: false };
}

/**
 * 監査イベント書き込み
 */
export async function writeEvent(
  supabase: any,
  params: {
    storeId: string;
    userId: string;
    recordId?: string;
    eventType: string;
    source?: string;
    idempotencyKey?: string;
    payload?: Record<string, any>;
    createdBy?: string;
  }
) {
  return supabase.from('attendance_events').insert({
    store_id: params.storeId,
    user_id: params.userId,
    attendance_record_id: params.recordId || null,
    event_type: params.eventType,
    event_at: new Date().toISOString(),
    source: params.source || 'web',
    idempotency_key: params.idempotencyKey || null,
    payload: params.payload || {},
    created_by: params.createdBy || params.userId,
  });
}

/**
 * ポリシーを取得（なければデフォルト値）
 */
export async function getPolicy(supabase: any, storeId: string) {
  const { data } = await supabase
    .from('attendance_policies')
    .select('*')
    .eq('store_id', storeId)
    .maybeSingle();
  return data || {
    timezone: 'Asia/Tokyo',
    business_day_cutoff_hour: 5,
    rounding_unit_minutes: 1,
    rounding_mode: 'none',
    auto_close_break_before_clock_out: false,
    require_manager_approval: true,
  };
}
