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
  const storeId = String(req.params.storeId);
  const membership = await requireManagedStore(req, res, storeId);
  if (!membership) return;

  // スタッフ一覧取得（store_staff.id でマッチさせるため id も取得）
  const { data: members } = await supabaseAdmin
    .from('store_staff')
    .select('id, user_id, role, user:profiles(name, email)')
    .eq('store_id', storeId);

  // 過去30日の打刻レコードを取得（staff_id は store_staff.id）
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: records, error } = await supabaseAdmin
    .from('time_records')
    .select('staff_id, clock_in')
    .eq('store_id', storeId)
    .gte('clock_in', thirtyDaysAgo.toISOString())
    .order('clock_in', { ascending: true });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const staffStatus = (members || []).map((m: any) => {
    // staff_id = store_staff.id でフィルタ
    const staffRecords = (records || []).filter((r: any) => r.staff_id === m.id);
    const workDates = new Set<string>();
    for (const r of staffRecords) {
      const d = new Date(r.clock_in);
      workDates.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
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

    return {
      userId: m.user_id,
      name: (m as any).user?.name || (m as any).user?.email || '不明',
      role: m.role,
      consecutiveDays,
      level: consecutiveDays >= 6 ? 'danger' : consecutiveDays >= 5 ? 'warning' : 'normal',
    };
  });

  // 連勤日数が多い順にソート
  staffStatus.sort((a: any, b: any) => b.consecutiveDays - a.consecutiveDays);

  res.json({ staffStatus });
});

export const consecutiveWorkPlugin: Plugin = {
  name: 'consecutive_work',
  version: '0.1.0',
  description: '連続出勤日数の検知と警告',
  label: '連勤チェック',
  icon: '📊',
  defaultRoles: ['owner', 'manager'],
  initialize: (app: Express) => {
    app.use('/api/consecutive-work', router);
  },
};
