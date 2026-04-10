// ============================================================
// Reservation core helpers
// ============================================================
// 全 4 プラグインで共用するユーティリティ。
//  - 確認コード生成 (衝突回避)
//  - 店舗 slug → store 解決 (public routes 用)
//  - customers との upsert
//  - 監査ログ書き込み
//  - 通知キュー投入

import { supabaseAdmin } from '../../config/supabase';
import { normalizePhone } from '../../lib/phone';
import type {
  ReservationRow,
  ReservationSource,
  ReservationType,
  PublicStoreInfo,
} from './types';

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // 紛らわしい 0/1/I/O を除外

export function generateConfirmationCode(): string {
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

export async function allocateConfirmationCode(storeId: string): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = generateConfirmationCode();
    const { data } = await supabaseAdmin
      .from('reservations')
      .select('id')
      .eq('store_id', storeId)
      .eq('confirmation_code', code)
      .maybeSingle();
    if (!data) return code;
  }
  throw new Error('Failed to allocate unique confirmation code');
}

// ------------------------------------------------------------
// Public store resolution (slug → store)
// ------------------------------------------------------------
export async function resolvePublicStoreBySlug(slug: string): Promise<PublicStoreInfo | null> {
  const { data, error } = await supabaseAdmin
    .from('stores')
    .select('id, slug, name, phone, address')
    .eq('slug', slug)
    .maybeSingle();

  if (error || !data) return null;
  return data as PublicStoreInfo;
}

// ------------------------------------------------------------
// Customer upsert (name/phone/email をキーに既存顧客に寄せる)
// ------------------------------------------------------------
export interface CustomerDraft {
  name: string;
  phone?: string | null;
  email?: string | null;
}

export async function upsertCustomerFromReservation(
  storeId: string,
  draft: CustomerDraft,
): Promise<string | null> {
  const normalizedPhone = draft.phone ? normalizePhone(draft.phone) : null;

  // 既存顧客探索: phone 一致を最優先、次に email、最後に name
  if (normalizedPhone) {
    const { data } = await supabaseAdmin
      .from('customers')
      .select('id')
      .eq('store_id', storeId)
      .eq('phone_normalized', normalizedPhone)
      .is('deleted_at', null)
      .maybeSingle();
    if (data) return (data as { id: string }).id;
  }

  if (draft.email) {
    const { data } = await supabaseAdmin
      .from('customers')
      .select('id')
      .eq('store_id', storeId)
      .ilike('email', draft.email)
      .is('deleted_at', null)
      .maybeSingle();
    if (data) return (data as { id: string }).id;
  }

  // 新規作成
  const { data: inserted, error } = await supabaseAdmin
    .from('customers')
    .insert({
      store_id: storeId,
      name: draft.name,
      phone: draft.phone || null,
      phone_normalized: normalizedPhone,
      email: draft.email || null,
      source: 'reservation',
    })
    .select('id')
    .single();

  if (error) {
    console.warn('[reservation] customer upsert failed', error.message);
    return null;
  }
  return (inserted as { id: string }).id;
}

// ------------------------------------------------------------
// Audit log
// ------------------------------------------------------------
export type ReservationLogAction =
  | 'created'
  | 'updated'
  | 'confirmed'
  | 'seated'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'reschedule';

export type ReservationLogActor = 'customer' | 'staff' | 'system';

export async function writeReservationLog(params: {
  reservationId: string;
  action: ReservationLogAction;
  actorType: ReservationLogActor;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabaseAdmin.from('reservation_logs').insert({
    reservation_id: params.reservationId,
    action: params.action,
    actor_type: params.actorType,
    actor_id: params.actorId || null,
    metadata: params.metadata || {},
  });
  if (error) {
    console.warn('[reservation] audit log insert failed', error.message);
  }
}

// ------------------------------------------------------------
// Notification queue
// ------------------------------------------------------------
export type NotificationChannel = 'email' | 'line' | 'sms';
export type NotificationKind = 'confirm' | 'reminder' | 'cancel' | 'modify';

export async function enqueueNotification(params: {
  reservationId: string;
  channel: NotificationChannel;
  kind: NotificationKind;
  recipient: string | null;
  scheduledAt?: Date;
}): Promise<void> {
  const { error } = await supabaseAdmin.from('reservation_notifications').insert({
    reservation_id: params.reservationId,
    channel: params.channel,
    kind: params.kind,
    status: 'pending',
    recipient: params.recipient,
    scheduled_at: (params.scheduledAt || new Date()).toISOString(),
  });
  if (error) {
    console.warn('[reservation] notification enqueue failed', error.message);
  }
}

// ------------------------------------------------------------
// Create reservation (transactional-ish helper)
// ------------------------------------------------------------
export interface CreateReservationInput {
  storeId: string;
  type: ReservationType;
  source: ReservationSource;
  startsAt: Date;
  endsAt: Date;
  partySize: number;
  resourceRef?: string | null;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
  createdBy?: string | null;
}

export interface CreateReservationResult {
  reservation: ReservationRow;
  customerId: string | null;
}

export async function createReservation(
  input: CreateReservationInput,
): Promise<CreateReservationResult> {
  const code = await allocateConfirmationCode(input.storeId);
  const customerId = await upsertCustomerFromReservation(input.storeId, {
    name: input.customerName,
    phone: input.customerPhone,
    email: input.customerEmail,
  });

  const { data, error } = await supabaseAdmin
    .from('reservations')
    .insert({
      store_id: input.storeId,
      customer_id: customerId,
      reservation_type: input.type,
      status: 'confirmed',
      starts_at: input.startsAt.toISOString(),
      ends_at: input.endsAt.toISOString(),
      party_size: input.partySize,
      resource_ref: input.resourceRef || null,
      source: input.source,
      confirmation_code: code,
      customer_name: input.customerName,
      customer_phone: input.customerPhone || null,
      customer_email: input.customerEmail || null,
      notes: input.notes || null,
      metadata: input.metadata || {},
      created_by: input.createdBy || null,
    })
    .select('*')
    .single();

  if (error) {
    // Exclusion constraint violation = double booking
    if (error.code === '23P01') {
      const err = new Error('この時間帯は既に予約が入っています');
      (err as Error & { statusCode?: number }).statusCode = 409;
      throw err;
    }
    throw new Error(error.message);
  }

  const reservation = data as ReservationRow;

  await writeReservationLog({
    reservationId: reservation.id,
    action: 'created',
    actorType: input.source === 'admin' ? 'staff' : 'customer',
    actorId: input.createdBy || null,
    metadata: { source: input.source },
  });

  if (input.customerEmail) {
    await enqueueNotification({
      reservationId: reservation.id,
      channel: 'email',
      kind: 'confirm',
      recipient: input.customerEmail,
    });
  }

  return { reservation, customerId };
}

// ------------------------------------------------------------
// Cancel reservation
// ------------------------------------------------------------
export async function cancelReservation(params: {
  reservationId: string;
  reason?: string;
  actorType: ReservationLogActor;
  actorId?: string | null;
}): Promise<ReservationRow> {
  const { data, error } = await supabaseAdmin
    .from('reservations')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_reason: params.reason || null,
    })
    .eq('id', params.reservationId)
    .select('*')
    .single();

  if (error) throw new Error(error.message);

  const reservation = data as ReservationRow;

  await writeReservationLog({
    reservationId: reservation.id,
    action: 'cancelled',
    actorType: params.actorType,
    actorId: params.actorId || null,
    metadata: { reason: params.reason || null },
  });

  if (reservation.customer_email) {
    await enqueueNotification({
      reservationId: reservation.id,
      channel: 'email',
      kind: 'cancel',
      recipient: reservation.customer_email,
    });
  }

  return reservation;
}
