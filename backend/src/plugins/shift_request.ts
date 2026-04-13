/**
 * シフト希望 プラグイン
 *
 * 鉄則1 (1 Plugin = 1 Function) に従い、シフト本体 (`shift.ts`) とは
 * 別ファイルで管理する。フロントエンドは引き続き `/api/shift/:storeId/requests`
 * を叩くため、マウントパスは shift プラグインと同じ `/api/shift` のまま。
 */
import { Router, Request, Response } from 'express';
import type { Express } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import type { Plugin } from '../types';
import {
  isManagedRole,
  isShiftRequestEnabled,
  requireStoreMembership,
  staffBelongsToStore,
} from '../auth/authorization';

/** Row from shift_requests with joined staff/profile */
interface ShiftRequestRow {
  id: string;
  staff_id: string;
  date: string;
  request_type: string;
  start_time: string | null;
  end_time: string | null;
  note: string | null;
  staff: { id: string; user: { name: string } | null } | null;
}

const router = Router();

// 週間の希望取得
router.get('/:storeId/requests', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const dateStr = req.query.date as string;
    const days = Math.min(Math.max(parseInt(req.query.days as string) || 7, 1), 31);
    const baseDate = dateStr ? new Date(dateStr) : new Date();

    const day = baseDate.getDay();
    const monday = new Date(baseDate);
    monday.setDate(baseDate.getDate() - (day === 0 ? 6 : day - 1));
    const lastDay = new Date(monday);
    lastDay.setDate(monday.getDate() + days - 1);

    const startDate = monday.toISOString().split('T')[0];
    const endDate = lastDay.toISOString().split('T')[0];

    const { data, error } = await supabaseAdmin
      .from('shift_requests')
      .select('*, staff:store_staff(id, user:profiles(name))')
      .eq('store_id', storeId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date');

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    const requests = ((data || []) as ShiftRequestRow[]).map((r: ShiftRequestRow) => ({
      id: r.id,
      staffId: r.staff_id,
      staffName: r.staff?.user?.name || '',
      date: r.date,
      requestType: r.request_type,
      startTime: r.start_time,
      endTime: r.end_time,
      note: r.note,
    }));

    res.json({ startDate, endDate, requests });
  } catch (e: unknown) {
    console.error('[shift_request GET /:storeId/requests] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 希望登録・更新
router.post('/:storeId/requests', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const staffId = req.body?.staffId;
    const date = req.body?.date;
    const requestType = req.body?.requestType ?? 'available';
    const startTime = req.body?.startTime;
    const endTime = req.body?.endTime;
    const note = req.body?.note;
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    if (!staffId || !date) {
      res.status(400).json({ error: 'staffId, date は必須です' });
      return;
    }

    if (!(await staffBelongsToStore(storeId, staffId))) {
      res.status(400).json({ error: '指定された staffId はこの店舗に所属していません' });
      return;
    }

    if (!isManagedRole(membership.role)) {
      if (!(await isShiftRequestEnabled(storeId))) {
        res.status(403).json({ error: 'シフト希望の提出は無効化されています' });
        return;
      }
      if (staffId !== membership.id) {
        res.status(403).json({ error: '自分のシフト希望のみ登録できます' });
        return;
      }
    }

    const { data, error } = await supabaseAdmin
      .from('shift_requests')
      .upsert(
        {
          store_id: storeId,
          staff_id: staffId,
          date,
          request_type: requestType,
          start_time: startTime || null,
          end_time: endTime || null,
          note,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'store_id,staff_id,date' },
      )
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    res.status(201).json({ request: data });
  } catch (e: unknown) {
    console.error('[shift_request POST /:storeId/requests] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 希望削除
router.delete('/:storeId/requests/:requestId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const requestId = String(req.params.requestId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('shift_requests')
      .select('store_id, staff_id')
      .eq('id', requestId)
      .maybeSingle();

    if (existingError || !existing || existing.store_id !== storeId) {
      res.status(404).json({ error: 'シフト希望が見つかりません' });
      return;
    }

    if (!isManagedRole(membership.role) && existing.staff_id !== membership.id) {
      res.status(403).json({ error: '自分のシフト希望のみ削除できます' });
      return;
    }

    const { error } = await supabaseAdmin
      .from('shift_requests')
      .delete()
      .eq('id', requestId)
      .eq('store_id', storeId);

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    res.json({ ok: true });
  } catch (e: unknown) {
    console.error('[shift_request DELETE /:storeId/requests/:requestId] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export const shiftRequestPlugin: Plugin = {
  name: 'shift_request',
  version: '0.3.0',
  description: 'シフト希望の提出',
  label: 'シフト希望',
  icon: '📋',
  category: 'attendance',
  defaultRoles: ['full_time', 'part_time'],
  settingsSchema: [
    {
      key: 'allow_staff_request',
      label: 'スタッフのシフト希望提出',
      type: 'boolean',
      default: true,
      description: 'スタッフが希望シフトを提出できるようにする',
    },
  ],
  initialize: (app: Express) => {
    app.use('/api/shift', router);
  },
};
