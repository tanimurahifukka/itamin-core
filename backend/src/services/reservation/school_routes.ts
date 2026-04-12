// ============================================================
// School reservation routes (admin + public)
// ============================================================
// スクール/コース予約: 親コース + 開催セッション(日時)の 2 階層。
// reservation.resource_ref = session_id, metadata に school_id を格納。

import { Router, Request, Response } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireStoreMembership, requireManagedStore } from '../../auth/authorization';
import { supabaseAdmin } from '../../config/supabase';
import { resolvePublicStoreBySlug, cancelReservation, writeReservationLog } from './core';
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

    // BUG-3: Check for active reservations on any session of this course
    const { data: sessionIds } = await supabaseAdmin
      .from('reservation_school_sessions')
      .select('id')
      .eq('school_id', id)
      .eq('store_id', storeId);
    if (sessionIds && sessionIds.length > 0) {
      const refs = (sessionIds as { id: string }[]).map((s) => s.id);
      const { count } = await supabaseAdmin
        .from('reservations')
        .select('id', { count: 'exact', head: true })
        .eq('store_id', storeId)
        .in('resource_ref', refs)
        .in('status', ['pending', 'confirmed', 'seated']);
      if (count && count > 0) {
        res.status(400).json({ error: `このコースには ${count} 件のアクティブな予約があります。先に予約をキャンセルしてください` });
        return;
      }
    }

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

// ── セッション一括作成 (FE-5) ────────────────────────────────
schoolAdminRouter.post(
  '/:storeId/schools/:schoolId/sessions/bulk',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const schoolId = String(req.params.schoolId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const body = req.body as {
      start_date?: string; // YYYY-MM-DD
      end_date?: string;   // YYYY-MM-DD
      days_of_week?: number[]; // 0=Sun..6=Sat
      start_time?: string; // HH:MM
      end_time?: string;   // HH:MM
      capacity_override?: number | null;
      note?: string | null;
    };

    if (!body.start_date || !body.end_date || !body.days_of_week?.length || !body.start_time || !body.end_time) {
      res.status(400).json({ error: '開始日・終了日・曜日・時間は必須です' });
      return;
    }

    const startDate = new Date(body.start_date + 'T00:00:00');
    const endDate = new Date(body.end_date + 'T00:00:00');
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate < startDate) {
      res.status(400).json({ error: '日付範囲が不正です' });
      return;
    }

    // Generate sessions for matching days
    const rows: Array<{
      school_id: string;
      store_id: string;
      starts_at: string;
      ends_at: string;
      capacity_override: number | null;
      note: string | null;
    }> = [];

    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      if (body.days_of_week.includes(cursor.getDay())) {
        const [sh, sm] = body.start_time.split(':').map(Number);
        const [eh, em] = body.end_time.split(':').map(Number);
        const starts = new Date(cursor);
        starts.setHours(sh, sm, 0, 0);
        const ends = new Date(cursor);
        ends.setHours(eh, em, 0, 0);
        if (ends > starts) {
          rows.push({
            school_id: schoolId,
            store_id: storeId,
            starts_at: starts.toISOString(),
            ends_at: ends.toISOString(),
            capacity_override: body.capacity_override ?? null,
            note: body.note || null,
          });
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    if (rows.length === 0) {
      res.status(400).json({ error: '該当する日程がありません' });
      return;
    }
    if (rows.length > 100) {
      res.status(400).json({ error: '一括作成は100件までです' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('reservation_school_sessions')
      .insert(rows)
      .select('*');
    if (error) { res.status(400).json({ error: error.message }); return; }
    res.status(201).json({ sessions: data, count: (data || []).length });
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

    // BUG-2: Check for active reservations before deleting
    const { count } = await supabaseAdmin
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .eq('resource_ref', sessionId)
      .in('status', ['pending', 'confirmed', 'seated']);
    if (count && count > 0) {
      res.status(400).json({ error: `このセッションには ${count} 件のアクティブな予約があります。先に予約をキャンセルしてください` });
      return;
    }

    const { error } = await supabaseAdmin
      .from('reservation_school_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('store_id', storeId);
    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json({ ok: true });
  },
);

// ── セッション別予約者一覧 (FE-3) ──────────────────────────────
schoolAdminRouter.get(
  '/:storeId/sessions/:sessionId/reservations',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const sessionId = String(req.params.sessionId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const { data, error } = await supabaseAdmin
      .from('reservations')
      .select('*')
      .eq('store_id', storeId)
      .eq('resource_ref', sessionId)
      .eq('reservation_type', 'school')
      .order('created_at', { ascending: true });
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json({ reservations: data || [] });
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

// ── セッションステータス変更 (UX-2) ────────────────────────
schoolAdminRouter.patch(
  '/:storeId/sessions/:sessionId',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const sessionId = String(req.params.sessionId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const { status } = req.body as { status?: string };
    if (!status || !['scheduled', 'cancelled', 'completed'].includes(status)) {
      res.status(400).json({ error: 'status は scheduled / cancelled / completed のいずれかです' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('reservation_school_sessions')
      .update({ status })
      .eq('id', sessionId)
      .eq('store_id', storeId)
      .select('*')
      .single();
    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json({ session: data });
  },
);

// ── 予約ステータス変更 (FE-2 + CRM-2) ──────────────────────
schoolAdminRouter.patch(
  '/:storeId/reservations/:reservationId',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const reservationId = String(req.params.reservationId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const { status } = req.body as { status?: string };
    if (!status || !['confirmed', 'completed', 'no_show'].includes(status)) {
      res.status(400).json({ error: 'status は confirmed / completed / no_show のいずれかです' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('reservations')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', reservationId)
      .eq('store_id', storeId)
      .eq('reservation_type', 'school')
      .select('*')
      .single();
    if (error) { res.status(400).json({ error: error.message }); return; }
    if (!data) { res.status(404).json({ error: '予約が見つかりません' }); return; }

    const reservation = data as import('./types').ReservationRow;

    // Audit log
    await writeReservationLog({
      reservationId: reservation.id,
      action: status as 'completed' | 'no_show' | 'confirmed',
      actorType: 'staff',
      actorId: req.user!.id,
    });

    // CRM-2: Update customer visit_count when completed
    if (status === 'completed' && reservation.customer_id) {
      await supabaseAdmin.rpc('increment_customer_visit', {
        p_customer_id: reservation.customer_id,
      });
    }

    res.json({ reservation });
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

  // Include plugin settings for frontend (require_phone, accept_days_ahead)
  const { data: pluginRow } = await supabaseAdmin
    .from('store_plugins')
    .select('config')
    .eq('store_id', store.id)
    .eq('plugin_name', 'reservation_school')
    .maybeSingle();
  const pluginConfig = ((pluginRow as { config: Record<string, unknown> | null } | null)?.config || {}) as Record<string, unknown>;

  res.json({
    courses: schools || [],
    settings: {
      require_phone: pluginConfig.require_phone === true,
      accept_days_ahead: typeof pluginConfig.accept_days_ahead === 'number' ? pluginConfig.accept_days_ahead : 60,
    },
  });
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

    // BUG-1: Fetch plugin config and enforce settings
    const { data: plugin } = await supabaseAdmin
      .from('store_plugins')
      .select('config')
      .eq('store_id', store.id)
      .eq('plugin_name', 'reservation_school')
      .maybeSingle();
    const config = ((plugin as { config: Record<string, unknown> | null } | null)?.config || {}) as {
      accept_days_ahead?: number;
      require_phone?: boolean;
      send_confirmation_email?: boolean;
    };

    // BUG-1: require_phone check
    if (config.require_phone && !body.customer_phone) {
      res.status(400).json({ error: '電話番号は必須です' });
      return;
    }

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

    // BUG-1: accept_days_ahead check
    const acceptDaysAhead = config.accept_days_ahead ?? 60;
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + acceptDaysAhead);
    if (startsAt > maxDate) {
      res.status(400).json({ error: `${acceptDaysAhead} 日以上先のセッションは予約できません` });
      return;
    }

    // BUG-1: Determine whether to send confirmation email
    const sendEmail = config.send_confirmation_email !== false;

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
        sendConfirmationEmail: sendEmail,
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

// ── 公開キャンセル (UX-4) ────────────────────────────────────
schoolPublicRouter.post('/cancel', async (req: Request, res: Response) => {
  const slug = String((req.params as { slug: string }).slug);
  const { confirmation_code, email } = req.body as {
    confirmation_code?: string;
    email?: string;
  };
  if (!confirmation_code || !email) {
    res.status(400).json({ error: '確認コードとメールアドレスは必須です' });
    return;
  }

  const store = await resolvePublicStoreBySlug(slug);
  if (!store) { res.status(404).json({ error: '店舗が見つかりません' }); return; }

  const { data: reservation } = await supabaseAdmin
    .from('reservations')
    .select('*')
    .eq('store_id', store.id)
    .eq('confirmation_code', confirmation_code)
    .eq('customer_email', email)
    .eq('reservation_type', 'school')
    .maybeSingle();

  if (!reservation) {
    res.status(404).json({ error: '予約が見つかりません。確認コードとメールアドレスをご確認ください' });
    return;
  }

  const r = reservation as import('./types').ReservationRow;
  if (r.status === 'cancelled') {
    res.status(400).json({ error: 'この予約は既にキャンセル済みです' });
    return;
  }
  if (['completed', 'no_show'].includes(r.status)) {
    res.status(400).json({ error: '完了済みの予約はキャンセルできません' });
    return;
  }

  // Disallow cancellation if session already started
  if (new Date(r.starts_at) < new Date()) {
    res.status(400).json({ error: '開始済みの予約はキャンセルできません' });
    return;
  }

  try {
    const cancelled = await cancelReservation({
      reservationId: r.id,
      reason: 'お客様によるキャンセル',
      actorType: 'customer',
    });
    res.json({
      reservation: {
        id: cancelled.id,
        status: cancelled.status,
        cancelled_at: cancelled.cancelled_at,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── 公開予約照会 (UX-4) ─────────────────────────────────────
schoolPublicRouter.get('/lookup', async (req: Request, res: Response) => {
  const slug = String((req.params as { slug: string }).slug);
  const code = String(req.query.code || '');
  const email = String(req.query.email || '');
  if (!code || !email) {
    res.status(400).json({ error: '確認コードとメールアドレスは必須です' });
    return;
  }

  const store = await resolvePublicStoreBySlug(slug);
  if (!store) { res.status(404).json({ error: '店舗が見つかりません' }); return; }

  const { data } = await supabaseAdmin
    .from('reservations')
    .select('id, status, starts_at, ends_at, party_size, confirmation_code, customer_name, cancelled_at, metadata')
    .eq('store_id', store.id)
    .eq('confirmation_code', code)
    .eq('customer_email', email)
    .eq('reservation_type', 'school')
    .maybeSingle();

  if (!data) {
    res.status(404).json({ error: '予約が見つかりません' });
    return;
  }

  res.json({ reservation: data });
});
