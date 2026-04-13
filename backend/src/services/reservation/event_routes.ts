// ============================================================
// Event reservation routes (admin + public)
// ============================================================
// 単発イベント予約: 貸切パーティ、ライブ、ワイン会など。
// reservation.resource_ref = event_id。

import { Router, Request, Response } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireStoreMembership, requireManagedStore } from '../../auth/authorization';
import { supabaseAdmin } from '../../config/supabase';
import { resolvePublicStoreBySlug, cancelReservation } from './core';
import { createCapacityReservation, getRemainingCapacity } from './capacity';
import { rateLimit } from './rate_limit';

interface EventRow {
  id: string;
  store_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  capacity: number;
  price: number | null;
  image_url: string | null;
  status: 'draft' | 'published' | 'cancelled' | 'completed';
  sort_order: number;
}

// ============================================================
// Admin router: /api/reservation/event
// ============================================================
export const eventAdminRouter = Router();

eventAdminRouter.get(
  '/:storeId/events',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const { data, error } = await supabaseAdmin
      .from('reservation_events')
      .select('*')
      .eq('store_id', storeId)
      .order('starts_at', { ascending: false });
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json({ events: data });
  },
);

eventAdminRouter.post(
  '/:storeId/events',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const body = req.body as Partial<EventRow>;
    if (!body.title || !body.starts_at || !body.ends_at || !body.capacity) {
      res.status(400).json({ error: 'title / starts_at / ends_at / capacity は必須です' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('reservation_events')
      .insert({
        store_id: storeId,
        title: body.title,
        description: body.description || null,
        starts_at: body.starts_at,
        ends_at: body.ends_at,
        capacity: body.capacity,
        price: body.price ?? null,
        image_url: body.image_url || null,
        status: body.status || 'published',
        sort_order: body.sort_order ?? 0,
      })
      .select('*')
      .single();
    if (error) { res.status(400).json({ error: error.message }); return; }
    res.status(201).json({ event: data });
  },
);

eventAdminRouter.patch(
  '/:storeId/events/:id',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const id = String(req.params.id);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const body = req.body as Partial<EventRow>;
    const patch: Record<string, unknown> = {};
    for (const k of [
      'title', 'description', 'starts_at', 'ends_at', 'capacity',
      'price', 'image_url', 'status', 'sort_order',
    ] as const) {
      if (k in body) patch[k] = (body as Record<string, unknown>)[k];
    }

    const { data, error } = await supabaseAdmin
      .from('reservation_events')
      .update(patch)
      .eq('id', id)
      .eq('store_id', storeId)
      .select('*')
      .single();
    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json({ event: data });
  },
);

eventAdminRouter.delete(
  '/:storeId/events/:id',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const id = String(req.params.id);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const { error } = await supabaseAdmin
      .from('reservation_events')
      .delete()
      .eq('id', id)
      .eq('store_id', storeId);
    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json({ ok: true });
  },
);

// イベント単位の予約一覧
eventAdminRouter.get(
  '/:storeId/events/:eventId/reservations',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const eventId = String(req.params.eventId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const { data, error } = await supabaseAdmin
      .from('reservations')
      .select('*')
      .eq('store_id', storeId)
      .eq('reservation_type', 'event')
      .eq('resource_ref', eventId)
      .order('created_at', { ascending: true });
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json({ reservations: data });
  },
);

// 管理者によるイベント予約作成
eventAdminRouter.post(
  '/:storeId/events/:eventId/reservations',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const eventId = String(req.params.eventId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const body = req.body as {
      party_size?: number;
      customer_name?: string;
      customer_phone?: string;
      customer_email?: string;
      notes?: string;
    };
    if (!body.party_size || !body.customer_name) {
      res.status(400).json({ error: 'party_size / customer_name は必須です' });
      return;
    }

    const { data: event } = await supabaseAdmin
      .from('reservation_events')
      .select('*')
      .eq('id', eventId)
      .eq('store_id', storeId)
      .maybeSingle();
    if (!event) { res.status(404).json({ error: 'イベントが見つかりません' }); return; }
    const ev = event as EventRow;

    try {
      const reservation = await createCapacityReservation({
        storeId,
        type: 'event',
        source: 'admin',
        resourceRef: ev.id,
        capacity: ev.capacity,
        startsAt: new Date(ev.starts_at),
        endsAt: new Date(ev.ends_at),
        partySize: body.party_size,
        customerName: body.customer_name,
        customerPhone: body.customer_phone || null,
        customerEmail: body.customer_email || null,
        notes: body.notes || null,
        metadata: { event_id: ev.id, event_title: ev.title },
        createdBy: req.user!.id,
      });
      res.status(201).json({ reservation });
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      res.status(e.statusCode || 500).json({ error: e.message });
    }
  },
);

// 予約ステータス更新
eventAdminRouter.patch(
  '/:storeId/reservations/:reservationId',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const reservationId = String(req.params.reservationId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const body = req.body as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const key of [
      'status', 'party_size', 'customer_name', 'customer_phone',
      'customer_email', 'notes', 'internal_notes',
    ] as const) {
      if (key in body) patch[key] = body[key];
    }

    const { data, error } = await supabaseAdmin
      .from('reservations')
      .update(patch)
      .eq('id', reservationId)
      .eq('store_id', storeId)
      .eq('reservation_type', 'event')
      .select('*')
      .single();
    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json({ reservation: data });
  },
);

// 予約一覧 (全イベント)
eventAdminRouter.get(
  '/:storeId/reservations',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const { data, error } = await supabaseAdmin
      .from('reservations')
      .select('*')
      .eq('store_id', storeId)
      .eq('reservation_type', 'event')
      .order('starts_at', { ascending: false });
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json({ reservations: data });
  },
);

eventAdminRouter.post(
  '/:storeId/reservations/:reservationId/cancel',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const reservationId = String(req.params.reservationId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    try {
      const reservation = await cancelReservation({
        reservationId,
        reason: (req.body as { reason?: string })?.reason,
        actorType: 'staff',
        actorId: req.user!.id,
      });
      if (reservation.store_id !== storeId) {
        res.status(403).json({ error: 'この予約は別店舗のものです' });
        return;
      }
      res.json({ reservation });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  },
);

// ============================================================
// Public router: mounted under /api/public/r/:slug/event
// ============================================================
export const eventPublicRouter = Router({ mergeParams: true });

// 開催予定イベント一覧 + 残席
eventPublicRouter.get('/events', async (req: Request, res: Response) => {
  const slug = String((req.params as { slug: string }).slug);
  const store = await resolvePublicStoreBySlug(slug);
  if (!store) { res.status(404).json({ error: '店舗が見つかりません' }); return; }

  const { data: plugin } = await supabaseAdmin
    .from('store_plugins')
    .select('enabled')
    .eq('store_id', store.id)
    .eq('plugin_name', 'reservation_event')
    .maybeSingle();
  if (!plugin || !(plugin as { enabled: boolean }).enabled) {
    res.status(404).json({ error: 'イベント予約は受け付けていません' });
    return;
  }

  const { data: events } = await supabaseAdmin
    .from('reservation_events')
    .select('*')
    .eq('store_id', store.id)
    .eq('status', 'published')
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true });

  const results = [] as Array<{
    id: string;
    title: string;
    description: string | null;
    starts_at: string;
    ends_at: string;
    capacity: number;
    remaining: number;
    price: number | null;
    image_url: string | null;
  }>;

  for (const ev of (events || []) as EventRow[]) {
    const remaining = await getRemainingCapacity({
      storeId: store.id,
      resourceRef: ev.id,
      capacity: ev.capacity,
      startsAt: new Date(ev.starts_at),
      endsAt: new Date(ev.ends_at),
    });
    results.push({
      id: ev.id,
      title: ev.title,
      description: ev.description,
      starts_at: ev.starts_at,
      ends_at: ev.ends_at,
      capacity: ev.capacity,
      remaining,
      price: ev.price,
      image_url: ev.image_url,
    });
  }

  res.json({ events: results });
});

eventPublicRouter.post(
  '/reservations',
  rateLimit({ action: 'public.event.create', windowSec: 60, max: 5 }),
  async (req: Request, res: Response) => {
    const slug = String((req.params as { slug: string }).slug);
    const body = req.body as {
      event_id?: string;
      party_size?: number;
      customer_name?: string;
      customer_phone?: string;
      customer_email?: string;
      notes?: string;
    };
    if (!body.event_id || !body.party_size || !body.customer_name || !body.customer_email) {
      res.status(400).json({ error: '必須項目が不足しています' });
      return;
    }

    const store = await resolvePublicStoreBySlug(slug);
    if (!store) { res.status(404).json({ error: '店舗が見つかりません' }); return; }

    const { data: event } = await supabaseAdmin
      .from('reservation_events')
      .select('*')
      .eq('id', body.event_id)
      .eq('store_id', store.id)
      .eq('status', 'published')
      .maybeSingle();
    if (!event) { res.status(404).json({ error: 'イベントが見つかりません' }); return; }
    const ev = event as EventRow;

    const startsAt = new Date(ev.starts_at);
    const endsAt = new Date(ev.ends_at);
    if (startsAt < new Date()) {
      res.status(400).json({ error: '過去のイベントは予約できません' });
      return;
    }

    try {
      const reservation = await createCapacityReservation({
        storeId: store.id,
        type: 'event',
        source: 'web',
        resourceRef: ev.id,
        capacity: ev.capacity,
        startsAt,
        endsAt,
        partySize: body.party_size,
        customerName: body.customer_name,
        customerPhone: body.customer_phone || null,
        customerEmail: body.customer_email,
        notes: body.notes || null,
        metadata: { event_id: ev.id, event_title: ev.title },
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
