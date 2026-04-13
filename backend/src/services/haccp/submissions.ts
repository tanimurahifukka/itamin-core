/**
 * HACCP 実行時 active + 提出系ルータ
 *
 * - GET /:storeId/active       実行時のアクティブチェックリスト取得
 * - POST /:storeId/submissions  チェックリスト提出 (measurement + deviation を同時生成)
 * - GET /:storeId/submissions   提出履歴取得
 *
 * kiosk / LINE 経由でも再利用できるよう、主要ロジックは service 関数として export する。
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../../middleware/auth';
import { supabaseAdmin } from '../../config/supabase';
import { requireStoreMembership } from '../../auth/authorization';
import {
  HaccpTiming,
  HaccpScope,
  isValidTiming,
  isValidScope,
  calcPassed,
  getAuditLevel,
} from './helpers';

// ── Row types for Supabase query results ─────────────────────────────────────

/** checklist_templates: columns selected in listKioskActiveTemplates */
interface KioskTemplateRow {
  id: string;
  name: string;
  timing: string;
  scope: string;
  description: string | null;
}

/** checklist_template_items: columns selected in listKioskActiveTemplates */
interface KioskTemplateItemRow {
  id: string;
  template_id: string;
  label: string;
  item_type: string;
  required: boolean;
  min_value: number | null;
  max_value: number | null;
  unit: string | null;
  sort_order: number;
  options: Record<string, unknown>;
}

/** checklist_submissions: columns selected in listKioskSubmissionsForDate */
interface KioskSubmissionRow {
  id: string;
  template_id: string;
  timing: string;
  submitted_at: string;
  member: { user: { name: string } | null } | null;
}

/** checklist_templates: id + name only */
interface TplNameRow {
  id: string;
  name: string;
}

/** checklist_assignments: template_id only */
interface AssignmentRow {
  template_id: string;
}

/** checklist_templates: id only (fallback query) */
interface TplIdRow {
  id: string;
}

/** checklist_template_items: full row via select('*') */
interface TemplateItemFullRow {
  id: string;
  store_id: string;
  template_id: string;
  item_key: string;
  label: string;
  item_type: string;
  required: boolean;
  min_value: number | null;
  max_value: number | null;
  unit: string | null;
  options: Record<string, unknown>;
  is_ccp: boolean;
  tracking_mode: string;
  frequency_per_day: number | null;
  frequency_interval_minutes: number | null;
  deviation_action: string | null;
  sort_order: number;
  switchbot_device_id: string | null;
  created_at: string;
  updated_at: string;
}

/** checklist_templates: full row via select('*') for active checklist */
interface TemplateFullRow {
  id: string;
  store_id: string;
  system_template_id: string | null;
  name: string;
  timing: string;
  scope: string;
  layer: string;
  description: string | null;
  version: number;
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export const submissionsRouter = Router();

// ── kiosk 向け軽量ヘルパ ──────────────────────────────────────────────────────
//
// kiosk は assignment ルーティングを使わず「store-scope で active な全テンプレート」を
// そのまま表示する簡易フロー。その取得を 1 関数にまとめて kiosk/routes.ts から呼び出す。

export async function listKioskActiveTemplates(storeId: string, timing: string | null) {
  let query = supabaseAdmin
    .from('checklist_templates')
    .select('id, name, timing, scope, description')
    .eq('store_id', storeId)
    .eq('scope', 'store')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (timing) query = query.eq('timing', timing);

  const { data: templates, error } = await query;
  if (error) throw new Error(error.message);

  const ids = (templates || []).map((t: KioskTemplateRow) => t.id);
  const { data: items } = ids.length > 0
    ? await supabaseAdmin
        .from('checklist_template_items')
        .select('id, template_id, label, item_type, required, min_value, max_value, unit, sort_order, options')
        .in('template_id', ids)
        .order('sort_order', { ascending: true })
    : { data: [] as KioskTemplateItemRow[] };

  const itemsByTemplate = ((items || []) as KioskTemplateItemRow[]).reduce((acc: Record<string, KioskTemplateItemRow[]>, item) => {
    if (!acc[item.template_id]) acc[item.template_id] = [];
    acc[item.template_id].push(item);
    return acc;
  }, {});

  return (templates || []).map((t: KioskTemplateRow) => ({ ...t, items: itemsByTemplate[t.id] || [] }));
}

export async function listKioskSubmissionsForDate(storeId: string, date: string) {
  const { data, error } = await supabaseAdmin
    .from('checklist_submissions')
    .select('id, template_id, timing, submitted_at, member:store_staff!membership_id(user:profiles(name))')
    .eq('store_id', storeId)
    .eq('scope', 'store')
    .gte('submitted_at', `${date}T00:00:00`)
    .lte('submitted_at', `${date}T23:59:59`)
    .order('submitted_at', { ascending: false });

  if (error) throw new Error(error.message);

  const tplIds = [...new Set((data || []).map((s: KioskSubmissionRow) => s.template_id))];
  const { data: tpls } = tplIds.length > 0
    ? await supabaseAdmin.from('checklist_templates').select('id, name').in('id', tplIds)
    : { data: [] as TplNameRow[] };
  const tplMap = new Map(((tpls || []) as TplNameRow[]).map(t => [t.id, t.name]));

  return (data || []).map((s: KioskSubmissionRow) => ({
    id: s.id,
    templateId: s.template_id,
    templateName: tplMap.get(s.template_id) || '不明',
    timing: s.timing,
    submittedAt: s.submitted_at,
    submittedBy: s.member?.user?.name || '–',
  }));
}

// ── service 関数 (router / kiosk / LINE 共通) ─────────────────────────────────

export interface ActiveChecklistResult {
  templates: Array<any>;
  merged_items: Array<any>;
}

/**
 * 指定された timing/scope/shift_type に該当する active テンプレートを展開して返す。
 * assignments が無ければ base layer の全 template を fallback で返す。
 */
export async function listActiveChecklist(
  storeId: string,
  timing: HaccpTiming,
  scope: HaccpScope,
  shiftType: string | null,
): Promise<ActiveChecklistResult> {
  let assignQuery = supabaseAdmin
    .from('checklist_assignments')
    .select('template_id')
    .eq('store_id', storeId)
    .eq('timing', timing)
    .eq('scope', scope);

  if (shiftType) {
    assignQuery = assignQuery.or(`shift_type.is.null,shift_type.eq.${shiftType}`);
  } else {
    assignQuery = assignQuery.is('shift_type', null);
  }

  const { data: assignments, error: assignErr } = await assignQuery;
  if (assignErr) throw new Error(assignErr.message);

  let templateIds: string[] = (assignments || []).map((a: AssignmentRow) => a.template_id);

  if (templateIds.length === 0) {
    const { data: fallback, error: fbErr } = await supabaseAdmin
      .from('checklist_templates')
      .select('id')
      .eq('store_id', storeId)
      .eq('timing', timing)
      .eq('scope', scope)
      .eq('layer', 'base')
      .eq('is_active', true);

    if (fbErr) throw new Error(fbErr.message);
    templateIds = (fallback || []).map((t: TplIdRow) => t.id);
  }

  if (templateIds.length === 0) {
    return { templates: [], merged_items: [] };
  }

  const { data: templates, error: tplErr } = await supabaseAdmin
    .from('checklist_templates')
    .select('*')
    .in('id', templateIds)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (tplErr) throw new Error(tplErr.message);

  const { data: items, error: itemErr } = await supabaseAdmin
    .from('checklist_template_items')
    .select('*')
    .in('template_id', templateIds)
    .order('sort_order', { ascending: true });

  if (itemErr) throw new Error(itemErr.message);

  const itemsByTemplate = (items || []).reduce((acc: any, item: any) => {
    if (!acc[item.template_id]) acc[item.template_id] = [];
    acc[item.template_id].push(item);
    return acc;
  }, {} as Record<string, any[]>);

  const enriched = (templates || []).map((t: any) => ({
    ...t,
    items: itemsByTemplate[t.id] || [],
  }));

  const sorted = [...enriched].sort((a, b) => {
    const order: Record<string, number> = { base: 0, shift: 1 };
    return (order[a.layer] ?? 0) - (order[b.layer] ?? 0);
  });

  const mergedItems = sorted.flatMap((t: any) =>
    (t.items || []).map((item: any) => ({
      ...item,
      template_id: t.id,
      template_name: t.name,
      template_layer: t.layer,
    }))
  );

  return { templates: enriched, merged_items: mergedItems };
}

export interface SubmissionInput {
  storeId: string;
  userId: string;
  scope: HaccpScope;
  timing: HaccpTiming;
  templateId: string;
  membershipId: string;
  sessionId?: string | null;
  shiftSlotId?: string | null;
  responsibleMembershipId?: string | null;
  items: Array<{
    template_item_id?: string | null;
    item_key?: string;
    bool_value?: boolean | null;
    numeric_value?: number | null;
    text_value?: string | null;
    select_value?: string | null;
    file_path?: string | null;
    checked_by?: string | null;
    checked_at?: string | null;
  }>;
}

/**
 * チェックリスト提出処理の本体。
 * template 取得 → passed 判定 → submission/submission_items/measurements/deviations を投入する。
 */
export async function createSubmission(input: SubmissionInput): Promise<any> {
  const {
    storeId, userId, scope, timing, templateId, membershipId,
    sessionId = null, shiftSlotId = null, responsibleMembershipId = null, items,
  } = input;

  const auditLevel = await getAuditLevel(storeId);

  if (auditLevel === 'shift' && !responsibleMembershipId) {
    throw new Error('audit_level=shift では responsible_membership_id が必須です');
  }
  if (auditLevel === 'item' || auditLevel === 'approval') {
    const allHaveCheckedBy = items.every((item) => item.checked_by);
    if (!allHaveCheckedBy) {
      throw new Error('audit_level=item 以上では各項目に checked_by が必須です');
    }
  }

  const { data: tpl, error: tplErr } = await supabaseAdmin
    .from('checklist_templates')
    .select('*')
    .eq('id', templateId)
    .eq('store_id', storeId)
    .maybeSingle();

  if (tplErr || !tpl) {
    throw new Error('テンプレートが見つかりません');
  }

  const { data: tplItems } = await supabaseAdmin
    .from('checklist_template_items')
    .select('*')
    .eq('template_id', templateId)
    .order('sort_order', { ascending: true });

  const itemMap = new Map((tplItems || []).map((i: any) => [i.id, i]));

  const processedItems: any[] = [];
  let allPassed = true;
  let hasDeviation = false;

  for (const item of items) {
    const tplItem = item.template_item_id ? itemMap.get(item.template_item_id) : null;
    const passed = tplItem ? calcPassed(tplItem, item) : null;

    if (passed === false && tplItem?.required) {
      allPassed = false;
      hasDeviation = true;
    }

    processedItems.push({
      item_key: item.item_key ?? tplItem?.item_key ?? 'unknown',
      template_item_id: item.template_item_id ?? null,
      bool_value: item.bool_value ?? null,
      numeric_value: item.numeric_value ?? null,
      text_value: item.text_value ?? null,
      select_value: item.select_value ?? null,
      file_path: item.file_path ?? null,
      checked_by: item.checked_by ?? null,
      checked_at: item.checked_at ?? null,
      passed,
      tplItem,
    });
  }

  const finalAllPassed = auditLevel === 'approval' ? false : allPassed;

  const snapshot = {
    template: { id: tpl.id, name: tpl.name, version: tpl.version, timing: tpl.timing, scope: tpl.scope },
    items: (tplItems || []).map((i: any) => ({
      id: i.id, item_key: i.item_key, label: i.label, item_type: i.item_type,
      required: i.required, min_value: i.min_value, max_value: i.max_value,
      unit: i.unit, is_ccp: i.is_ccp,
    })),
  };

  const { data: submission, error: subErr } = await supabaseAdmin
    .from('checklist_submissions')
    .insert({
      store_id: storeId,
      membership_id: membershipId,
      session_id: sessionId,
      shift_slot_id: shiftSlotId,
      timing,
      scope,
      template_id: templateId,
      template_version: tpl.version,
      all_passed: finalAllPassed,
      has_deviation: hasDeviation,
      responsible_membership_id: responsibleMembershipId,
      submitted_at: new Date().toISOString(),
      submitted_by: userId,
      snapshot,
    })
    .select('*')
    .single();

  if (subErr || !submission) {
    throw new Error(subErr?.message || '提出に失敗しました');
  }

  const deviationsToInsert: any[] = [];

  for (const pi of processedItems) {
    let measurementId: string | null = null;

    if (pi.tplItem && (pi.tplItem.tracking_mode === 'both' || pi.tplItem.tracking_mode === 'measurement_only')) {
      const { data: meas, error: measErr } = await supabaseAdmin
        .from('checklist_measurements')
        .insert({
          store_id: storeId,
          template_item_id: pi.template_item_id ?? null,
          item_key: pi.item_key,
          bool_value: pi.bool_value,
          numeric_value: pi.numeric_value,
          text_value: pi.text_value,
          passed: pi.passed,
          measured_at: new Date().toISOString(),
          source: 'manual',
          context: { submission_id: submission.id },
        })
        .select('id')
        .single();

      if (!measErr && meas) measurementId = meas.id;
    }

    await supabaseAdmin.from('checklist_submission_items').insert({
      store_id: storeId,
      submission_id: submission.id,
      template_item_id: pi.template_item_id ?? null,
      item_key: pi.item_key,
      bool_value: pi.bool_value,
      numeric_value: pi.numeric_value,
      text_value: pi.text_value,
      select_value: pi.select_value,
      file_path: pi.file_path,
      passed: pi.passed,
      measurement_id: measurementId,
      checked_by: pi.checked_by ?? null,
      checked_at: pi.checked_at ?? null,
    });

    if (pi.passed === false && pi.tplItem) {
      const severity = pi.tplItem.is_ccp ? 'ccp' : 'warning';
      const detectedValue = pi.numeric_value != null ? String(pi.numeric_value)
        : pi.bool_value != null ? String(pi.bool_value)
        : (pi.text_value ?? '');
      deviationsToInsert.push({
        store_id: storeId,
        submission_id: submission.id,
        template_item_id: pi.template_item_id ?? null,
        item_key: pi.item_key,
        severity,
        status: 'open',
        detected_value: detectedValue,
        description: pi.tplItem.deviation_action ?? null,
        measurement_id: measurementId,
      });
    }
  }

  if (deviationsToInsert.length > 0) {
    await supabaseAdmin.from('checklist_deviations').insert(deviationsToInsert);
  }

  return submission;
}

// ── router ────────────────────────────────────────────────────────────────────

// GET /api/haccp/:storeId/active?scope=personal&timing=clock_in&shift_type=morning
submissionsRouter.get('/:storeId/active', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const timing = String(req.query.timing ?? 'clock_in');
    const scope = String(req.query.scope ?? 'personal');
    const shiftType = req.query.shift_type ? String(req.query.shift_type) : null;

    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    if (!isValidTiming(timing)) { res.status(400).json({ error: 'timing が不正です' }); return; }
    if (!isValidScope(scope)) { res.status(400).json({ error: 'scope が不正です' }); return; }

    const result = await listActiveChecklist(storeId, timing, scope, shiftType);
    res.json(result);
  } catch (e: unknown) {
    console.error('[haccp GET /:storeId/active] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/haccp/:storeId/submissions
submissionsRouter.post('/:storeId/submissions', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const {
      scope, timing, template_id, membership_id, session_id, shift_slot_id,
      responsible_membership_id, items,
    } = req.body ?? {};

    if (!isValidTiming(String(timing ?? ''))) { res.status(400).json({ error: 'timing が不正です' }); return; }
    if (!isValidScope(String(scope ?? ''))) { res.status(400).json({ error: 'scope が不正です' }); return; }
    if (!template_id) { res.status(400).json({ error: 'template_id は必須です' }); return; }
    if (!membership_id) { res.status(400).json({ error: 'membership_id は必須です' }); return; }
    if (!Array.isArray(items)) { res.status(400).json({ error: 'items は配列で指定してください' }); return; }

    try {
      const submission = await createSubmission({
        storeId,
        userId: req.user!.id,
        scope,
        timing,
        templateId: template_id,
        membershipId: membership_id,
        sessionId: session_id ?? null,
        shiftSlotId: shift_slot_id ?? null,
        responsibleMembershipId: responsible_membership_id ?? null,
        items,
      });
      res.status(201).json({ submission });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '提出に失敗しました';
      if (msg.includes('必須') || msg.includes('audit_level')) {
        res.status(400).json({ error: msg });
      } else if (msg.includes('見つかりません')) {
        res.status(404).json({ error: msg });
      } else {
        res.status(500).json({ error: '提出に失敗しました' });
      }
    }
  } catch (e: unknown) {
    console.error('[haccp POST /:storeId/submissions] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/haccp/:storeId/nfc-location-status?location_id=<uuid>&date=YYYY-MM-DD
submissionsRouter.get('/:storeId/nfc-location-status', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const locationId = req.query.location_id ? String(req.query.location_id) : null;
    const date = req.query.date ? String(req.query.date) : null;

    if (!locationId) { res.status(400).json({ error: 'location_id は必須です' }); return; }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { res.status(400).json({ error: 'date は YYYY-MM-DD 形式で指定してください' }); return; }

    const dayStart = `${date}T00:00:00+09:00`;
    const nextDate = new Date(`${date}T00:00:00+09:00`);
    nextDate.setDate(nextDate.getDate() + 1);
    const dayEnd = `${nextDate.toISOString().slice(0, 10)}T00:00:00+09:00`;

    const { data, error } = await supabaseAdmin
      .from('checklist_submissions')
      .select('submitted_at, snapshot')
      .eq('store_id', storeId)
      .eq('snapshot->>source', 'nfc')
      .eq('snapshot->>location_id', locationId)
      .gte('submitted_at', dayStart)
      .lt('submitted_at', dayEnd)
      .order('submitted_at', { ascending: false })
      .limit(1);

    if (error) { res.status(500).json({ error: 'Internal Server Error' }); return; }

    if (!data || data.length === 0) {
      res.json({ done: false });
      return;
    }

    const row = data[0] as { submitted_at: string; snapshot: Record<string, unknown> | null };
    res.json({
      done: true,
      submitted_at: row.submitted_at,
      staff_name: row.snapshot?.staff_name ?? null,
    });
  } catch (e: unknown) {
    console.error('[haccp GET /:storeId/nfc-location-status] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/haccp/:storeId/submissions
submissionsRouter.get('/:storeId/submissions', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    let query = supabaseAdmin
      .from('checklist_submissions')
      .select('*')
      .eq('store_id', storeId)
      .order('submitted_at', { ascending: false });

    if (req.query.from) query = query.gte('submitted_at', `${req.query.from}T00:00:00`);
    if (req.query.to) query = query.lte('submitted_at', `${req.query.to}T23:59:59`);
    if (req.query.scope && isValidScope(String(req.query.scope))) {
      query = query.eq('scope', String(req.query.scope));
    }
    if (req.query.membership_id) query = query.eq('membership_id', String(req.query.membership_id));
    if (req.query.timing && isValidTiming(String(req.query.timing))) {
      query = query.eq('timing', String(req.query.timing));
    }

    const { data, error } = await query;
    if (error) { res.status(500).json({ error: 'Internal Server Error' }); return; }

    res.json({ submissions: data || [] });
  } catch (e: unknown) {
    console.error('[haccp GET /:storeId/submissions] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
