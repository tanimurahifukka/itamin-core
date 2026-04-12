// ============================================================
// Capacity-based reservation helper
// ============================================================
// timeslot / school / event の 3 プラグインは同じ仕組みで動く:
//  - 1 つの resource_ref (timeslot / session / event) に対する
//    "残キャパ = capacity − 既存予約の party_size 合計"
//  - 残キャパが party_size 以上なら予約可能
//
// 厳密には count → insert 間に小さな race があるが、MVP 許容。
// 将来的には DB 関数 + トランザクション化を検討する。

import { supabaseAdmin } from '../../config/supabase';
import {
  allocateConfirmationCode,
  upsertCustomerFromReservation,
  writeReservationLog,
  enqueueNotification,
} from './core';
import type { ReservationRow, ReservationType, ReservationSource } from './types';

export async function getBookedPartySize(
  storeId: string,
  resourceRef: string,
  startsAt: Date,
  endsAt: Date,
): Promise<number> {
  const { data } = await supabaseAdmin
    .from('reservations')
    .select('party_size')
    .eq('store_id', storeId)
    .eq('resource_ref', resourceRef)
    .in('status', ['pending', 'confirmed', 'seated'])
    .lt('starts_at', endsAt.toISOString())
    .gt('ends_at', startsAt.toISOString());

  return ((data || []) as Array<{ party_size: number }>).reduce(
    (sum, r) => sum + (r.party_size || 0),
    0,
  );
}

export async function getRemainingCapacity(params: {
  storeId: string;
  resourceRef: string;
  capacity: number;
  startsAt: Date;
  endsAt: Date;
}): Promise<number> {
  const booked = await getBookedPartySize(
    params.storeId,
    params.resourceRef,
    params.startsAt,
    params.endsAt,
  );
  return Math.max(0, params.capacity - booked);
}

export interface CapacityBookingInput {
  storeId: string;
  type: ReservationType;
  source: ReservationSource;
  resourceRef: string;
  capacity: number;
  startsAt: Date;
  endsAt: Date;
  partySize: number;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
  createdBy?: string | null;
  sendConfirmationEmail?: boolean;
}

export async function createCapacityReservation(
  input: CapacityBookingInput,
): Promise<ReservationRow> {
  const code = await allocateConfirmationCode(input.storeId);
  const customerId = await upsertCustomerFromReservation(input.storeId, {
    name: input.customerName,
    phone: input.customerPhone,
    email: input.customerEmail,
  });

  const { data, error } = await supabaseAdmin.rpc('reserve_with_capacity_check', {
    p_store_id: input.storeId,
    p_resource_ref: input.resourceRef,
    p_capacity: input.capacity,
    p_starts_at: input.startsAt.toISOString(),
    p_ends_at: input.endsAt.toISOString(),
    p_party_size: input.partySize,
    p_type: input.type,
    p_source: input.source,
    p_confirmation_code: code,
    p_customer_id: customerId,
    p_customer_name: input.customerName,
    p_customer_phone: input.customerPhone || null,
    p_customer_email: input.customerEmail || null,
    p_notes: input.notes || null,
    p_metadata: input.metadata || {},
    p_created_by: input.createdBy || null,
  });

  if (error) {
    if (error.message.includes('満席') || error.message.includes('残り')) {
      const err = new Error(error.message);
      (err as Error & { statusCode?: number }).statusCode = 409;
      throw err;
    }
    throw new Error(error.message);
  }

  const reservationId = data as string;

  // Fetch the full reservation row
  const { data: reservation, error: fetchErr } = await supabaseAdmin
    .from('reservations')
    .select('*')
    .eq('id', reservationId)
    .single();
  if (fetchErr || !reservation) throw new Error('Failed to fetch created reservation');

  const row = reservation as ReservationRow;

  // Audit log
  await writeReservationLog({
    reservationId: row.id,
    action: 'created',
    actorType: input.source === 'admin' ? 'staff' : 'customer',
    actorId: input.createdBy || null,
    metadata: { source: input.source },
  });

  // Notification
  if (input.customerEmail && input.sendConfirmationEmail !== false) {
    await enqueueNotification({
      reservationId: row.id,
      channel: 'email',
      kind: 'confirm',
      recipient: input.customerEmail,
    });
  }

  return row;
}
