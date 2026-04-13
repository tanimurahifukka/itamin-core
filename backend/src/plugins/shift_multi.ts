import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import type { Express } from 'express';
import type { Plugin } from '../types';
import { requireOrgManager, getOrgStoreIds, staffBelongsToStore } from '../auth/authorization';

const router = Router();

interface MultiShiftRow {
  id: string;
  store_id: string;
  staff_id: string;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  status: string | null;
  note: string | null;
  staff: { id: string; user_id: string; user: { name: string } | null } | null;
}

interface StaffRow {
  id: string;
  store_id: string;
  user_id: string;
  role: string;
  user: { name: string } | null;
}

interface ShiftRequestRow {
  id: string;
  store_id: string;
  staff_id: string;
  date: string;
  request_type: string;
  start_time: string | null;
  end_time: string | null;
  note: string | null;
  staff: { user_id: string; user: { name: string } | null } | null;
}

// ============================================================
// ユーティリティ: 時間帯の重複判定
// ============================================================
export function hasTimeOverlap(
  a: { startTime: string; endTime: string },
  b: { startTime: string; endTime: string },
): boolean {
  return a.startTime < b.endTime && b.startTime < a.endTime;
}

// ============================================================
// 組織配下全店舗の週間シフト取得
// ============================================================
router.get('/:orgId/weekly', requireAuth, async (req: Request, res: Response) => {
  try {
    const orgId = String(req.params.orgId);
    const manager = await requireOrgManager(req, res, orgId);
    if (!manager) return;

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

    const storeIds = await getOrgStoreIds(orgId);
    if (storeIds.length === 0) {
      res.json({ stores: [], shifts: [], requests: [], startDate, endDate });
      return;
    }

    // 店舗情報
    const { data: storesData } = await supabaseAdmin
      .from('stores')
      .select('id, name')
      .in('id', storeIds);
    interface StoreRow { id: string; name: string }
    const stores = (storesData || []).map((s: StoreRow) => ({ id: s.id, name: s.name }));

    // シフト取得（store_staff → profiles を JOIN して user_id と名前を取得）
    const { data: shiftsData, error: shiftsErr } = await supabaseAdmin
      .from('shifts')
      .select('*, staff:store_staff(id, user_id, user:profiles(name))')
      .in('store_id', storeIds)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')
      .order('start_time');

    if (shiftsErr) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    const shifts = (shiftsData || []).map((s: MultiShiftRow) => ({
      id: s.id,
      storeId: s.store_id,
      storeName: stores.find(st => st.id === s.store_id)?.name || '',
      staffId: s.staff_id,
      userId: s.staff?.user_id || '',
      userName: s.staff?.user?.name || '',
      date: s.date,
      startTime: s.start_time,
      endTime: s.end_time,
      breakMinutes: s.break_minutes,
      status: s.status || 'draft',
      note: s.note,
    }));

    // シフト希望取得
    const { data: requestsData } = await supabaseAdmin
      .from('shift_requests')
      .select('*, staff:store_staff(id, user_id, user:profiles(name))')
      .in('store_id', storeIds)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date');

    const requests = (requestsData || []).map((r: ShiftRequestRow) => ({
      id: r.id,
      storeId: r.store_id,
      storeName: stores.find(st => st.id === r.store_id)?.name || '',
      staffId: r.staff_id,
      userId: r.staff?.user_id || '',
      userName: r.staff?.user?.name || '',
      date: r.date,
      requestType: r.request_type,
      startTime: r.start_time,
      endTime: r.end_time,
      note: r.note,
    }));

    res.json({ stores, shifts, requests, startDate, endDate });
  } catch (e: unknown) {
    console.error('[shift_multi GET /:orgId/weekly] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================================
// 組織配下全店舗のスタッフ一覧（user_id でグループ化）
// ============================================================
router.get('/:orgId/staff', requireAuth, async (req: Request, res: Response) => {
  try {
    const orgId = String(req.params.orgId);
    const manager = await requireOrgManager(req, res, orgId);
    if (!manager) return;

    const storeIds = await getOrgStoreIds(orgId);
    if (storeIds.length === 0) {
      res.json({ employees: [] });
      return;
    }

    const { data: storesData } = await supabaseAdmin
      .from('stores')
      .select('id, name')
      .in('id', storeIds);
    const storeMap = new Map((storesData || []).map((s: { id: string; name: string }) => [s.id, s.name]));

    const { data, error } = await supabaseAdmin
      .from('store_staff')
      .select('id, store_id, user_id, role, user:profiles(name)')
      .in('store_id', storeIds)
      .order('user_id');

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    // user_id でグループ化
    const grouped = new Map<string, {
      userId: string;
      name: string;
      stores: Array<{ storeId: string; storeName: string; staffId: string; role: string }>;
    }>();

    for (const row of (data || []) as StaffRow[]) {
      const userId = row.user_id;
      if (!grouped.has(userId)) {
        grouped.set(userId, {
          userId,
          name: row.user?.name || '',
          stores: [],
        });
      }
      grouped.get(userId)!.stores.push({
        storeId: row.store_id,
        storeName: storeMap.get(row.store_id) || '',
        staffId: row.id,
        role: row.role,
      });
    }

    res.json({ employees: Array.from(grouped.values()) });
  } catch (e: unknown) {
    console.error('[shift_multi GET /:orgId/staff] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================================
// 重複検出
// ============================================================
router.get('/:orgId/conflicts', requireAuth, async (req: Request, res: Response) => {
  try {
    const orgId = String(req.params.orgId);
    const manager = await requireOrgManager(req, res, orgId);
    if (!manager) return;

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

    const storeIds = await getOrgStoreIds(orgId);
    if (storeIds.length === 0) {
      res.json({ conflicts: [] });
      return;
    }

    const { data: storesData } = await supabaseAdmin
      .from('stores')
      .select('id, name')
      .in('id', storeIds);
    const storeMap = new Map((storesData || []).map((s: { id: string; name: string }) => [s.id, s.name]));

    interface ConflictShiftRow {
      id: string;
      store_id: string;
      date: string;
      start_time: string;
      end_time: string;
      staff: { user_id: string; user: { name: string } | null } | null;
    }

    const { data: shiftsData, error } = await supabaseAdmin
      .from('shifts')
      .select('*, staff:store_staff(user_id, user:profiles(name))')
      .in('store_id', storeIds)
      .gte('date', startDate)
      .lte('date', endDate);

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    // user_id + date でグループ化して重複検出
    const groupKey = (userId: string, date: string) => `${userId}:${date}`;
    const groups = new Map<string, ConflictShiftRow[]>();

    for (const s of (shiftsData || []) as ConflictShiftRow[]) {
      const key = groupKey(s.staff?.user_id ?? '', s.date);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }

    const conflicts: Array<{
      userId: string;
      userName: string;
      date: string;
      shifts: Array<{ storeId: string; storeName: string; startTime: string; endTime: string }>;
      hasTimeOverlap: boolean;
    }> = [];

    for (const [, group] of groups) {
      if (group.length < 2) continue;

      // 異なる店舗のシフトがあるか確認
      const uniqueStores = new Set(group.map(s => s.store_id));
      if (uniqueStores.size < 2) continue;

      const shiftEntries = group.map(s => ({
        storeId: s.store_id,
        storeName: storeMap.get(s.store_id) || '',
        startTime: s.start_time,
        endTime: s.end_time,
      }));

      // 時間帯重複の判定
      let overlap = false;
      for (let i = 0; i < shiftEntries.length && !overlap; i++) {
        for (let j = i + 1; j < shiftEntries.length && !overlap; j++) {
          if (hasTimeOverlap(shiftEntries[i], shiftEntries[j])) {
            overlap = true;
          }
        }
      }

      conflicts.push({
        userId: group[0].staff?.user_id,
        userName: group[0].staff?.user?.name || '',
        date: group[0].date,
        shifts: shiftEntries,
        hasTimeOverlap: overlap,
      });
    }

    res.json({ conflicts });
  } catch (e: unknown) {
    console.error('[shift_multi GET /:orgId/conflicts] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================================
// シフト作成（重複警告付き）
// ============================================================
router.post('/:orgId/shifts', requireAuth, async (req: Request, res: Response) => {
  try {
    const orgId = String(req.params.orgId);
    const manager = await requireOrgManager(req, res, orgId);
    if (!manager) return;

    const { storeId, staffId, date, startTime, endTime, breakMinutes, note, status } = req.body as {
      storeId?: string;
      staffId?: string;
      date?: string;
      startTime?: string;
      endTime?: string;
      breakMinutes?: number;
      note?: string;
      status?: string;
    };

    if (!storeId || !staffId || !date || !startTime || !endTime) {
      res.status(400).json({ error: 'storeId, staffId, date, startTime, endTime は必須です' });
      return;
    }

    if (startTime >= endTime) {
      res.status(400).json({ error: '終了時刻は開始時刻より後に設定してください' });
      return;
    }

    // 対象店舗が組織配下か検証
    const storeIds = await getOrgStoreIds(orgId);
    if (!storeIds.includes(storeId)) {
      res.status(400).json({ error: '指定された店舗はこの組織に所属していません' });
      return;
    }

    // staffId が対象店舗に所属するか検証
    if (!(await staffBelongsToStore(storeId, staffId))) {
      res.status(400).json({ error: '指定された staffId はこの店舗に所属していません' });
      return;
    }

    // 同一 user_id の他店舗シフトを検索して重複チェック
    const { data: staffData } = await supabaseAdmin
      .from('store_staff')
      .select('user_id')
      .eq('id', staffId)
      .single();

    const userId = (staffData as { user_id: string } | null)?.user_id;
    let conflicts: Array<{ storeId: string; storeName: string; startTime: string; endTime: string }> = [];

    if (userId) {
      // 他店舗の同一ユーザーの store_staff ID を取得
      const { data: otherStaffData } = await supabaseAdmin
        .from('store_staff')
        .select('id, store_id')
        .eq('user_id', userId)
        .in('store_id', storeIds.filter(id => id !== storeId));

      if (otherStaffData && otherStaffData.length > 0) {
        const otherStaffIds = otherStaffData.map(s => s.id);
        const { data: otherShifts } = await supabaseAdmin
          .from('shifts')
          .select('store_id, start_time, end_time')
          .in('staff_id', otherStaffIds)
          .eq('date', date);

        if (otherShifts) {
          const { data: storesData } = await supabaseAdmin
            .from('stores')
            .select('id, name')
            .in('id', storeIds);
          const storeMap = new Map((storesData || []).map((s: { id: string; name: string }) => [s.id, s.name]));

          for (const os of otherShifts) {
            if (hasTimeOverlap(
              { startTime, endTime },
              { startTime: os.start_time, endTime: os.end_time },
            )) {
              conflicts.push({
                storeId: os.store_id,
                storeName: storeMap.get(os.store_id) || '',
                startTime: os.start_time,
                endTime: os.end_time,
              });
            }
          }
        }
      }
    }

    // シフト upsert
    const { data, error } = await supabaseAdmin
      .from('shifts')
      .upsert({
        store_id: storeId,
        staff_id: staffId,
        date,
        start_time: startTime,
        end_time: endTime,
        break_minutes: breakMinutes ?? 0,
        note: note || null,
        status: status ?? 'draft',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'store_id,staff_id,date' })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    res.status(201).json({ shift: data, conflicts });
  } catch (e: unknown) {
    console.error('[shift_multi POST /:orgId/shifts] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================================
// 組織配下全店舗のシフト一括確定
// ============================================================
router.post('/:orgId/publish', requireAuth, async (req: Request, res: Response) => {
  try {
    const orgId = String(req.params.orgId);
    const manager = await requireOrgManager(req, res, orgId);
    if (!manager) return;

    const { startDate, endDate, storeIds: requestedStoreIds } = req.body as {
      startDate?: string;
      endDate?: string;
      storeIds?: string[];
    };

    if (!startDate || !endDate) {
      res.status(400).json({ error: 'startDate, endDate は必須です' });
      return;
    }

    const orgStoreIds = await getOrgStoreIds(orgId);
    // リクエストで指定があればフィルタ、なければ全店舗
    const targetStoreIds = requestedStoreIds
      ? requestedStoreIds.filter(id => orgStoreIds.includes(id))
      : orgStoreIds;

    if (targetStoreIds.length === 0) {
      res.json({ published: 0 });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('shifts')
      .update({ status: 'published', updated_at: new Date().toISOString() })
      .in('store_id', targetStoreIds)
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
    console.error('[shift_multi POST /:orgId/publish] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================================
// シフト削除
// ============================================================
router.delete('/:orgId/shifts/:shiftId', requireAuth, async (req: Request, res: Response) => {
  try {
    const orgId = String(req.params.orgId);
    const shiftId = String(req.params.shiftId);
    const manager = await requireOrgManager(req, res, orgId);
    if (!manager) return;

    // シフトの店舗が組織配下か検証
    const { data: shiftData } = await supabaseAdmin
      .from('shifts')
      .select('store_id')
      .eq('id', shiftId)
      .single();

    if (!shiftData) {
      res.status(404).json({ error: 'シフトが見つかりません' });
      return;
    }

    const storeIds = await getOrgStoreIds(orgId);
    if (!storeIds.includes((shiftData as { store_id: string }).store_id)) {
      res.status(403).json({ error: 'この組織に属さない店舗のシフトは削除できません' });
      return;
    }

    const { error } = await supabaseAdmin
      .from('shifts')
      .delete()
      .eq('id', shiftId);

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    res.json({ ok: true });
  } catch (e: unknown) {
    console.error('[shift_multi DELETE /:orgId/shifts/:shiftId] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================================
// プラグインエクスポート
// ============================================================
export const shiftMultiPlugin: Plugin = {
  name: 'shift_multi',
  version: '0.1.0',
  description: '複数店舗横断シフト管理',
  label: 'マルチ店舗シフト',
  icon: '🏢',
  category: 'attendance',
  defaultRoles: ['owner', 'manager'],
  settingsSchema: [],
  initialize: (app: Express) => {
    app.use('/api/shift-multi', router);
  },
};
