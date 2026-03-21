import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { createSupabaseClient, supabaseAdmin } from '../config/supabase';

const router = Router();

// 店舗作成（サーバーサイドでRLSバイパス — 認証済みユーザーのみ）
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const { name, address } = req.body;
  if (!name) {
    res.status(400).json({ error: '店舗名は必須です' });
    return;
  }

  const userId = req.user!.id;

  // 店舗を作成（service role でRLSバイパス）
  const { data: store, error: storeErr } = await supabaseAdmin
    .from('stores')
    .insert({ name, address, owner_id: userId })
    .select()
    .single();

  if (storeErr) {
    res.status(500).json({ error: storeErr.message });
    return;
  }

  // オーナーをスタッフとして自動登録
  const { data: staff, error: staffErr } = await supabaseAdmin
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

// スタッフ招待（既存ユーザーは即追加、未登録は招待メール送信）
router.post('/:storeId/staff', requireAuth, async (req: Request, res: Response) => {
  const storeId = req.params.storeId as string;
  const { name, email, role = 'staff', hourlyWage } = req.body;

  if (!email || !name) {
    res.status(400).json({ error: '名前とメールアドレスは必須です' });
    return;
  }

  // 既存ユーザーか検索
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single();

  if (profile) {
    // 既存ユーザー → 即スタッフ追加
    const { data: staff, error } = await supabaseAdmin
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
        res.status(409).json({ error: '既にこの事業所に所属しています' });
      } else {
        res.status(500).json({ error: error.message });
      }
      return;
    }

    res.status(201).json({ staff, invited: false });
  } else {
    // 未登録ユーザー → 招待レコード作成 + 招待メール送信
    const { error: invErr } = await supabaseAdmin
      .from('store_invitations')
      .insert({
        store_id: storeId,
        name,
        email,
        role,
        hourly_wage: hourlyWage,
        invited_by: req.user!.id,
      });

    if (invErr) {
      if (invErr.code === '23505') {
        res.status(409).json({ error: '既に招待済みです' });
      } else {
        res.status(500).json({ error: invErr.message });
      }
      return;
    }

    // Supabase Admin で招待メール送信（名前をメタデータに含める）
    const { error: mailErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${req.headers.origin || 'https://itamin-core.vercel.app'}`,
      data: { full_name: name },
    });

    if (mailErr) {
      console.error('[Invite mail error]', mailErr);
      // 招待レコードは作成済みなので、メール送信失敗でもOK
    }

    res.status(201).json({ invited: true, message: '招待メールを送信しました' });
  }
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
