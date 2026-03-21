import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { createSupabaseClient } from '../config/supabase';

const router = Router();

// 店舗作成
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const { name, address } = req.body;
  if (!name) {
    res.status(400).json({ error: '店舗名は必須です' });
    return;
  }

  const supabase = createSupabaseClient(req.accessToken!);
  const userId = req.user!.id;

  // 店舗を作成
  const { data: store, error: storeErr } = await supabase
    .from('stores')
    .insert({ name, address, owner_id: userId })
    .select()
    .single();

  if (storeErr) {
    res.status(500).json({ error: storeErr.message });
    return;
  }

  // オーナーをスタッフとして自動登録
  const { data: staff, error: staffErr } = await supabase
    .from('store_staff')
    .insert({ store_id: store.id, user_id: userId, role: 'owner' })
    .select()
    .single();

  if (staffErr) {
    res.status(500).json({ error: staffErr.message });
    return;
  }

  res.status(201).json({ store, staffId: staff.id });
});

// 自分の所属店舗一覧
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const supabase = createSupabaseClient(req.accessToken!);

  const { data, error } = await supabase
    .from('store_staff')
    .select('role, store:stores(id, name, address)')
    .eq('user_id', req.user!.id);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const stores = (data || []).map((d: any) => ({
    id: d.store.id,
    name: d.store.name,
    address: d.store.address,
    role: d.role,
  }));

  res.json({ stores });
});

// スタッフ招待
router.post('/:storeId/staff', requireAuth, async (req: Request, res: Response) => {
  const storeId = req.params.storeId as string;
  const { email, role = 'staff', hourlyWage } = req.body;

  const supabase = createSupabaseClient(req.accessToken!);

  // 招待先ユーザーを検索
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single();

  if (!profile) {
    res.status(404).json({ error: 'ユーザーが見つかりません。先にGoogleログインが必要です。' });
    return;
  }

  const { data: staff, error } = await supabase
    .from('store_staff')
    .insert({
      store_id: storeId,
      user_id: profile.id,
      role,
      hourly_wage: hourlyWage,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      res.status(409).json({ error: '既にこの店舗に所属しています' });
    } else {
      res.status(500).json({ error: error.message });
    }
    return;
  }

  res.status(201).json({ staff });
});

// 店舗のスタッフ一覧
router.get('/:storeId/staff', requireAuth, async (req: Request, res: Response) => {
  const storeId = req.params.storeId as string;
  const supabase = createSupabaseClient(req.accessToken!);

  const { data, error } = await supabase
    .from('store_staff')
    .select('id, role, hourly_wage, joined_at, user:profiles(id, name, email, picture)')
    .eq('store_id', storeId);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const staff = (data || []).map((s: any) => ({
    id: s.id,
    role: s.role,
    hourlyWage: s.hourly_wage,
    joinedAt: s.joined_at,
    userId: s.user.id,
    userName: s.user.name,
    email: s.user.email,
    picture: s.user.picture,
  }));

  res.json({ staff });
});

export const storesRouter = router;
