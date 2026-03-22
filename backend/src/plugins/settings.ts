import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import { pluginRegistry } from './registry';
import { requireManagedStore, requireStoreMembership, VALID_STAFF_ROLES } from '../auth/authorization';
import type { StaffRole } from '../types';

const router = Router();

function normalizeAllowedRoles(pluginName: string, roles: string[]): StaffRole[] {
  const uniqueRoles = Array.from(new Set(roles)) as StaffRole[];
  if (pluginName === 'punch') {
    return uniqueRoles.filter(role => role !== 'owner');
  }
  return uniqueRoles;
}

// ============================================================
// プラグイン一覧（有効/無効 + config + 権限情報付き）
// ============================================================
router.get('/:storeId', requireAuth, async (req: Request, res: Response) => {
  const storeId = String(req.params.storeId);
  const membership = await requireStoreMembership(req, res, storeId);
  if (!membership) {
    return;
  }

  const allPlugins = pluginRegistry.list().map(p => ({
    name: p.name,
    version: p.version,
    description: p.description,
    label: p.label,
    icon: p.icon,
    core: p.core || false,
    defaultRoles: p.defaultRoles,
    settingsSchema: p.settingsSchema || [],
  }));

  // 店舗の有効プラグイン + config
  const { data: stored } = await supabaseAdmin
    .from('store_plugins')
    .select('plugin_name, enabled, config')
    .eq('store_id', storeId);

  const storedMap = new Map(
    (stored || []).map(e => [e.plugin_name, { enabled: e.enabled, config: e.config || {} }])
  );

  // 権限設定を取得
  const { data: perms } = await supabaseAdmin
    .from('plugin_permissions')
    .select('plugin_name, role')
    .eq('store_id', storeId);

  // plugin_name => role[]
  const permMap = new Map<string, string[]>();
  for (const p of (perms || [])) {
    const list = permMap.get(p.plugin_name) || [];
    list.push(p.role);
    permMap.set(p.plugin_name, list);
  }

  const plugins = allPlugins.map(p => {
    const s = storedMap.get(p.name);
    const defaults: Record<string, any> = {};
    for (const field of p.settingsSchema) {
      if (field.default !== undefined) defaults[field.key] = field.default;
    }
    // 権限: DB に保存済みがあればそれ、なければ defaultRoles
    const allowedRoles = normalizeAllowedRoles(p.name, permMap.get(p.name) || p.defaultRoles);
    return {
      ...p,
      enabled: p.core ? true : (s?.enabled ?? false),
      config: { ...defaults, ...(s?.config || {}) },
      allowedRoles,
    };
  });

  res.json({ plugins });
});

// ============================================================
// プラグイン有効/無効切り替え
// ============================================================
router.post('/:storeId/:pluginName', requireAuth, async (req: Request, res: Response) => {
  const storeId = String(req.params.storeId);
  const pluginName = String(req.params.pluginName);
  const { enabled } = req.body;
  const membership = await requireManagedStore(req, res, storeId);
  if (!membership) {
    return;
  }

  // core プラグインは無効化不可
  const plugin = pluginRegistry.list().find(p => p.name === pluginName);
  if (!plugin) {
    res.status(404).json({ error: 'プラグインが見つかりません' });
    return;
  }
  if (plugin?.core) {
    res.status(400).json({ error: 'コア機能は無効化できません' });
    return;
  }

  const { error } = await supabaseAdmin
    .from('store_plugins')
    .upsert({
      store_id: storeId,
      plugin_name: pluginName,
      enabled: enabled ?? true,
    }, { onConflict: 'store_id,plugin_name' });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ ok: true, pluginName, enabled });
});

// ============================================================
// プラグイン設定（config）の更新
// ============================================================
router.put('/:storeId/:pluginName/config', requireAuth, async (req: Request, res: Response) => {
  const storeId = String(req.params.storeId);
  const pluginName = String(req.params.pluginName);
  const { config } = req.body;
  const membership = await requireManagedStore(req, res, storeId);
  if (!membership) {
    return;
  }

  if (!config || typeof config !== 'object') {
    res.status(400).json({ error: 'config オブジェクトが必要です' });
    return;
  }

  const plugin = pluginRegistry.list().find(p => p.name === pluginName);
  if (!plugin) {
    res.status(404).json({ error: 'プラグインが見つかりません' });
    return;
  }

  const { error } = await supabaseAdmin
    .from('store_plugins')
    .upsert({
      store_id: storeId,
      plugin_name: pluginName,
      config,
    }, { onConflict: 'store_id,plugin_name' });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ ok: true, pluginName, config });
});

// ============================================================
// プラグイン権限の更新（ロール別アクセス設定）
// ============================================================
router.put('/:storeId/:pluginName/permissions', requireAuth, async (req: Request, res: Response) => {
  const storeId = String(req.params.storeId);
  const pluginName = String(req.params.pluginName);
  const { roles } = req.body; // string[]
  const membership = await requireManagedStore(req, res, storeId);
  if (!membership) {
    return;
  }

  if (!Array.isArray(roles)) {
    res.status(400).json({ error: 'roles は配列で指定してください' });
    return;
  }

  if (roles.some((role: string) => !VALID_STAFF_ROLES.includes(role as typeof VALID_STAFF_ROLES[number]))) {
    res.status(400).json({ error: '不正な role が含まれています' });
    return;
  }

  const plugin = pluginRegistry.list().find(p => p.name === pluginName);
  if (!plugin) {
    res.status(404).json({ error: 'プラグインが見つかりません' });
    return;
  }

  const normalizedRoles = normalizeAllowedRoles(pluginName, roles);

  // 既存の権限を全削除
  await supabaseAdmin
    .from('plugin_permissions')
    .delete()
    .eq('store_id', storeId)
    .eq('plugin_name', pluginName);

  // 新しい権限を挿入
  if (normalizedRoles.length > 0) {
    const rows = normalizedRoles.map((role: StaffRole) => ({
      store_id: storeId,
      plugin_name: pluginName,
      role,
    }));

    const { error } = await supabaseAdmin
      .from('plugin_permissions')
      .insert(rows);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
  }

  res.json({ ok: true, pluginName, roles: normalizedRoles });
});

export const pluginSettingsRouter = router;
