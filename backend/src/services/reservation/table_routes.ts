// ============================================================
// Table reservation routes
// ============================================================
// 管理者用 (/api/reservation/table/...) と
// 公開顧客用 (/api/public/r/...) の両方を提供する。

import { Router, Request, Response } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireStoreMembership, requireManagedStore } from '../../auth/authorization';
import { supabaseAdmin } from '../../config/supabase';
import {
  createReservation,
  cancelReservation,
  resolvePublicStoreBySlug,
} from './core';
import type {
  ReservationRow,
  ReservationTableRow,
  ReservationBusinessHoursRow,
} from './types';

// ============================================================
// Admin router: /api/reservation/table
// ============================================================
export const tableReservationAdminRouter = Router();

// ── テーブル CRUD ───────────────────────────────────────────
tableReservationAdminRouter.get(
  '/:storeId/tables',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const { data, error } = await supabaseAdmin
      .from('reservation_tables')
      .select('*')
      .eq('store_id', storeId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ tables: data });
  },
);

tableReservationAdminRouter.post(
  '/:storeId/tables',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const body = req.body as {
      name?: string;
      capacity?: number;
      min_party_size?: number;
      location?: string | null;
      sort_order?: number;
      active?: boolean;
      note?: string | null;
    };

    if (!body.name || !body.capacity) {
      res.status(400).json({ error: 'name と capacity は必須です' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('reservation_tables')
      .insert({
        store_id: storeId,
        name: body.name,
        capacity: body.capacity,
        min_party_size: body.min_party_size || 1,
        location: body.location || null,
        sort_order: body.sort_order ?? 0,
        active: body.active ?? true,
        note: body.note || null,
      })
      .select('*')
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(201).json({ table: data });
  },
);

tableReservationAdminRouter.patch(
  '/:storeId/tables/:tableId',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const tableId = String(req.params.tableId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const body = req.body as Partial<ReservationTableRow>;
    const patch: Record<string, unknown> = {};
    for (const key of ['name', 'capacity', 'min_party_size', 'location', 'sort_order', 'active', 'note'] as const) {
      if (key in body) patch[key] = (body as Record<string, unknown>)[key];
    }

    const { data, error } = await supabaseAdmin
      .from('reservation_tables')
      .update(patch)
      .eq('id', tableId)
      .eq('store_id', storeId)
      .select('*')
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json({ table: data });
  },
);

tableReservationAdminRouter.delete(
  '/:storeId/tables/:tableId',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const tableId = String(req.params.tableId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const { error } = await supabaseAdmin
      .from('reservation_tables')
      .delete()
      .eq('id', tableId)
      .eq('store_id', storeId);

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json({ ok: true });
  },
);

// ── 営業時間 ───────────────────────────────────────────────
tableReservationAdminRouter.get(
  '/:storeId/business-hours',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const { data, error } = await supabaseAdmin
      .from('reservation_business_hours')
      .select('*')
      .eq('store_id', storeId)
      .eq('plugin', 'reservation_table')
      .order('day_of_week', { ascending: true });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ hours: data });
  },
);

tableReservationAdminRouter.put(
  '/:storeId/business-hours',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const body = req.body as {
      hours: Array<{
        day_of_week: number;
        open_time: string;
        close_time: string;
        last_order_min?: number;
        slot_minutes?: number;
      }>;
    };

    if (!Array.isArray(body.hours)) {
      res.status(400).json({ error: 'hours 配列が必要です' });
      return;
    }

    // 全件置き換え
    await supabaseAdmin
      .from('reservation_business_hours')
      .delete()
      .eq('store_id', storeId)
      .eq('plugin', 'reservation_table');

    if (body.hours.length > 0) {
      const rows = body.hours.map((h) => ({
        store_id: storeId,
        plugin: 'reservation_table',
        day_of_week: h.day_of_week,
        open_time: h.open_time,
        close_time: h.close_time,
        last_order_min: h.last_order_min ?? 60,
        slot_minutes: h.slot_minutes ?? 30,
      }));
      const { error } = await supabaseAdmin.from('reservation_business_hours').insert(rows);
      if (error) {
        res.status(400).json({ error: error.message });
        return;
      }
    }

    res.json({ ok: true });
  },
);

// ── 予約一覧・作成・変更・キャンセル ──────────────────────
tableReservationAdminRouter.get(
  '/:storeId/reservations',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;
    const status = req.query.status ? String(req.query.status) : null;

    let query = supabaseAdmin
      .from('reservations')
      .select('*')
      .eq('store_id', storeId)
      .eq('reservation_type', 'table')
      .order('starts_at', { ascending: true });

    if (from) query = query.gte('starts_at', from.toISOString());
    if (to) query = query.lte('starts_at', to.toISOString());
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ reservations: data });
  },
);

tableReservationAdminRouter.post(
  '/:storeId/reservations',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const body = req.body as {
      starts_at?: string;
      ends_at?: string;
      party_size?: number;
      table_id?: string | null;
      customer_name?: string;
      customer_phone?: string | null;
      customer_email?: string | null;
      notes?: string | null;
    };

    if (!body.starts_at || !body.ends_at || !body.party_size || !body.customer_name) {
      res.status(400).json({ error: 'starts_at / ends_at / party_size / customer_name は必須です' });
      return;
    }

    try {
      const result = await createReservation({
        storeId,
        type: 'table',
        source: 'admin',
        startsAt: new Date(body.starts_at),
        endsAt: new Date(body.ends_at),
        partySize: body.party_size,
        resourceRef: body.table_id || null,
        customerName: body.customer_name,
        customerPhone: body.customer_phone || null,
        customerEmail: body.customer_email || null,
        notes: body.notes || null,
        createdBy: req.user!.id,
      });
      res.status(201).json({ reservation: result.reservation });
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      res.status(e.statusCode || 500).json({ error: e.message });
    }
  },
);

tableReservationAdminRouter.patch(
  '/:storeId/reservations/:reservationId',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const reservationId = String(req.params.reservationId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const body = req.body as Partial<ReservationRow> & { table_id?: string | null };
    const patch: Record<string, unknown> = {};
    for (const key of [
      'status',
      'starts_at',
      'ends_at',
      'party_size',
      'customer_name',
      'customer_phone',
      'customer_email',
      'notes',
      'internal_notes',
      'amount_total',
      'paid',
      'payment_method',
    ] as const) {
      if (key in body) patch[key] = (body as Record<string, unknown>)[key];
    }
    if ('table_id' in body) patch.resource_ref = body.table_id || null;

    const { data, error } = await supabaseAdmin
      .from('reservations')
      .update(patch)
      .eq('id', reservationId)
      .eq('store_id', storeId)
      .select('*')
      .single();

    if (error) {
      if (error.code === '23P01') {
        res.status(409).json({ error: 'この時間帯は既に予約が入っています' });
        return;
      }
      res.status(400).json({ error: error.message });
      return;
    }
    res.json({ reservation: data });
  },
);

tableReservationAdminRouter.post(
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
        reason: req.body?.reason as string | undefined,
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
// Public router: /api/public/r
// ============================================================
// - 認証なし、slug ベース
// - レート制限は vercel の default に任せる (MVP)

export const publicReservationRouter = Router();

// 店舗公開情報 + table プラグインが有効かどうか
publicReservationRouter.get('/:slug', async (req: Request, res: Response) => {
  const slug = String(req.params.slug);
  const store = await resolvePublicStoreBySlug(slug);
  if (!store) {
    res.status(404).json({ error: '店舗が見つかりません' });
    return;
  }

  // 有効な予約プラグインを列挙
  const { data: pluginRows } = await supabaseAdmin
    .from('store_plugins')
    .select('plugin_name, enabled, config')
    .eq('store_id', store.id)
    .in('plugin_name', ['reservation_table', 'reservation_timeslot', 'reservation_school', 'reservation_event']);

  const available = (pluginRows || [])
    .filter((p) => (p as { enabled: boolean }).enabled)
    .map((p) => (p as { plugin_name: string }).plugin_name);

  res.json({ store, available });
});

// 空き状況 (table プラグイン)
publicReservationRouter.get('/:slug/table/availability', async (req: Request, res: Response) => {
  const slug = String(req.params.slug);
  const dateStr = String(req.query.date || '');
  const partySize = parseInt(String(req.query.party_size || '2'), 10);

  if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    res.status(400).json({ error: 'date=YYYY-MM-DD が必要です' });
    return;
  }
  if (!Number.isFinite(partySize) || partySize < 1) {
    res.status(400).json({ error: 'party_size が不正です' });
    return;
  }

  const store = await resolvePublicStoreBySlug(slug);
  if (!store) {
    res.status(404).json({ error: '店舗が見つかりません' });
    return;
  }

  // プラグイン設定
  const { data: plugin } = await supabaseAdmin
    .from('store_plugins')
    .select('enabled, config')
    .eq('store_id', store.id)
    .eq('plugin_name', 'reservation_table')
    .maybeSingle();

  if (!plugin || !(plugin as { enabled: boolean }).enabled) {
    res.status(404).json({ error: 'テーブル予約は受け付けていません' });
    return;
  }

  const config = ((plugin as { config: Record<string, unknown> | null }).config || {}) as {
    default_duration_minutes?: number;
    accept_days_ahead?: number;
  };
  const durationMin = config.default_duration_minutes || 120;
  const acceptDaysAhead = config.accept_days_ahead || 30;

  // 営業時間
  const { data: hours } = await supabaseAdmin
    .from('reservation_business_hours')
    .select('*')
    .eq('store_id', store.id)
    .eq('plugin', 'reservation_table');

  // 対象日 (JST 基準で曜日を計算)
  const targetDate = new Date(dateStr + 'T00:00:00+09:00');
  const today = new Date();
  const maxDate = new Date(today.getTime() + acceptDaysAhead * 86400000);
  if (targetDate > maxDate) {
    res.json({ slots: [], reason: '受付期間外' });
    return;
  }
  const dow = targetDate.getDay();
  const todays = (hours || []).filter((h) => (h as ReservationBusinessHoursRow).day_of_week === dow);

  if (todays.length === 0) {
    res.json({ slots: [], reason: '定休日' });
    return;
  }

  // 休業日チェック
  const { data: blackouts } = await supabaseAdmin
    .from('reservation_blackouts')
    .select('date')
    .eq('store_id', store.id)
    .eq('date', dateStr)
    .or('plugin.is.null,plugin.eq.reservation_table');
  if ((blackouts || []).length > 0) {
    res.json({ slots: [], reason: '臨時休業' });
    return;
  }

  // 使えるテーブル
  const { data: tables } = await supabaseAdmin
    .from('reservation_tables')
    .select('*')
    .eq('store_id', store.id)
    .eq('active', true)
    .gte('capacity', partySize)
    .lte('min_party_size', partySize);

  if (!tables || tables.length === 0) {
    res.json({ slots: [], reason: '条件に合うテーブルがありません' });
    return;
  }

  // 当日の既存予約
  const dayStart = new Date(dateStr + 'T00:00:00+09:00').toISOString();
  const dayEnd = new Date(new Date(dateStr + 'T00:00:00+09:00').getTime() + 86400000).toISOString();
  const { data: existing } = await supabaseAdmin
    .from('reservations')
    .select('resource_ref, starts_at, ends_at, status')
    .eq('store_id', store.id)
    .eq('reservation_type', 'table')
    .gte('starts_at', dayStart)
    .lt('starts_at', dayEnd)
    .in('status', ['pending', 'confirmed', 'seated']);

  // スロット生成
  const slots: Array<{ starts_at: string; available_table_count: number }> = [];
  for (const h of todays as ReservationBusinessHoursRow[]) {
    const [oh, om] = h.open_time.split(':').map(Number);
    const [ch, cm] = h.close_time.split(':').map(Number);
    const open = new Date(dateStr + `T${String(oh).padStart(2, '0')}:${String(om).padStart(2, '0')}:00+09:00`);
    const lastAccept = new Date(
      dateStr + `T${String(ch).padStart(2, '0')}:${String(cm).padStart(2, '0')}:00+09:00`,
    );
    lastAccept.setMinutes(lastAccept.getMinutes() - (h.last_order_min || 60));

    for (let t = new Date(open); t <= lastAccept; t = new Date(t.getTime() + h.slot_minutes * 60000)) {
      const slotStart = new Date(t);
      const slotEnd = new Date(slotStart.getTime() + durationMin * 60000);

      if (slotStart < new Date()) continue; // 過去 NG

      const availableTables = (tables as ReservationTableRow[]).filter((tb) => {
        const overlapping = (existing || []).some((e) => {
          const ex = e as { resource_ref: string | null; starts_at: string; ends_at: string };
          if (ex.resource_ref !== tb.id) return false;
          const es = new Date(ex.starts_at);
          const ee = new Date(ex.ends_at);
          return es < slotEnd && ee > slotStart;
        });
        return !overlapping;
      });

      if (availableTables.length > 0) {
        slots.push({
          starts_at: slotStart.toISOString(),
          available_table_count: availableTables.length,
        });
      }
    }
  }

  res.json({ slots, duration_minutes: durationMin });
});

// 予約作成 (public)
publicReservationRouter.post('/:slug/table/reservations', async (req: Request, res: Response) => {
  const slug = String(req.params.slug);
  const store = await resolvePublicStoreBySlug(slug);
  if (!store) {
    res.status(404).json({ error: '店舗が見つかりません' });
    return;
  }

  const body = req.body as {
    starts_at?: string;
    party_size?: number;
    customer_name?: string;
    customer_phone?: string;
    customer_email?: string;
    notes?: string;
  };

  if (!body.starts_at || !body.party_size || !body.customer_name || !body.customer_email) {
    res.status(400).json({ error: '必須項目が不足しています' });
    return;
  }
  if (body.party_size < 1 || body.party_size > 50) {
    res.status(400).json({ error: '人数が不正です' });
    return;
  }

  // プラグイン設定を取って duration を決める
  const { data: plugin } = await supabaseAdmin
    .from('store_plugins')
    .select('enabled, config')
    .eq('store_id', store.id)
    .eq('plugin_name', 'reservation_table')
    .maybeSingle();

  if (!plugin || !(plugin as { enabled: boolean }).enabled) {
    res.status(404).json({ error: 'テーブル予約は受け付けていません' });
    return;
  }

  const config = ((plugin as { config: Record<string, unknown> | null }).config || {}) as {
    default_duration_minutes?: number;
  };
  const durationMin = config.default_duration_minutes || 120;

  const startsAt = new Date(body.starts_at);
  const endsAt = new Date(startsAt.getTime() + durationMin * 60000);

  // 空きテーブルを 1 件選ぶ
  const { data: tables } = await supabaseAdmin
    .from('reservation_tables')
    .select('*')
    .eq('store_id', store.id)
    .eq('active', true)
    .gte('capacity', body.party_size)
    .lte('min_party_size', body.party_size)
    .order('capacity', { ascending: true });

  if (!tables || tables.length === 0) {
    res.status(400).json({ error: '条件に合うテーブルがありません' });
    return;
  }

  const { data: existing } = await supabaseAdmin
    .from('reservations')
    .select('resource_ref, starts_at, ends_at')
    .eq('store_id', store.id)
    .eq('reservation_type', 'table')
    .in('status', ['pending', 'confirmed', 'seated'])
    .lt('starts_at', endsAt.toISOString())
    .gt('ends_at', startsAt.toISOString());

  const busyIds = new Set((existing || []).map((e) => (e as { resource_ref: string }).resource_ref));
  const picked = (tables as ReservationTableRow[]).find((t) => !busyIds.has(t.id));
  if (!picked) {
    res.status(409).json({ error: '申し訳ありません、この時間帯は空きがなくなりました' });
    return;
  }

  try {
    const result = await createReservation({
      storeId: store.id,
      type: 'table',
      source: 'web',
      startsAt,
      endsAt,
      partySize: body.party_size,
      resourceRef: picked.id,
      customerName: body.customer_name,
      customerPhone: body.customer_phone || null,
      customerEmail: body.customer_email,
      notes: body.notes || null,
    });
    res.status(201).json({
      reservation: {
        id: result.reservation.id,
        confirmation_code: result.reservation.confirmation_code,
        starts_at: result.reservation.starts_at,
        ends_at: result.reservation.ends_at,
        party_size: result.reservation.party_size,
      },
    });
  } catch (err) {
    const e = err as Error & { statusCode?: number };
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// 予約照会 (確認コードで引く)
publicReservationRouter.get(
  '/:slug/reservations/:code',
  async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const code = String(req.params.code).toUpperCase();
    const store = await resolvePublicStoreBySlug(slug);
    if (!store) {
      res.status(404).json({ error: '店舗が見つかりません' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('reservations')
      .select(
        'id, confirmation_code, status, starts_at, ends_at, party_size, customer_name, reservation_type',
      )
      .eq('store_id', store.id)
      .eq('confirmation_code', code)
      .maybeSingle();

    if (error || !data) {
      res.status(404).json({ error: '予約が見つかりません' });
      return;
    }
    res.json({ reservation: data });
  },
);

// 予約キャンセル (確認コード + email で本人確認)
publicReservationRouter.post(
  '/:slug/reservations/:code/cancel',
  async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const code = String(req.params.code).toUpperCase();
    const email = String((req.body as { email?: string })?.email || '').trim().toLowerCase();

    if (!email) {
      res.status(400).json({ error: 'email が必要です' });
      return;
    }

    const store = await resolvePublicStoreBySlug(slug);
    if (!store) {
      res.status(404).json({ error: '店舗が見つかりません' });
      return;
    }

    const { data: found } = await supabaseAdmin
      .from('reservations')
      .select('*')
      .eq('store_id', store.id)
      .eq('confirmation_code', code)
      .maybeSingle();

    if (!found) {
      res.status(404).json({ error: '予約が見つかりません' });
      return;
    }
    const r = found as ReservationRow;
    if ((r.customer_email || '').toLowerCase() !== email) {
      res.status(403).json({ error: 'メールアドレスが一致しません' });
      return;
    }
    if (r.status === 'cancelled') {
      res.status(400).json({ error: '既にキャンセル済みです' });
      return;
    }

    try {
      const cancelled = await cancelReservation({
        reservationId: r.id,
        reason: '顧客キャンセル',
        actorType: 'customer',
      });
      res.json({ reservation: { id: cancelled.id, status: cancelled.status } });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  },
);
