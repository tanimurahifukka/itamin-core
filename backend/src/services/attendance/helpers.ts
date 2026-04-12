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
 * store_id + user_id + business_date でスコープ (複数店舗勤務時の衝突防止)。
 *
 * 注意: SELECT max → +1 はアトミックではないため、同一スタッフが同時に打刻した場合に
 * 重複する session_no が生成される可能性がある (race condition)。
 * 呼び出し側の INSERT で UNIQUE 制約 (store_id, user_id, business_date, session_no) が
 * 衝突を検知してエラーを返す必要がある。
 * TODO: attendance_records テーブルに (store_id, user_id, business_date, session_no) の
 *       UNIQUE 制約が存在することをマイグレーションで保証すること。
 *       将来的には DB の sequences または INSERT ... SELECT max()+1 サブクエリに置き換える。
 */
export async function nextSessionNo(
  supabase: any,
  storeId: string,
  userId: string,
  businessDate: string
): Promise<number> {
  const { data } = await supabase
    .from('attendance_records')
    .select('session_no')
    .eq('store_id', storeId)
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
  storeId: string,
  userId: string,
  idempotencyKey: string | undefined
): Promise<{ duplicate: boolean; existingRecordId?: string }> {
  if (!idempotencyKey) return { duplicate: false };
  const { data } = await supabase
    .from('attendance_events')
    .select('attendance_record_id')
    .eq('store_id', storeId)
    .eq('user_id', userId)
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

// ─────────────────────────────────────────────────────────────
// 共通 DTO: 勤怠セッション
// ─────────────────────────────────────────────────────────────
// attendance_records + attendance_breaks の結合結果を API レスポンス用に
// 正規化する。Web (attendance/routes.ts) / LINE (line/punch.ts) /
// NFC (nfc/punch.ts) の3系統で同じ形を返すために共通化している。
// 各系統で微妙にフィールドが違っていたため、ここで一元定義する。
export interface AttendanceBreakDTO {
  id: string;
  startedAt: string;
  endedAt: string | null;
  reason?: string | null;
}

export interface AttendanceSessionDTO {
  id: string;
  businessDate: string;
  sessionNo: number;
  status: string;
  clockInAt: string | null;
  clockOutAt: string | null;
  source?: string | null;
  note?: string | null;
  breaks: AttendanceBreakDTO[];
  breakMinutes: number;
}

export function formatAttendanceSession(s: any): AttendanceSessionDTO {
  const breaks = (s.breaks || []) as any[];
  return {
    id: s.id,
    businessDate: s.business_date,
    sessionNo: s.session_no,
    status: s.status,
    clockInAt: s.clock_in_at ?? null,
    clockOutAt: s.clock_out_at ?? null,
    source: s.source ?? null,
    note: s.note ?? null,
    breaks: breaks.map((b) => ({
      id: b.id,
      startedAt: b.started_at,
      endedAt: b.ended_at ?? null,
      reason: b.reason ?? null,
    })),
    breakMinutes: calcBreakMinutes(breaks),
  };
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
