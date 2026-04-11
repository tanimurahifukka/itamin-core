import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import type { Express } from 'express';
import type { Plugin } from '../types';
import { requireManagedStore } from '../auth/authorization';

const router = Router();

// ============================================================
// スタッフ別残業時間一覧（今月）
// ============================================================
router.get('/:storeId/monthly', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const year = Number(req.query.year) || new Date().getFullYear();
    const month = Number(req.query.month) || new Date().getMonth() + 1;

    if (month < 1 || month > 12) {
      res.status(400).json({ error: '月は1〜12で指定してください' });
      return;
    }

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`;

    // スタッフ一覧取得（user_id で attendance_records と突き合わせる）
    const { data: members } = await supabaseAdmin
      .from('store_staff')
      .select('id, user_id, role, user:profiles(name, email)')
      .eq('store_id', storeId);

    // 今月の勤怠レコード取得（business_date ベース、completed のみ、休憩時間含む）
    const endBusinessDate = month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`;

    const { data: records, error } = await supabaseAdmin
      .from('attendance_records')
      .select('user_id, clock_in_at, clock_out_at, breaks:attendance_breaks(started_at, ended_at)')
      .eq('store_id', storeId)
      .gte('business_date', startDate)
      .lt('business_date', endBusinessDate)
      .eq('status', 'completed');

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    // プラグイン設定から上限時間を取得
    const { data: pluginSetting } = await supabaseAdmin
      .from('store_plugins')
      .select('config')
      .eq('store_id', storeId)
      .eq('plugin_name', 'overtime_alert')
      .maybeSingle();

    const monthlyLimitHours = pluginSetting?.config?.monthly_limit_hours ?? 45;
    const standardHoursPerDay = pluginSetting?.config?.standard_hours_per_day ?? 8;

    interface StaffMember { id: string; user_id: string; role: string; user: { name: string | null; email: string | null }[] | null }
    interface BreakRow { started_at: string; ended_at: string | null }
    interface AttendanceRow { user_id: string; clock_in_at: string; clock_out_at: string | null; breaks: BreakRow[] | null }

    const allRecords = (records || []) as unknown as AttendanceRow[];

    // スタッフ別に残業時間を計算（user_id でマッチ）
    const staffOvertime = ((members || []) as unknown as StaffMember[]).map(m => {
      const staffRecords = allRecords.filter(r => r.user_id === m.user_id);
      let totalWorkMinutes = 0;
      let totalDays = 0;

      for (const r of staffRecords) {
        if (!r.clock_out_at) continue;
        const clockIn = new Date(r.clock_in_at);
        const clockOut = new Date(r.clock_out_at);
        let breakMinutes = 0;
        for (const b of r.breaks || []) {
          if (b.ended_at) {
            breakMinutes += (new Date(b.ended_at).getTime() - new Date(b.started_at).getTime()) / 60000;
          }
        }
        const workMinutes = (clockOut.getTime() - clockIn.getTime()) / 60000 - breakMinutes;
        totalWorkMinutes += Math.max(0, workMinutes);
        totalDays++;
      }

      const standardMinutes = totalDays * standardHoursPerDay * 60;
      const overtimeMinutes = Math.max(0, totalWorkMinutes - standardMinutes);
      const overtimeHours = Math.round(overtimeMinutes / 6) / 10; // 小数第1位

      const profile = Array.isArray(m.user) ? m.user[0] : null;
      return {
        userId: m.user_id,
        name: profile?.name || profile?.email || '不明',
        role: m.role,
        totalWorkHours: Math.round(totalWorkMinutes / 6) / 10,
        totalDays,
        overtimeHours,
        limitHours: monthlyLimitHours,
        exceeded: overtimeHours >= monthlyLimitHours,
        warning: overtimeHours >= monthlyLimitHours * 0.8,
      };
    });

    res.json({
      staffOvertime,
      settings: { monthlyLimitHours, standardHoursPerDay },
      year,
      month,
    });
  } catch (e: any) {
    console.error('[overtime_alert GET /:storeId/monthly] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

export const overtimeAlertPlugin: Plugin = {
  name: 'overtime_alert',
  version: '0.1.0',
  description: '残業時間の自動集計と閾値超え警告',
  label: '残業アラート',
  icon: '⏰',
  defaultRoles: ['owner', 'manager', 'leader'],
  settingsSchema: [
    {
      key: 'monthly_limit_hours',
      label: '月間残業上限（時間）',
      type: 'number',
      default: 45,
      description: 'この時間を超えると警告表示されます',
    },
    {
      key: 'standard_hours_per_day',
      label: '1日の所定労働時間',
      type: 'number',
      default: 8,
      description: 'この時間を超えた分が残業として計算されます',
    },
  ],
  initialize: (app: Express) => {
    app.use('/api/overtime-alert', router);
  },
};
