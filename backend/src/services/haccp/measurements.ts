/**
 * HACCP 測定層 (checklist_measurements) ルータ
 *
 * 時系列の数値ログを保持する層。提出 (submission) から派生するものと、
 * センサー / 手動入力で単独に作られるものの両方を扱う。
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../../middleware/auth';
import { supabaseAdmin } from '../../config/supabase';
import { requireStoreMembership } from '../../auth/authorization';
import { calcPassed } from './helpers';

export const measurementsRouter = Router();

// GET /api/haccp/:storeId/measurements/daily-summary?date=&item_key=
measurementsRouter.get('/:storeId/measurements/daily-summary', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const date = String(req.query.date ?? new Date().toISOString().slice(0, 10));
    const itemKey = req.query.item_key ? String(req.query.item_key) : null;

    let query = supabaseAdmin
      .from('checklist_measurements')
      .select('numeric_value, passed, item_key')
      .eq('store_id', storeId)
      .gte('measured_at', `${date}T00:00:00`)
      .lte('measured_at', `${date}T23:59:59`);

    if (itemKey) query = query.eq('item_key', itemKey);

    const { data, error } = await query;
    if (error) { res.status(500).json({ error: 'Internal Server Error' }); return; }

    const rows = data || [];
    const numericRows = rows.filter((r: any) => r.numeric_value != null);
    const numericValues = numericRows.map((r: any) => Number(r.numeric_value));

    const summary = {
      date,
      item_key: itemKey,
      count: rows.length,
      numeric_count: numericRows.length,
      min: numericValues.length ? Math.min(...numericValues) : null,
      max: numericValues.length ? Math.max(...numericValues) : null,
      avg: numericValues.length ? numericValues.reduce((a, b) => a + b, 0) / numericValues.length : null,
      deviation_count: rows.filter((r: any) => r.passed === false).length,
    };

    res.json({ summary });
  } catch (e: unknown) {
    console.error('[haccp GET /:storeId/measurements/daily-summary] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/haccp/:storeId/measurements
measurementsRouter.get('/:storeId/measurements', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    let query = supabaseAdmin
      .from('checklist_measurements')
      .select('*')
      .eq('store_id', storeId)
      .order('measured_at', { ascending: false });

    if (req.query.item_key) query = query.eq('item_key', String(req.query.item_key));
    if (req.query.from) query = query.gte('measured_at', `${req.query.from}T00:00:00`);
    if (req.query.to) query = query.lte('measured_at', `${req.query.to}T23:59:59`);

    const { data, error } = await query;
    if (error) { res.status(500).json({ error: 'Internal Server Error' }); return; }

    res.json({ measurements: data || [] });
  } catch (e: unknown) {
    console.error('[haccp GET /:storeId/measurements] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/haccp/:storeId/measurements
measurementsRouter.post('/:storeId/measurements', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const { item_key, numeric_value, bool_value, text_value, measured_at, source, context, template_item_id } = req.body ?? {};

    if (!item_key) {
      res.status(400).json({ error: 'item_key は必須です' });
      return;
    }

    let passed: boolean | null = null;
    if (template_item_id) {
      const { data: tplItem } = await supabaseAdmin
        .from('checklist_template_items')
        .select('item_type, min_value, max_value')
        .eq('id', template_item_id)
        .maybeSingle();
      if (tplItem) {
        passed = calcPassed(tplItem, { bool_value, numeric_value, text_value });
      }
    } else if (bool_value != null) {
      passed = bool_value === true;
    }

    const { data, error } = await supabaseAdmin
      .from('checklist_measurements')
      .insert({
        store_id: storeId,
        template_item_id: template_item_id ?? null,
        item_key,
        numeric_value: numeric_value ?? null,
        bool_value: bool_value ?? null,
        text_value: text_value ?? null,
        passed,
        measured_at: measured_at ?? new Date().toISOString(),
        source: source && ['manual', 'sensor', 'import'].includes(source) ? source : 'manual',
        context: context ?? {},
      })
      .select('*')
      .single();

    if (error) { res.status(500).json({ error: 'Internal Server Error' }); return; }

    res.status(201).json({ measurement: data });
  } catch (e: unknown) {
    console.error('[haccp POST /:storeId/measurements] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
