import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import type { Express } from 'express';
import type { Plugin } from '../types';
import { requireManagedStore } from '../auth/authorization';

const router = Router();

// ============================================================
// スタッフ別連勤日数一覧
// ============================================================
router.get('/:storeId/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    // スタッフ一覧取得（user_id で attendance_records と突き合わせる）
    const { data: members } = await supabaseAdmin
      .from('store_staff')
      .select('id, user_id, role, user:profiles(name, email)')
      .eq('store_id', storeId);

    // 過去30日の勤怠レコードを取得（business_date ベース）
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = `${thirtyDaysAgo.getFullYear()}-${String(thirtyDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(thirtyDaysAgo.getDate()).padStart(2, '0')}`;

    const { data: records, error } = await supabaseAdmin
      .from('attendance_records')
      .select('user_id, business_date')
      .eq('store_id', storeId)
      .gte('business_date', thirtyDaysAgoStr)
      .order('business_date', { ascending: true });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    interface StaffMember { id: string; user_id: string; role: string; user: { name: string | null; email: string | null }[] | null }
    interface AttendanceRow { user_id: string; business_date: string }

    const staffStatus = ((members || []) as unknown as StaffMember[]).map(m => {
      // user_id でフィルタ
      const staffRecords = ((records || []) as AttendanceRow[]).filter(r => r.user_id === m.user_id);
      const workDates = new Set<string>();
      for (const r of staffRecords) {
        workDates.add(r.business_date);
      }

      // 今日から遡って連勤日数をカウント
      let consecutiveDays = 0;
      const checkDate = new Date(today);

      // 今日の出勤がなければ昨日から数える
      const todayStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
      if (!workDates.has(todayStr)) {
        checkDate.setDate(checkDate.getDate() - 1);
      }

      for (let i = 0; i < 30; i++) {
        const dateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
        if (workDates.has(dateStr)) {
          consecutiveDays++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }

      const profile = Array.isArray(m.user) ? m.user[0] : null;
      return {
        userId: m.user_id,
        name: profile?.name || profile?.email || '不明',
        role: m.role,
        consecutiveDays,
        level: consecutiveDays >= 6 ? 'danger' : consecutiveDays >= 5 ? 'warning' : 'normal',
      };
    });

    // 連勤日数が多い順にソート
    staffStatus.sort((a, b) => b.consecutiveDays - a.consecutiveDays);

    res.json({ staffStatus });
  } catch (e: any) {
    console.error('[consecutive_work GET /:storeId/status] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

export const consecutiveWorkPlugin: Plugin = {
  name: 'consecutive_work',
  version: '0.1.0',
  description: '連続出勤日数の検知と警告',
  label: '連勤チェック',
  icon: '📊',
  defaultRoles: ['owner', 'manager', 'leader'],
  initialize: (app: Express) => {
    app.use('/api/consecutive-work', router);
  },
};
