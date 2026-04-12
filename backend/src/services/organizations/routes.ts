import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase';
import { requireAuth } from '../../middleware/auth';
import { checkOrgLimits } from '../../lib/billing';
import { requireOrgManager } from '../../auth/authorization';

// GET /api/organizations — 自分の所属組織一覧
organizationsRouter.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { data, error } = await supabaseAdmin
    .from('organization_members')
    .select('role, organizations:org_id(id, name, slug, parent_id, org_type, created_at)')
    .eq('user_id', userId);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const organizations = (data || []).map((row: any) => ({
    ...row.organizations,
    myRole: row.role,
  }));

  res.json({ organizations });
});

// POST /api/organizations — 組織作成
const MAX_ORGS_PER_USER = 5;

organizationsRouter.post('/', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { name, slug, parentId, orgType } = req.body as {
    name?: string; slug?: string; parentId?: string; orgType?: string;
  };

  if (!name || !slug) {
    res.status(400).json({ error: 'name と slug は必須です' });
    return;
  }

  // slug validation: alphanumeric + hyphen
  if (!/^[a-z0-9-]+$/.test(slug)) {
    res.status(400).json({ error: 'slug は英小文字・数字・ハイフンのみ使用できます' });
    return;
  }

  // Rate limit: 1ユーザーが owner になれる組織の上限チェック（スパム防止）
  const { count: ownedCount, error: countErr } = await supabaseAdmin
    .from('organization_members')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('role', 'owner');

  if (countErr) {
    res.status(500).json({ error: countErr.message });
    return;
  }

  if ((ownedCount || 0) >= MAX_ORGS_PER_USER) {
    res.status(403).json({ error: `1ユーザーが所有できる組織は最大 ${MAX_ORGS_PER_USER} 件です` });
    return;
  }

  // 組織作成（失敗したらロールバック）
  const { data: org, error: orgErr } = await supabaseAdmin
    .from('organizations')
    .insert({
      name,
      slug,
      parent_id: parentId || null,
      org_type: orgType || 'independent',
    })
    .select()
    .single();

  if (orgErr || !org) {
    res.status(500).json({ error: orgErr?.message || '組織作成に失敗しました' });
    return;
  }

  const orgId = (org as { id: string }).id;

  // Creator becomes owner
  const { error: memberErr } = await supabaseAdmin
    .from('organization_members')
    .insert({
      org_id: orgId,
      user_id: userId,
      role: 'owner',
    });

  if (memberErr) {
    // 孤立 org をロールバック
    await supabaseAdmin.from('organizations').delete().eq('id', orgId);
    res.status(500).json({ error: memberErr.message });
    return;
  }

  // Assign Free plan by default
  const { data: freePlan } = await supabaseAdmin
    .from('plans')
    .select('id')
    .eq('slug', 'free')
    .maybeSingle();

  if (freePlan) {
    const { error: subErr } = await supabaseAdmin
      .from('organization_subscriptions')
      .insert({
        org_id: orgId,
        plan_id: (freePlan as { id: string }).id,
        status: 'active',
      });
    if (subErr) {
      console.error('[org] free plan assignment failed', subErr.message);
      // サブスク作成失敗は致命的ではないので続行（getOrgPlanLimits が fallback する）
    }
  }

  res.status(201).json({ organization: org });
});

// GET /api/organizations/:orgId — 組織詳細
organizationsRouter.get('/:orgId', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { orgId } = req.params as { orgId: string };

  // Check membership
  const { data: membership } = await supabaseAdmin
    .from('organization_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!membership) {
    res.status(403).json({ error: 'この組織へのアクセス権限がありません' });
    return;
  }

  const { data: org, error } = await supabaseAdmin
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .maybeSingle();

  if (error || !org) {
    res.status(404).json({ error: '組織が見つかりません' });
    return;
  }

  // Subscription
  const { data: sub } = await supabaseAdmin
    .from('organization_subscriptions')
    .select('status, started_at, ends_at, plans:plan_id(id, name, slug, max_stores, max_staff_per_store, max_plugins, price_monthly_jpy)')
    .eq('org_id', orgId)
    .maybeSingle();

  res.json({
    organization: org,
    myRole: (membership as any).role,
    subscription: sub || null,
  });
});

// PUT /api/organizations/:orgId — 組織更新
organizationsRouter.put('/:orgId', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { orgId } = req.params as { orgId: string };

  const manager = await requireOrgManager(req, res, orgId);
  if (!manager) return;

  const { name, settings } = req.body as { name?: string; settings?: Record<string, unknown> };

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (settings !== undefined) updates.settings = settings;

  const { data, error } = await supabaseAdmin
    .from('organizations')
    .update(updates)
    .eq('id', orgId)
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ organization: data });
});

// GET /api/organizations/:orgId/members
organizationsRouter.get('/:orgId/members', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { orgId } = req.params as { orgId: string };

  const { data: myMembership } = await supabaseAdmin
    .from('organization_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!myMembership) {
    res.status(403).json({ error: 'この組織へのアクセス権限がありません' });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from('organization_members')
    .select('id, user_id, role, joined_at, profiles:user_id(id, email, full_name)')
    .eq('org_id', orgId);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ members: data || [] });
});

// POST /api/organizations/:orgId/members — メンバー追加（email 指定）
organizationsRouter.post('/:orgId/members', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { orgId } = req.params as { orgId: string };
  const { email, role } = req.body as { email?: string; role?: string };

  const manager = await requireOrgManager(req, res, orgId);
  if (!manager) return;

  if (!email) {
    res.status(400).json({ error: 'email は必須です' });
    return;
  }

  const targetRole = role || 'viewer';
  if (!['owner', 'admin', 'viewer'].includes(targetRole)) {
    res.status(400).json({ error: '無効なロールです' });
    return;
  }

  // Find user by email
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
    .from('organization_members')
    .insert({
      org_id: orgId,
      user_id: (profile as any).id,
      role: targetRole,
    })
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(201).json({ member: data });
});

// DELETE /api/organizations/:orgId/members/:memberId
organizationsRouter.delete('/:orgId/members/:memberId', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { orgId, memberId } = req.params as { orgId: string; memberId: string };

  const manager = await requireOrgManager(req, res, orgId);
  if (!manager) return;
  if (manager.role !== 'owner') {
    res.status(403).json({ error: 'オーナー権限が必要です' });
    return;
  }

  const { error } = await supabaseAdmin
    .from('organization_members')
    .delete()
    .eq('id', memberId)
    .eq('org_id', orgId);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ ok: true });
});

// PUT /api/organizations/:orgId/members/:memberId/role
organizationsRouter.put('/:orgId/members/:memberId/role', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { orgId, memberId } = req.params as { orgId: string; memberId: string };
  const { role } = req.body as { role?: string };

  const manager = await requireOrgManager(req, res, orgId);
  if (!manager) return;
  if (manager.role !== 'owner') {
    res.status(403).json({ error: 'オーナー権限が必要です' });
    return;
  }

  if (!role || !['owner', 'admin', 'viewer'].includes(role)) {
    res.status(400).json({ error: '無効なロールです' });
    return;
  }

  const { error } = await supabaseAdmin
    .from('organization_members')
    .update({ role })
    .eq('id', memberId)
    .eq('org_id', orgId);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ ok: true });
});

// GET /api/organizations/:orgId/stores — 傘下店舗一覧
organizationsRouter.get('/:orgId/stores', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { orgId } = req.params as { orgId: string };

  const { data: myMembership } = await supabaseAdmin
    .from('organization_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!myMembership) {
    res.status(403).json({ error: 'この組織へのアクセス権限がありません' });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from('stores')
    .select('id, name, address, phone, created_at')
    .eq('org_id', orgId);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ stores: data || [] });
});

// POST /api/organizations/:orgId/stores/:storeId/assign — 店舗を組織に紐付け
organizationsRouter.post('/:orgId/stores/:storeId/assign', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { orgId, storeId } = req.params as { orgId: string; storeId: string };

  const manager = await requireOrgManager(req, res, orgId);
  if (!manager) return;

  // User must also be owner of the store being assigned
  const { data: staff } = await supabaseAdmin
    .from('store_staff')
    .select('role')
    .eq('store_id', storeId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!staff || (staff as { role: string }).role !== 'owner') {
    res.status(403).json({ error: '店舗のオーナー権限が必要です' });
    return;
  }

  // 店舗がすでに別の組織に所属していないか確認
  const { data: store, error: storeErr } = await supabaseAdmin
    .from('stores')
    .select('org_id')
    .eq('id', storeId)
    .maybeSingle();

  if (storeErr || !store) {
    res.status(404).json({ error: '店舗が見つかりません' });
    return;
  }

  const currentOrgId = (store as { org_id: string | null }).org_id;
  if (currentOrgId && currentOrgId !== orgId) {
    res.status(409).json({ error: 'この店舗はすでに別の組織に所属しています。先に既存の組織から解除してください。' });
    return;
  }

  // 課金チェック: 組織の max_stores を超えないか
  const limits = await checkOrgLimits(orgId);
  if (!limits.canAddStore) {
    res.status(403).json({
      error: `この組織は現在のプラン (${limits.planName}) の店舗数上限に達しています (${limits.usage.stores}/${limits.limits.max_stores})`,
    });
    return;
  }

  const { error } = await supabaseAdmin
    .from('stores')
    .update({ org_id: orgId })
    .eq('id', storeId);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ ok: true });
});

// GET /api/organizations/:orgId/usage — 使用状況（課金チェック）
organizationsRouter.get('/:orgId/usage', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { orgId } = req.params as { orgId: string };

  const { data: myMembership } = await supabaseAdmin
    .from('organization_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!myMembership) {
    res.status(403).json({ error: 'この組織へのアクセス権限がありません' });
    return;
  }
  const check = await checkOrgLimits(orgId);

  res.json({
    usage: check.usage,
    limits: check.limits,
    planName: check.planName,
  });
});
