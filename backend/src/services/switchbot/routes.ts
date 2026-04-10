import { Router, Request, Response } from 'express';
import * as crypto from 'crypto';
import { requireAuth } from '../../middleware/auth';
import { requireManagedStore } from '../../auth/authorization';
import { supabaseAdmin } from '../../config/supabase';

const router = Router();
const SWITCHBOT_BASE = 'https://api.switch-bot.com/v1.1';

function makeSwitchBotHeaders(token: string, secret: string) {
  const t = Date.now();
  const nonce = crypto.randomUUID();
  const sign = crypto
    .createHmac('sha256', secret)
    .update(token + t + nonce)
    .digest('base64');
  return {
    Authorization: token,
    t: String(t),
    nonce,
    sign,
    'Content-Type': 'application/json',
  };
}

async function getCredentials(storeId: string): Promise<{ token: string; secret: string } | null> {
  const { data } = await supabaseAdmin
    .from('store_plugins')
    .select('config')
    .eq('store_id', storeId)
    .eq('plugin_name', 'switchbot')
    .maybeSingle();

  const token = data?.config?.token;
  const secret = data?.config?.secret;
  if (!token || !secret) return null;
  return { token, secret };
}

// GET /:storeId/devices - デバイス一覧
router.get('/:storeId/devices', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const creds = await getCredentials(storeId);
    if (!creds) {
      res.status(400).json({ error: 'SwitchBot APIトークンが設定されていません' });
      return;
    }

    const r = await fetch(`${SWITCHBOT_BASE}/devices`, {
      headers: makeSwitchBotHeaders(creds.token, creds.secret),
    });
    const json: any = await r.json();
    if (!r.ok || json.statusCode !== 100) {
      res.status(502).json({ error: `SwitchBot API error: ${json.message || r.status}` });
      return;
    }

    // 温度計・温湿度計のみフィルタ
    const allDevices = [
      ...(json.body?.deviceList || []),
      ...(json.body?.infraredRemoteList || []),
    ];
    const meters = allDevices.filter((d: any) =>
      /meter|temperature|hub.*mini/i.test(d.deviceType || '')
    );

    res.json({ devices: meters.length > 0 ? meters : allDevices });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// GET /:storeId/devices/monitored - 監視対象デバイス一覧取得
router.get('/:storeId/devices/monitored', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const { data } = await supabaseAdmin
      .from('store_plugins')
      .select('config')
      .eq('store_id', storeId)
      .eq('plugin_name', 'switchbot')
      .maybeSingle();

    const monitoredDevices: string[] = Array.isArray(data?.config?.monitoredDevices)
      ? data.config.monitoredDevices
      : [];

    res.json({ monitoredDevices });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// PUT /:storeId/devices/monitored - 監視対象デバイス更新
router.put('/:storeId/devices/monitored', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const { deviceIds } = req.body as { deviceIds: string[] };
    if (!Array.isArray(deviceIds)) {
      res.status(400).json({ error: 'deviceIds must be an array' });
      return;
    }

    // 既存の config を取得してマージ
    const { data } = await supabaseAdmin
      .from('store_plugins')
      .select('config')
      .eq('store_id', storeId)
      .eq('plugin_name', 'switchbot')
      .maybeSingle();

    const existingConfig: Record<string, unknown> = data?.config ?? {};
    const updatedConfig = { ...existingConfig, monitoredDevices: deviceIds };

    const { error } = await supabaseAdmin
      .from('store_plugins')
      .update({ config: updatedConfig })
      .eq('store_id', storeId)
      .eq('plugin_name', 'switchbot');

    if (error) throw error;

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// GET /:storeId/devices/:deviceId/status - デバイスステータス（温度・湿度）
router.get('/:storeId/devices/:deviceId/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const deviceId = req.params.deviceId as string;
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const creds = await getCredentials(storeId);
    if (!creds) {
      res.status(400).json({ error: 'SwitchBot APIトークンが設定されていません' });
      return;
    }

    const r = await fetch(`${SWITCHBOT_BASE}/devices/${deviceId}/status`, {
      headers: makeSwitchBotHeaders(creds.token, creds.secret),
    });
    const json: any = await r.json();
    if (!r.ok || json.statusCode !== 100) {
      res.status(502).json({ error: `SwitchBot API error: ${json.message || r.status}` });
      return;
    }

    const body = json.body || {};
    res.json({
      deviceId,
      temperature: body.temperature ?? null,
      humidity: body.humidity ?? null,
      battery: body.battery ?? null,
      deviceType: body.deviceType ?? null,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// GET /:storeId/readings - 温湿度ログ一覧（最新N件）
router.get('/:storeId/readings', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    const deviceId = req.query.deviceId as string | undefined;

    let query = supabaseAdmin
      .from('switchbot_readings')
      .select('id, device_id, device_name, temperature, humidity, battery, recorded_at')
      .eq('store_id', storeId)
      .order('recorded_at', { ascending: false })
      .limit(limit);

    if (deviceId) query = query.eq('device_id', deviceId);

    const { data, error } = await query;
    if (error) throw error;

    res.json({ readings: data || [] });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

export const switchbotRouter = router;
