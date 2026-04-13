import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase';
import { requireAuth } from '../../middleware/auth';
import { checkOrgLimits } from '../../lib/billing';

export const platformRouter = Router();

platformRouter.use(requireAuth);

// Helper: require platform team membership
async function requirePlatformTeam(userId: string): Promise<{ role: string } | null> {
  const { data } = await supabaseAdmin
    .from('platform_team')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();
  return data ? { role: (data as { role: string }).role } : null;
}

// Middleware: verify platform team
platformRouter.use(async (req: Request, res: Response, next) => {
  const userId = req.user!.id;
  const team = await requirePlatformTeam(userId);
  if (!team) {
    res.status(403).json({ error: 'プラットフォーム管理権限がありません' });
    return;
  }
  req.platformRole = team.role;
  next();
});

// GET /api/platform/me
platformRouter.get('/me', async (req: Request, res: Response) => {
  res.json({ role: req.platformRole });
});

// GET /api/platform/organizations
platformRouter.get('/organizations', async (_req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('id, name, slug, parent_id, org_type, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    res.status(500).json({ error: 'Internal Server Error' });
    return;
  }

  res.json({ organizations: data || [] });
});

// GET /api/platform/organizations/:orgId
platformRouter.get('/organizations/:orgId', async (req: Request, res: Response) => {
  const { orgId } = req.params as { orgId: string };

  const { data: org, error } = await supabaseAdmin
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .maybeSingle();

  if (error || !org) {
    res.status(404).json({ error: '組織が見つかりません' });
    return;
  }

  const { data: sub } = await supabaseAdmin
    .from('organization_subscriptions')
    .select('status, started_at, ends_at, plans:plan_id(*)')
    .eq('org_id', orgId)
    .maybeSingle();
  const usage = await checkOrgLimits(orgId);

  res.json({ organization: org, subscription: sub || null, usage });
});

// PUT /api/platform/organizations/:orgId/subscription
platformRouter.put('/organizations/:orgId/subscription', async (req: Request, res: Response) => {
  const role = req.platformRole;
  if (role !== 'super_admin' && role !== 'admin') {
    res.status(403).json({ error: 'サブスクリプション変更には admin 権限が必要です' });
    return;
  }

  const { orgId } = req.params as { orgId: string };
  const { planId, status } = req.body as { planId?: string; status?: string };

  if (!planId) {
    res.status(400).json({ error: 'planId は必須です' });
    return;
  }

  // Upsert
  const { data: existing } = await supabaseAdmin
    .from('organization_subscriptions')
    .select('id')
    .eq('org_id', orgId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabaseAdmin
      .from('organization_subscriptions')
      .update({ plan_id: planId, status: status || 'active' })
      .eq('id', (existing as { id: string }).id);
    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }
  } else {
    const { error } = await supabaseAdmin
      .from('organization_subscriptions')
      .insert({ org_id: orgId, plan_id: planId, status: status || 'active' });
    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }
  }

  res.json({ ok: true });
});

// GET /api/platform/team
platformRouter.get('/team', async (_req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('platform_team')
    .select('id, user_id, role, joined_at, profiles:user_id(id, email, full_name)');

  if (error) {
    res.status(500).json({ error: 'Internal Server Error' });
    return;
  }

  res.json({ team: data || [] });
});

// POST /api/platform/team
platformRouter.post('/team', async (req: Request, res: Response) => {
  const role = req.platformRole;
  if (role !== 'super_admin') {
    res.status(403).json({ error: 'super_admin 権限が必要です' });
    return;
  }

  const { email, role: targetRole } = req.body as { email?: string; role?: string };

  if (!email) {
    res.status(400).json({ error: 'email は必須です' });
    return;
  }

  const assignRole = targetRole || 'viewer';
  if (!['super_admin', 'admin', 'support', 'viewer'].includes(assignRole)) {
    res.status(400).json({ error: '無効なロールです' });
    return;
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (!profile) {
    res.status(404).json({ error: '指定されたメールアドレスのユーザーが見つかりません' });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from('platform_team')
    .insert({ user_id: (profile as { id: string }).id, role: assignRole })
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: 'Internal Server Error' });
    return;
  }

  res.status(201).json({ member: data });
});

// DELETE /api/platform/team/:memberId
platformRouter.delete('/team/:memberId', async (req: Request, res: Response) => {
  const role = req.platformRole;
  if (role !== 'super_admin') {
    res.status(403).json({ error: 'super_admin 権限が必要です' });
    return;
  }

  const userId = req.user!.id;
  const { memberId } = req.params as { memberId: string };

  // 対象メンバーを取得
  const { data: target, error: targetErr } = await supabaseAdmin
    .from('platform_team')
    .select('id, user_id, role')
    .eq('id', memberId)
    .maybeSingle();

  if (targetErr || !target) {
    res.status(404).json({ error: 'メンバーが見つかりません' });
    return;
  }

  const targetRow = target as { id: string; user_id: string; role: string };

  // 自己削除禁止
  if (targetRow.user_id === userId) {
    res.status(403).json({ error: '自分自身を削除することはできません' });
    return;
  }

  // 最後の super_admin 削除防止
  if (targetRow.role === 'super_admin') {
    const { count: superCount } = await supabaseAdmin
      .from('platform_team')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'super_admin');
    if ((superCount || 0) <= 1) {
      res.status(403).json({ error: '最後の super_admin を削除することはできません' });
      return;
    }
  }

  const { error } = await supabaseAdmin
    .from('platform_team')
    .delete()
    .eq('id', memberId);

  if (error) {
    res.status(500).json({ error: 'Internal Server Error' });
    return;
  }

  res.json({ ok: true });
});

// GET /api/platform/plans
platformRouter.get('/plans', async (_req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('plans')
    .select('*')
    .order('price_monthly_jpy', { ascending: true });

  if (error) {
    res.status(500).json({ error: 'Internal Server Error' });
    return;
  }

  res.json({ plans: data || [] });
});

// POST /api/platform/plans
platformRouter.post('/plans', async (req: Request, res: Response) => {
  const role = req.platformRole;
  if (role !== 'super_admin' && role !== 'admin') {
    res.status(403).json({ error: 'プラン作成には admin 権限が必要です' });
    return;
  }

  const { name, slug, max_stores, max_staff_per_store, max_plugins, allowed_plugins, price_monthly_jpy } = req.body as {
    name?: string; slug?: string; max_stores?: number; max_staff_per_store?: number;
    max_plugins?: number; allowed_plugins?: string[]; price_monthly_jpy?: number;
  };

  if (!name || !slug) {
    res.status(400).json({ error: 'name と slug は必須です' });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from('plans')
    .insert({
      name,
      slug,
      max_stores: max_stores ?? 1,
      max_staff_per_store: max_staff_per_store ?? 10,
      max_plugins: max_plugins ?? 5,
      allowed_plugins: allowed_plugins ?? [],
      price_monthly_jpy: price_monthly_jpy ?? 0,
    })
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: 'Internal Server Error' });
    return;
  }

  res.status(201).json({ plan: data });
});

// PUT /api/platform/plans/:planId
platformRouter.put('/plans/:planId', async (req: Request, res: Response) => {
  const role = req.platformRole;
  if (role !== 'super_admin' && role !== 'admin') {
    res.status(403).json({ error: 'プラン更新には admin 権限が必要です' });
    return;
  }

  const { planId } = req.params as { planId: string };
  const body = req.body as Record<string, unknown>;

  const updates: Record<string, unknown> = {};
  for (const key of ['name', 'max_stores', 'max_staff_per_store', 'max_plugins', 'allowed_plugins', 'price_monthly_jpy', 'is_active']) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  const { data, error } = await supabaseAdmin
    .from('plans')
    .update(updates)
    .eq('id', planId)
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: 'Internal Server Error' });
    return;
  }

  res.json({ plan: data });
});
