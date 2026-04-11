/**
 * Store calendar routes
 *
 * 公開 API:
 *   GET    /:storeId/business-hours                曜日別の通常営業時間一覧
 *   PUT    /:storeId/business-hours                曜日別一括 upsert (7 行)
 *   GET    /:storeId/overrides?from=&to=           期間内の日別例外
 *   POST   /:storeId/overrides                     例外追加 (date + kind)
 *   PATCH  /:storeId/overrides/:id                 例外更新
 *   DELETE /:storeId/overrides/:id                 例外削除
 *   GET    /:storeId/effective?from=&to=           実効営業時間 (override + master マージ)
 *
 * 書込系はすべて owner/manager/leader のみ。閲覧は店舗メンバー全員。
 */
import { Router, Request, Response } from 'express';
import { requireAuth } from '../../middleware/auth';
import { supabaseAdmin } from '../../config/supabase';
import { requireManagedStore, requireStoreMembership } from '../../auth/authorization';
import { getEffectiveHoursRange } from './resolver';

const router = Router();

type BusinessHourInput = {
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
  note?: string | null;
};

type OverrideKind = 'closed' | 'special_hours' | 'holiday';

function isValidTime(s: unknown): s is string {
  return typeof s === 'string' && /^\d{2}:\d{2}(:\d{2})?$/.test(s);
}

function isValidDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// ============================================================
// GET /:storeId/business-hours
// ============================================================
router.get('/:storeId/business-hours', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const { data, error } = await supabaseAdmin
      .from('store_business_hours')
      .select('id, day_of_week, open_time, close_time, is_closed, note')
      .eq('store_id', storeId)
      .order('day_of_week', { ascending: true });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ hours: data || [] });
  } catch (e: any) {
    console.error('[calendar:hours:get] error', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// PUT /:storeId/business-hours  (upsert 7 rows)
// ============================================================
router.put('/:storeId/business-hours', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const incoming = Array.isArray(req.body?.hours) ? (req.body.hours as BusinessHourInput[]) : null;
    if (!incoming) {
      res.status(400).json({ error: 'hours は配列で指定してください' });
      return;
    }

    for (const h of incoming) {
      if (typeof h.day_of_week !== 'number' || h.day_of_week < 0 || h.day_of_week > 6) {
        res.status(400).json({ error: 'day_of_week は 0..6 の整数である必要があります' });
        return;
      }
      if (!h.is_closed) {
        if (!isValidTime(h.open_time) || !isValidTime(h.close_time)) {
          res.status(400).json({ error: 'open_time / close_time は HH:MM 形式で指定してください' });
          return;
        }
        if (h.open_time >= h.close_time) {
          res.status(400).json({ error: 'open_time は close_time より前である必要があります' });
          return;
        }
      }
    }

    const rows = incoming.map(h => ({
      store_id: storeId,
      day_of_week: h.day_of_week,
      open_time: h.is_closed ? '00:00' : h.open_time,
      close_time: h.is_closed ? '23:59' : h.close_time,
      is_closed: !!h.is_closed,
      note: h.note ?? null,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabaseAdmin
      .from('store_business_hours')
      .upsert(rows, { onConflict: 'store_id,day_of_week' });

    if (error) {
      console.error('[calendar:hours:put] upsert failed', error);
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ ok: true });
  } catch (e: any) {
    console.error('[calendar:hours:put] error', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// GET /:storeId/overrides?from=&to=
// ============================================================
router.get('/:storeId/overrides', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const from = typeof req.query.from === 'string' ? req.query.from : '';
    const to = typeof req.query.to === 'string' ? req.query.to : '';
    if (!isValidDate(from) || !isValidDate(to)) {
      res.status(400).json({ error: 'from / to は YYYY-MM-DD で指定してください' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('store_calendar_overrides')
      .select('id, date, kind, open_time, close_time, label')
      .eq('store_id', storeId)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ overrides: data || [] });
  } catch (e: any) {
    console.error('[calendar:overrides:get] error', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// POST /:storeId/overrides
// ============================================================
router.post('/:storeId/overrides', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const date = req.body?.date;
    const kind = req.body?.kind as OverrideKind | undefined;
    const label = typeof req.body?.label === 'string' ? req.body.label : null;
    const openTime = req.body?.open_time ?? null;
    const closeTime = req.body?.close_time ?? null;

    if (!isValidDate(date)) {
      res.status(400).json({ error: 'date は YYYY-MM-DD で指定してください' });
      return;
    }
    if (kind !== 'closed' && kind !== 'special_hours' && kind !== 'holiday') {
      res.status(400).json({ error: 'kind は closed / special_hours / holiday のいずれかです' });
      return;
    }
    if (kind === 'special_hours') {
      if (!isValidTime(openTime) || !isValidTime(closeTime) || openTime >= closeTime) {
        res.status(400).json({ error: 'special_hours には open_time < close_time が必須です' });
        return;
      }
    }

    const row = {
      store_id: storeId,
      date,
      kind,
      open_time: kind === 'special_hours' ? openTime : null,
      close_time: kind === 'special_hours' ? closeTime : null,
      label,
    };

    const { data, error } = await supabaseAdmin
      .from('store_calendar_overrides')
      .upsert(row, { onConflict: 'store_id,date' })
      .select('id, date, kind, open_time, close_time, label')
      .single();

    if (error) {
      console.error('[calendar:overrides:post] insert failed', error);
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(201).json({ override: data });
  } catch (e: any) {
    console.error('[calendar:overrides:post] error', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// PATCH /:storeId/overrides/:id
// ============================================================
router.patch('/:storeId/overrides/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const id = String(req.params.id);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const patch: Record<string, unknown> = {};
    const kind = req.body?.kind as OverrideKind | undefined;
    if (kind) {
      if (kind !== 'closed' && kind !== 'special_hours' && kind !== 'holiday') {
        res.status(400).json({ error: 'kind は closed / special_hours / holiday のいずれかです' });
        return;
      }
      patch.kind = kind;
      if (kind !== 'special_hours') {
        patch.open_time = null;
        patch.close_time = null;
      }
    }
    if (req.body?.open_time !== undefined) {
      if (req.body.open_time !== null && !isValidTime(req.body.open_time)) {
        res.status(400).json({ error: 'open_time は HH:MM 形式で指定してください' });
        return;
      }
      patch.open_time = req.body.open_time;
    }
    if (req.body?.close_time !== undefined) {
      if (req.body.close_time !== null && !isValidTime(req.body.close_time)) {
        res.status(400).json({ error: 'close_time は HH:MM 形式で指定してください' });
        return;
      }
      patch.close_time = req.body.close_time;
    }
    if (req.body?.label !== undefined) {
      patch.label = req.body.label;
    }

    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: '更新する項目がありません' });
      return;
    }

    patch.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('store_calendar_overrides')
      .update(patch)
      .eq('id', id)
      .eq('store_id', storeId)
      .select('id, date, kind, open_time, close_time, label')
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ override: data });
  } catch (e: any) {
    console.error('[calendar:overrides:patch] error', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// DELETE /:storeId/overrides/:id
// ============================================================
router.delete('/:storeId/overrides/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const id = String(req.params.id);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const { error } = await supabaseAdmin
      .from('store_calendar_overrides')
      .delete()
      .eq('id', id)
      .eq('store_id', storeId);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ ok: true });
  } catch (e: any) {
    console.error('[calendar:overrides:delete] error', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// GET /:storeId/effective?from=&to=
// ============================================================
router.get('/:storeId/effective', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const from = typeof req.query.from === 'string' ? req.query.from : '';
    const to = typeof req.query.to === 'string' ? req.query.to : '';
    if (!isValidDate(from) || !isValidDate(to)) {
      res.status(400).json({ error: 'from / to は YYYY-MM-DD で指定してください' });
      return;
    }
    if (from > to) {
      res.status(400).json({ error: 'from は to より前である必要があります' });
      return;
    }

    const days = await getEffectiveHoursRange(storeId, from, to);
    res.json({ days });
  } catch (e: any) {
    console.error('[calendar:effective] error', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

export const calendarRouter = router;
