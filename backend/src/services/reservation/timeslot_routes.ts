// ============================================================
// Timeslot reservation routes (admin + public)
// ============================================================
// 時間帯予約: 曜日 × 時刻で定義されたスロットに定員ベースで予約する。
// 例: ランチ A (平日 12:00-13:30, 定員 20)

import { Router, Request, Response } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireStoreMembership, requireManagedStore } from '../../auth/authorization';
import { supabaseAdmin } from '../../config/supabase';
import { resolvePublicStoreBySlug, cancelReservation } from './core';
import { createCapacityReservation, getRemainingCapacity } from './capacity';
import { rateLimit } from './rate_limit';
import { getEffectiveHours } from '../calendar/resolver';

interface TimeslotRow {
  id: string;
  store_id: string;
  name: string;
  description: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  capacity: number;
  price: number | null;
  active: boolean;
  sort_order: number;
}

// ============================================================
// Admin router: /api/reservation/timeslot
// ============================================================
export const timeslotAdminRouter = Router();

timeslotAdminRouter.get(
  '/:storeId/timeslots',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const { data, error } = await supabaseAdmin
      .from('reservation_timeslots')
      .select('*')
      .eq('store_id', storeId)
      .order('sort_order')
      .order('start_time');

    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json({ timeslots: data });
  },
);

timeslotAdminRouter.post(
  '/:storeId/timeslots',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const body = req.body as Partial<TimeslotRow>;
    if (!body.name || !body.start_time || !body.end_time || !body.capacity) {
      res.status(400).json({ error: 'name / start_time / end_time / capacity は必須です' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('reservation_timeslots')
      .insert({
        store_id: storeId,
        name: body.name,
        description: body.description || null,
        day_of_week: body.day_of_week ?? -1,
        start_time: body.start_time,
        end_time: body.end_time,
        capacity: body.capacity,
        price: body.price ?? null,
        active: body.active ?? true,
        sort_order: body.sort_order ?? 0,
      })
      .select('*')
      .single();

    if (error) { res.status(400).json({ error: error.message }); return; }
    res.status(201).json({ timeslot: data });
  },
);

timeslotAdminRouter.patch(
  '/:storeId/timeslots/:id',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const id = String(req.params.id);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const body = req.body as Partial<TimeslotRow>;
    const patch: Record<string, unknown> = {};
    for (const k of ['name', 'description', 'day_of_week', 'start_time', 'end_time', 'capacity', 'price', 'active', 'sort_order'] as const) {
      if (k in body) patch[k] = (body as Record<string, unknown>)[k];
    }

    const { data, error } = await supabaseAdmin
      .from('reservation_timeslots')
      .update(patch)
      .eq('id', id)
      .eq('store_id', storeId)
      .select('*')
      .single();

    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json({ timeslot: data });
  },
);

timeslotAdminRouter.delete(
  '/:storeId/timeslots/:id',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const id = String(req.params.id);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const { error } = await supabaseAdmin
      .from('reservation_timeslots')
      .delete()
      .eq('id', id)
      .eq('store_id', storeId);
    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json({ ok: true });
  },
);

// 予約一覧 (timeslot 型のみ)
timeslotAdminRouter.get(
  '/:storeId/reservations',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;

    let q = supabaseAdmin
      .from('reservations')
      .select('*')
      .eq('store_id', storeId)
      .eq('reservation_type', 'timeslot')
      .order('starts_at', { ascending: true });
    if (from) q = q.gte('starts_at', from.toISOString());
    if (to) q = q.lte('starts_at', to.toISOString());

    const { data, error } = await q;
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json({ reservations: data });
  },
);

timeslotAdminRouter.post(
  '/:storeId/reservations/:reservationId/cancel',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const reservationId = String(req.params.reservationId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    try {
      // store_id を先に確認してから cancel する (cancel-after-check 脆弱性の修正)
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from('reservations')
        .select('store_id')
        .eq('id', reservationId)
        .single();
      if (fetchError || !existing) {
        res.status(404).json({ error: '予約が見つかりません' });
        return;
      }
      if (existing.store_id !== storeId) {
        res.status(403).json({ error: 'この予約は別店舗のものです' });
        return;
      }
      const reservation = await cancelReservation({
        reservationId,
        reason: (req.body as { reason?: string })?.reason,
        actorType: 'staff',
        actorId: req.user!.id,
      });
      res.json({ reservation });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  },
);

// ============================================================
// Public router: mounted under /api/public/r/:slug/timeslot
// ============================================================
export const timeslotPublicRouter = Router({ mergeParams: true });

// 指定日のスロット一覧 + 残席
timeslotPublicRouter.get('/availability', async (req: Request, res: Response) => {
  const slug = String((req.params as { slug: string }).slug);
  const dateStr = String(req.query.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    res.status(400).json({ error: 'date=YYYY-MM-DD が必要です' });
    return;
  }

  const store = await resolvePublicStoreBySlug(slug);
  if (!store) { res.status(404).json({ error: '店舗が見つかりません' }); return; }

  const { data: plugin } = await supabaseAdmin
    .from('store_plugins')
    .select('enabled')
    .eq('store_id', store.id)
    .eq('plugin_name', 'reservation_timeslot')
    .maybeSingle();
  if (!plugin || !(plugin as { enabled: boolean }).enabled) {
    res.status(404).json({ error: '時間帯予約は受け付けていません' });
    return;
  }

  const targetDate = new Date(dateStr + 'T00:00:00+09:00');
  const dow = targetDate.getDay();

  // 営業時間 (unified calendar)
  const effective = await getEffectiveHours(store.id, dateStr);

  if (!effective.isOpen) {
    const reason = effective.kind === 'holiday' ? '定休日' : '休業日';
    res.json({ slots: [], reason });
    return;
  }

  // 該当曜日のスロット
  const { data: slots } = await supabaseAdmin
    .from('reservation_timeslots')
    .select('*')
    .eq('store_id', store.id)
    .eq('active', true)
    .or(`day_of_week.eq.${dow},day_of_week.eq.-1`);

  const results = [] as Array<{
    id: string;
    name: string;
    description: string | null;
    starts_at: string;
    ends_at: string;
    capacity: number;
    remaining: number;
    price: number | null;
  }>;

  for (const s of (slots || []) as TimeslotRow[]) {
    const starts = new Date(`${dateStr}T${s.start_time}+09:00`);
    const ends = new Date(`${dateStr}T${s.end_time}+09:00`);
    if (starts < new Date()) continue;

    const remaining = await getRemainingCapacity({
      storeId: store.id,
      resourceRef: s.id,
      capacity: s.capacity,
      startsAt: starts,
      endsAt: ends,
    });

    results.push({
      id: s.id,
      name: s.name,
      description: s.description,
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      capacity: s.capacity,
      remaining,
      price: s.price,
    });
  }

  res.json({ slots: results });
});

timeslotPublicRouter.post(
  '/reservations',
  rateLimit({ action: 'public.timeslot.create', windowSec: 60, max: 5 }),
  async (req: Request, res: Response) => {
    const slug = String((req.params as { slug: string }).slug);
    const body = req.body as {
      timeslot_id?: string;
      date?: string;
      party_size?: number;
      customer_name?: string;
      customer_phone?: string;
      customer_email?: string;
      notes?: string;
    };

    if (!body.timeslot_id || !body.date || !body.party_size || !body.customer_name || !body.customer_email) {
      res.status(400).json({ error: '必須項目が不足しています' });
      return;
    }

    const store = await resolvePublicStoreBySlug(slug);
    if (!store) { res.status(404).json({ error: '店舗が見つかりません' }); return; }

    const { data: timeslot } = await supabaseAdmin
      .from('reservation_timeslots')
      .select('*')
      .eq('id', body.timeslot_id)
      .eq('store_id', store.id)
      .maybeSingle();

    if (!timeslot || !(timeslot as TimeslotRow).active) {
      res.status(404).json({ error: 'スロットが見つかりません' });
      return;
    }

    const ts = timeslot as TimeslotRow;
    const startsAt = new Date(`${body.date}T${ts.start_time}+09:00`);
    const endsAt = new Date(`${body.date}T${ts.end_time}+09:00`);

    if (startsAt < new Date()) {
      res.status(400).json({ error: '過去の日時は予約できません' });
      return;
    }
    // 曜日チェック
    if (ts.day_of_week !== -1 && ts.day_of_week !== startsAt.getDay()) {
      res.status(400).json({ error: 'この曜日は対象外です' });
      return;
    }

    try {
      const reservation = await createCapacityReservation({
        storeId: store.id,
        type: 'timeslot',
        source: 'web',
        resourceRef: ts.id,
        capacity: ts.capacity,
        startsAt,
        endsAt,
        partySize: body.party_size,
        customerName: body.customer_name,
        customerPhone: body.customer_phone || null,
        customerEmail: body.customer_email,
        notes: body.notes || null,
        metadata: { timeslot_name: ts.name },
      });
      res.status(201).json({
        reservation: {
          id: reservation.id,
          confirmation_code: reservation.confirmation_code,
          starts_at: reservation.starts_at,
          ends_at: reservation.ends_at,
          party_size: reservation.party_size,
        },
      });
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      res.status(e.statusCode || 500).json({ error: e.message });
    }
  },
);
