import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import { pluginRegistry } from './registry';

const router = Router();

// 利用可能なプラグイン一覧（店舗の有効/無効状態付き）
router.get('/:storeId', requireAuth, async (req: Request, res: Response) => {
  const storeId = req.params.storeId;

  // 登録済みプラグイン一覧
  const allPlugins = pluginRegistry.list().map(p => ({
    name: p.name,
    version: p.version,
    description: p.description,
  }));

  // 店舗の有効プラグイン
  const { data: enabled } = await supabaseAdmin
    .from('store_plugins')
    .select('plugin_name, enabled')
    .eq('store_id', storeId);

  const enabledMap = new Map((enabled || []).map(e => [e.plugin_name, e.enabled]));

  const plugins = allPlugins.map(p => ({
    ...p,
    enabled: enabledMap.get(p.name) ?? false,
  }));

  res.json({ plugins });
});

// プラグイン有効/無効切り替え
router.post('/:storeId/:pluginName', requireAuth, async (req: Request, res: Response) => {
  const { storeId, pluginName } = req.params;
  const { enabled } = req.body;

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

export const pluginSettingsRouter = router;
