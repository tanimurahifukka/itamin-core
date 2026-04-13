import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import type { Express } from 'express';
import type { Plugin } from '../types';
import { requireManagedStore, requireStoreMembership, staffBelongsToStore } from '../auth/authorization';

const router = Router();

// ============================================================
// 週間シフト取得
// ============================================================
router.get('/:storeId/weekly', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) {
      return;
    }
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

    const supabase = supabaseAdmin;

    const { data, error } = await supabase
      .from('shifts')
      .select('*, staff:store_staff(id, user:profiles(name))')
      .eq('store_id', storeId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')
      .order('start_time');

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    interface ShiftRow {
      id: string;
      staff_id: string;
      staff: { user: { name: string } | null } | null;
      date: string;
      start_time: string;
      end_time: string;
      break_minutes: number;
      note: string | null;
      status: string | null;
    }
    const shifts = (data || []).map((s: ShiftRow) => ({
      id: s.id,
      staffId: s.staff_id,
      staffName: s.staff?.user?.name || '',
      date: s.date,
      startTime: s.start_time,
      endTime: s.end_time,
      breakMinutes: s.break_minutes,
      note: s.note,
      status: s.status || 'draft',
    }));

    res.json({ startDate, endDate, shifts });
  } catch (e: unknown) {
    console.error('[shift GET /:storeId/weekly] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================================
// シフト追加・更新
// ============================================================
router.post('/:storeId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const staffId = req.body?.staffId;
    const date = req.body?.date;
    const startTime = req.body?.startTime;
    const endTime = req.body?.endTime;
    const breakMinutes = req.body?.breakMinutes ?? 0;
    const note = req.body?.note;
    const status = req.body?.status ?? 'draft';
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) {
      return;
    }

    if (!staffId || !date || !startTime || !endTime) {
      res.status(400).json({ error: 'staffId, date, startTime, endTime は必須です' });
      return;
    }

    const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
      res.status(400).json({ error: '時刻は HH:MM 形式で入力してください' });
      return;
    }

    if (startTime >= endTime) {
      res.status(400).json({ error: '終了時刻は開始時刻より後に設定してください' });
      return;
    }

    if (!(await staffBelongsToStore(storeId, staffId))) {
      res.status(400).json({ error: '指定された staffId はこの店舗に所属していません' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('shifts')
      .upsert({
        store_id: storeId,
        staff_id: staffId,
        date,
        start_time: startTime,
        end_time: endTime,
        break_minutes: breakMinutes,
        note,
        status,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'store_id,staff_id,date' })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    res.status(201).json({ shift: data });
  } catch (e: unknown) {
    console.error('[shift POST /:storeId] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================================
// シフト一括確定（週単位）
// ============================================================
router.post('/:storeId/publish', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const startDate = req.body?.startDate;
    const endDate = req.body?.endDate;
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) {
      return;
    }

    if (!startDate || !endDate) {
      res.status(400).json({ error: 'startDate, endDate は必須です' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('shifts')
      .update({ status: 'published', updated_at: new Date().toISOString() })
      .eq('store_id', storeId)
      .eq('status', 'draft')
      .gte('date', startDate)
      .lte('date', endDate)
      .select();

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    res.json({ published: (data || []).length });
  } catch (e: unknown) {
    console.error('[shift POST /:storeId/publish] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================================
// シフト削除
// ============================================================
router.delete('/:storeId/:shiftId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const shiftId = String(req.params.shiftId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) {
      return;
    }

    const { error } = await supabaseAdmin
      .from('shifts')
      .delete()
      .eq('id', shiftId)
      .eq('store_id', storeId);

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    res.json({ ok: true });
  } catch (e: unknown) {
    console.error('[shift DELETE /:storeId/:shiftId] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// シフト希望は shift_request プラグインに移管済み (鉄則1)

// ============================================================
// シフトテンプレート CRUD
// ============================================================

// テンプレート一覧
router.get('/:storeId/templates', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) {
      return;
    }
    const supabase = supabaseAdmin;

    const { data, error } = await supabase
      .from('shift_templates')
      .select('*')
      .eq('store_id', storeId)
      .order('name');

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    interface TemplateRow {
      id: string;
      name: string;
      start_time: string;
      end_time: string;
      break_minutes: number;
      color: string | null;
    }
    const templates = (data || []).map((t: TemplateRow) => ({
      id: t.id,
      name: t.name,
      startTime: t.start_time,
      endTime: t.end_time,
      breakMinutes: t.break_minutes,
      color: t.color,
    }));

    res.json({ templates });
  } catch (e: unknown) {
    console.error('[shift GET /:storeId/templates] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// テンプレート作成
router.post('/:storeId/templates', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const name = req.body?.name;
    const startTime = req.body?.startTime;
    const endTime = req.body?.endTime;
    const breakMinutes = req.body?.breakMinutes ?? 0;
    const color = req.body?.color;
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) {
      return;
    }

    if (!name || !startTime || !endTime) {
      res.status(400).json({ error: 'name, startTime, endTime は必須です' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('shift_templates')
      .upsert({
        store_id: storeId,
        name,
        start_time: startTime,
        end_time: endTime,
        break_minutes: breakMinutes,
        color,
      }, { onConflict: 'store_id,name' })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    res.status(201).json({ template: data });
  } catch (e: unknown) {
    console.error('[shift POST /:storeId/templates] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// テンプレート削除
router.delete('/:storeId/templates/:templateId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const templateId = String(req.params.templateId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) {
      return;
    }

    const { error } = await supabaseAdmin
      .from('shift_templates')
      .delete()
      .eq('id', templateId)
      .eq('store_id', storeId);

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    res.json({ ok: true });
  } catch (e: unknown) {
    console.error('[shift DELETE /:storeId/templates/:templateId] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================================
// プラグインエクスポート
// ============================================================
// 注: シフト希望の提出機能は shift_request.ts に分離済み (鉄則1)。
export const shiftPlugin: Plugin = {
  name: 'shift',
  version: '0.3.0',
  description: 'シフト管理・テンプレート機能',
  label: 'シフト管理',
  icon: '📅',
  category: 'attendance',
  defaultRoles: ['owner', 'manager', 'leader'],
  settingsSchema: [
    {
      key: 'default_start_time',
      label: 'デフォルト開始時間',
      type: 'text',
      default: '09:00',
      description: 'シフト作成時の初期値',
    },
    {
      key: 'default_end_time',
      label: 'デフォルト終了時間',
      type: 'text',
      default: '17:00',
      description: 'シフト作成時の初期値',
    },
  ],
  initialize: (app: Express) => {
    app.use('/api/shift', router);
  },
};
