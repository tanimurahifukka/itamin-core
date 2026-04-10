// ============================================================
// Reservation shared types
// ============================================================
// 4 プラグイン (table / timeslot / school / event) が共通で使う型。
// DB の reservations テーブル行と 1:1 対応する。

export type ReservationType = 'table' | 'timeslot' | 'school' | 'event';

export type ReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'seated'
  | 'completed'
  | 'no_show'
  | 'cancelled';

export type ReservationSource = 'web' | 'line' | 'phone' | 'walkin' | 'admin';

export interface ReservationRow {
  id: string;
  store_id: string;
  customer_id: string | null;
  reservation_type: ReservationType;
  status: ReservationStatus;
  starts_at: string;
  ends_at: string;
  party_size: number;
  resource_ref: string | null;
  source: ReservationSource;
  confirmation_code: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  notes: string | null;
  internal_notes: string | null;
  metadata: Record<string, unknown>;
  amount_total: number | null;
  paid: boolean;
  payment_method: string | null;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  created_by: string | null;
}

export interface ReservationTableRow {
  id: string;
  store_id: string;
  name: string;
  capacity: number;
  min_party_size: number;
  location: string | null;
  sort_order: number;
  active: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReservationBusinessHoursRow {
  id: string;
  store_id: string;
  plugin: string;
  day_of_week: number;
  open_time: string;
  close_time: string;
  last_order_min: number;
  slot_minutes: number;
}

export interface PublicStoreInfo {
  id: string;
  slug: string;
  name: string;
  phone: string | null;
  address: string | null;
}
