/**
 * HACCP 逸脱 (checklist_deviations) ルータ
 *
 * CCP 超過や checkbox 未チェックなど「is_ccp または required=true の不通過」を
 * 逸脱として記録する層。是正措置・承認ワークフローもここで扱う。
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../../middleware/auth';
import { supabaseAdmin } from '../../config/supabase';
import { requireStoreMembership } from '../../auth/authorization';
import { VALID_SEVERITIES } from './helpers';

export const deviationsRouter = Router();

// GET /api/haccp/:storeId/deviations?status=open
deviationsRouter.get('/:storeId/deviations', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    let query = supabaseAdmin
      .from('checklist_deviations')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });

    if (req.query.status) query = query.eq('status', String(req.query.status));
    if (req.query.severity) query = query.eq('severity', String(req.query.severity));

    const { data, error } = await query;
    if (error) { res.status(500).json({ error: error.message }); return; }

    res.json({ deviations: data || [] });
  } catch (e: any) {
    console.error('[haccp GET /:storeId/deviations] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// POST /api/haccp/:storeId/deviations
deviationsRouter.post('/:storeId/deviations', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const { item_key, severity, description, detected_value, submission_id, template_item_id } = req.body ?? {};

    if (!item_key) {
      res.status(400).json({ error: 'item_key は必須です' });
      return;
    }
    const sev = String(severity ?? 'warning');
    if (!VALID_SEVERITIES.includes(sev as any)) {
      res.status(400).json({ error: 'severity は info / warning / ccp を指定してください' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('checklist_deviations')
      .insert({
        store_id: storeId,
        submission_id: submission_id ?? null,
        template_item_id: template_item_id ?? null,
        item_key,
        severity: sev,
        status: 'open',
        detected_value: detected_value ?? null,
        description: description ?? null,
      })
      .select('*')
      .single();

    if (error) { res.status(500).json({ error: error.message }); return; }

    res.status(201).json({ deviation: data });
  } catch (e: any) {
    console.error('[haccp POST /:storeId/deviations] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// PUT /api/haccp/:storeId/deviations/:deviationId
deviationsRouter.put('/:storeId/deviations/:deviationId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const deviationId = String(req.params.deviationId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (req.body?.corrective_action !== undefined) {
      updates.corrective_action = req.body.corrective_action;
      updates.corrected_by = req.user!.id;
      updates.corrected_at = new Date().toISOString();
      if (req.body?.status !== 'approved' && req.body?.status !== 'closed') {
        updates.status = 'corrected';
      }
    }
    if (req.body?.status !== undefined) {
      updates.status = req.body.status;
      if (req.body.status === 'approved') {
        updates.approved_by = req.user!.id;
        updates.approved_at = new Date().toISOString();
      }
    }

    const { data, error } = await supabaseAdmin
      .from('checklist_deviations')
      .update(updates)
      .eq('id', deviationId)
      .eq('store_id', storeId)
      .select('*')
      .maybeSingle();

    if (error) { res.status(500).json({ error: error.message }); return; }
    if (!data) { res.status(404).json({ error: '逸脱記録が見つかりません' }); return; }

    res.json({ deviation: data });
  } catch (e: any) {
    console.error('[haccp PUT /:storeId/deviations/:deviationId] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});
