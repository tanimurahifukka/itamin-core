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
import { createReservation } from './core';
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
}

export async function createCapacityReservation(
  input: CapacityBookingInput,
): Promise<ReservationRow> {
  const remaining = await getRemainingCapacity({
    storeId: input.storeId,
    resourceRef: input.resourceRef,
    capacity: input.capacity,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
  });

  if (remaining < input.partySize) {
    const err = new Error(
      remaining === 0
        ? 'この枠は満席です'
        : `残り ${remaining} 名分しか受け付けられません`,
    );
    (err as Error & { statusCode?: number }).statusCode = 409;
    throw err;
  }

  const result = await createReservation({
    storeId: input.storeId,
    type: input.type,
    source: input.source,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    partySize: input.partySize,
    resourceRef: input.resourceRef,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
    notes: input.notes,
    metadata: input.metadata,
    createdBy: input.createdBy,
  });

  return result.reservation;
}
