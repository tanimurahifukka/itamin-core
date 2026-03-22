import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { createSupabaseClient, supabaseAdmin } from '../config/supabase';
import type { Express } from 'express';
import type { Plugin } from '../types';

const router = Router();

// チェックリスト取得（store_id + timing）
router.get('/checklists/:storeId/:timing', requireAuth, async (req: Request, res: Response) => {
  const storeId = req.params.storeId;
  const timing = req.params.timing as string;

  if (!['clock_in', 'clock_out'].includes(timing)) {
    res.status(400).json({ error: 'timing は clock_in または clock_out を指定してください' });
    return;
  }

  const supabase = createSupabaseClient(req.accessToken!);

  const { data, error } = await supabase
    .from('checklists')
    .select('*')
    .eq('store_id', storeId)
    .eq('timing', timing)
    .maybeSingle();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  // チェックリストが未登録の場合は空のリストを返す
  const checklist = data || {
    id: null,
    store_id: storeId,
    timing,
    items: [],
  };

  res.json({ checklist });
});

// チェックリスト更新（upsert）
router.put('/checklists/:storeId/:timing', requireAuth, async (req: Request, res: Response) => {
  const storeId = req.params.storeId;
  const timing = req.params.timing as string;
  const { items } = req.body;

  if (!['clock_in', 'clock_out'].includes(timing)) {
    res.status(400).json({ error: 'timing は clock_in または clock_out を指定してください' });
    return;
  }

  if (!Array.isArray(items)) {
    res.status(400).json({ error: 'items は配列で指定してください' });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from('checklists')
    .upsert({
      store_id: storeId,
      timing,
      items,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'store_id,timing' })
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ checklist: data });
});

// チェック記録保存
router.post('/records', requireAuth, async (req: Request, res: Response) => {
  const { store_id, staff_id, timing, results } = req.body;

  if (!store_id || !staff_id || !timing || !Array.isArray(results)) {
    res.status(400).json({ error: 'store_id, staff_id, timing, results は必須です' });
    return;
  }

  const all_checked = results.every((r: any) => r.checked);

  const { data, error } = await supabaseAdmin
    .from('check_records')
    .insert({
      store_id,
      staff_id,
      timing,
      results,
      all_checked,
      checked_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(201).json({ record: data });
});

// チェック記録取得（日付フィルター対応）
router.get('/records/:storeId', requireAuth, async (req: Request, res: Response) => {
  const { storeId } = req.params;
  const { start_date, end_date, staff_id } = req.query;

  const supabase = createSupabaseClient(req.accessToken!);

  let query = supabase
    .from('check_records')
    .select('*')
    .eq('store_id', storeId)
    .order('checked_at', { ascending: false });

  if (start_date) {
    query = query.gte('checked_at', `${start_date}T00:00:00`);
  }
  if (end_date) {
    query = query.lte('checked_at', `${end_date}T23:59:59`);
  }
  if (staff_id) {
    query = query.eq('staff_id', staff_id as string);
  }

  const { data, error } = await query;

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ records: data || [] });
});

export const checkPlugin: Plugin = {
  name: 'check',
  version: '0.1.0',
  description: 'HACCP準拠チェックリスト・記録管理',
  label: 'チェックリスト',
  icon: '✅',
  defaultRoles: ['owner', 'manager'],
  initialize: (app: Express) => {
    app.use('/api/check', router);
  },
};
