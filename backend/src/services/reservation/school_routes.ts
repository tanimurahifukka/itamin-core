// ============================================================
// School reservation routes (admin + public)
// ============================================================
// スクール/コース予約: 親コース + 開催セッション(日時)の 2 階層。
// reservation.resource_ref = session_id, metadata に school_id を格納。

import { Router, Request, Response } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireStoreMembership, requireManagedStore } from '../../auth/authorization';
import { supabaseAdmin } from '../../config/supabase';
import { resolvePublicStoreBySlug, cancelReservation } from './core';
import { createCapacityReservation, getRemainingCapacity } from './capacity';
import { rateLimit } from './rate_limit';

interface SchoolRow {
  id: string;
  store_id: string;
  name: string;
  description: string | null;
  instructor: string | null;
  capacity: number;
  price: number | null;
  image_url: string | null;
  active: boolean;
  sort_order: number;
}

interface SchoolSessionRow {
  id: string;
  school_id: string;
  store_id: string;
  starts_at: string;
  ends_at: string;
  capacity_override: number | null;
  status: 'scheduled' | 'cancelled' | 'completed';
  note: string | null;
}

// ============================================================
// Admin router: /api/reservation/school
// ============================================================
export const schoolAdminRouter = Router();

// ── コース CRUD ───────────────────────────────────────────
schoolAdminRouter.get(
  '/:storeId/schools',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const { data, error } = await supabaseAdmin
      .from('reservation_schools')
      .select('*')
      .eq('store_id', storeId)
      .order('sort_order')
      .order('name');
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json({ schools: data });
  },
);

schoolAdminRouter.post(
  '/:storeId/schools',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const body = req.body as Partial<SchoolRow>;
    if (!body.name || !body.capacity) {
      res.status(400).json({ error: 'name / capacity は必須です' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('reservation_schools')
      .insert({
        store_id: storeId,
        name: body.name,
        description: body.description || null,
        instructor: body.instructor || null,
        capacity: body.capacity,
        price: body.price ?? null,
        image_url: body.image_url || null,
        active: body.active ?? true,
        sort_order: body.sort_order ?? 0,
      })
      .select('*')
      .single();
    if (error) { res.status(400).json({ error: error.message }); return; }
    res.status(201).json({ school: data });
  },
);

schoolAdminRouter.patch(
  '/:storeId/schools/:id',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const id = String(req.params.id);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const body = req.body as Partial<SchoolRow>;
    const patch: Record<string, unknown> = {};
    for (const k of ['name', 'description', 'instructor', 'capacity', 'price', 'image_url', 'active', 'sort_order'] as const) {
      if (k in body) patch[k] = (body as Record<string, unknown>)[k];
    }

    const { data, error } = await supabaseAdmin
      .from('reservation_schools')
      .update(patch)
      .eq('id', id)
      .eq('store_id', storeId)
      .select('*')
      .single();
    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json({ school: data });
  },
);

schoolAdminRouter.delete(
  '/:storeId/schools/:id',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const id = String(req.params.id);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const { error } = await supabaseAdmin
      .from('reservation_schools')
      .delete()
      .eq('id', id)
      .eq('store_id', storeId);
    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json({ ok: true });
  },
);

// ── セッション CRUD ───────────────────────────────────────
schoolAdminRouter.get(
  '/:storeId/schools/:schoolId/sessions',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const schoolId = String(req.params.schoolId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const { data, error } = await supabaseAdmin
      .from('reservation_school_sessions')
      .select('*')
      .eq('school_id', schoolId)
      .eq('store_id', storeId)
      .order('starts_at', { ascending: true });
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json({ sessions: data });
  },
);

schoolAdminRouter.post(
  '/:storeId/schools/:schoolId/sessions',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const schoolId = String(req.params.schoolId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const body = req.body as {
      starts_at?: string;
      ends_at?: string;
      capacity_override?: number | null;
      note?: string | null;
    };
    if (!body.starts_at || !body.ends_at) {
      res.status(400).json({ error: 'starts_at / ends_at は必須です' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('reservation_school_sessions')
      .insert({
        school_id: schoolId,
        store_id: storeId,
        starts_at: body.starts_at,
        ends_at: body.ends_at,
        capacity_override: body.capacity_override ?? null,
        note: body.note || null,
      })
      .select('*')
      .single();
    if (error) { res.status(400).json({ error: error.message }); return; }
    res.status(201).json({ session: data });
  },
);

schoolAdminRouter.delete(
  '/:storeId/sessions/:sessionId',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const sessionId = String(req.params.sessionId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const { error } = await supabaseAdmin
      .from('reservation_school_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('store_id', storeId);
    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json({ ok: true });
  },
);

// ── 受講申込一覧 ──────────────────────────────────────────
schoolAdminRouter.get(
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
      .eq('reservation_type', 'school')
      .order('starts_at', { ascending: true });
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json({ reservations: data });
  },
);

schoolAdminRouter.post(
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
// Public router: mounted under /api/public/r/:slug/school
// ============================================================
export const schoolPublicRouter = Router({ mergeParams: true });

// コース一覧 (active なもの + 今後のセッション数)
schoolPublicRouter.get('/courses', async (req: Request, res: Response) => {
  const slug = String((req.params as { slug: string }).slug);
  const store = await resolvePublicStoreBySlug(slug);
  if (!store) { res.status(404).json({ error: '店舗が見つかりません' }); return; }

  const { data: plugin } = await supabaseAdmin
    .from('store_plugins')
    .select('enabled')
    .eq('store_id', store.id)
    .eq('plugin_name', 'reservation_school')
    .maybeSingle();
  if (!plugin || !(plugin as { enabled: boolean }).enabled) {
    res.status(404).json({ error: 'スクール予約は受け付けていません' });
    return;
  }

  const { data: schools } = await supabaseAdmin
    .from('reservation_schools')
    .select('*')
    .eq('store_id', store.id)
    .eq('active', true)
    .order('sort_order');

  res.json({ courses: schools || [] });
});

// コースの upcoming セッション + 各残席
schoolPublicRouter.get('/courses/:schoolId/sessions', async (req: Request, res: Response) => {
  const slug = String((req.params as { slug: string }).slug);
  const schoolId = String(req.params.schoolId);
  const store = await resolvePublicStoreBySlug(slug);
  if (!store) { res.status(404).json({ error: '店舗が見つかりません' }); return; }

  const { data: school } = await supabaseAdmin
    .from('reservation_schools')
    .select('*')
    .eq('id', schoolId)
    .eq('store_id', store.id)
    .eq('active', true)
    .maybeSingle();
  if (!school) { res.status(404).json({ error: 'コースが見つかりません' }); return; }
  const s = school as SchoolRow;

  const { data: sessions } = await supabaseAdmin
    .from('reservation_school_sessions')
    .select('*')
    .eq('school_id', schoolId)
    .eq('store_id', store.id)
    .eq('status', 'scheduled')
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true });

  const results = [] as Array<{
    id: string;
    starts_at: string;
    ends_at: string;
    capacity: number;
    remaining: number;
    note: string | null;
  }>;

  for (const sess of (sessions || []) as SchoolSessionRow[]) {
    const capacity = sess.capacity_override ?? s.capacity;
    const remaining = await getRemainingCapacity({
      storeId: store.id,
      resourceRef: sess.id,
      capacity,
      startsAt: new Date(sess.starts_at),
      endsAt: new Date(sess.ends_at),
    });
    results.push({
      id: sess.id,
      starts_at: sess.starts_at,
      ends_at: sess.ends_at,
      capacity,
      remaining,
      note: sess.note,
    });
  }

  res.json({ course: s, sessions: results });
});

schoolPublicRouter.post(
  '/reservations',
  rateLimit({ action: 'public.school.create', windowSec: 60, max: 5 }),
  async (req: Request, res: Response) => {
    const slug = String((req.params as { slug: string }).slug);
    const body = req.body as {
      session_id?: string;
      party_size?: number;
      customer_name?: string;
      customer_phone?: string;
      customer_email?: string;
      notes?: string;
    };
    if (!body.session_id || !body.party_size || !body.customer_name || !body.customer_email) {
      res.status(400).json({ error: '必須項目が不足しています' });
      return;
    }

    const store = await resolvePublicStoreBySlug(slug);
    if (!store) { res.status(404).json({ error: '店舗が見つかりません' }); return; }

    const { data: session } = await supabaseAdmin
      .from('reservation_school_sessions')
      .select('*')
      .eq('id', body.session_id)
      .eq('store_id', store.id)
      .eq('status', 'scheduled')
      .maybeSingle();
    if (!session) { res.status(404).json({ error: 'セッションが見つかりません' }); return; }
    const sess = session as SchoolSessionRow;

    const { data: school } = await supabaseAdmin
      .from('reservation_schools')
      .select('*')
      .eq('id', sess.school_id)
      .eq('active', true)
      .maybeSingle();
    if (!school) { res.status(404).json({ error: 'コースが見つかりません' }); return; }
    const s = school as SchoolRow;

    const startsAt = new Date(sess.starts_at);
    const endsAt = new Date(sess.ends_at);
    if (startsAt < new Date()) {
      res.status(400).json({ error: '過去のセッションは予約できません' });
      return;
    }

    try {
      const reservation = await createCapacityReservation({
        storeId: store.id,
        type: 'school',
        source: 'web',
        resourceRef: sess.id,
        capacity: sess.capacity_override ?? s.capacity,
        startsAt,
        endsAt,
        partySize: body.party_size,
        customerName: body.customer_name,
        customerPhone: body.customer_phone || null,
        customerEmail: body.customer_email,
        notes: body.notes || null,
        metadata: { school_id: s.id, school_name: s.name },
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
