/**
 * SwitchBot 定期温湿度収集
 *
 * Vercel Cron から `/api/cron/switchbot-readings` が呼ばれるたびに実行。
 * SwitchBot プラグインが有効な全店舗のデバイスステータスを取得し、
 * switchbot_readings テーブルに記録する。
 */

import * as crypto from 'crypto';
import { supabaseAdmin } from '../../config/supabase';

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

interface StoreCredentials {
  storeId: string;
  token: string;
  secret: string;
  monitoredDevices?: string[];
}

/** SwitchBot プラグインが有効な全店舗の認証情報を取得 */
async function getAllEnabledStores(): Promise<StoreCredentials[]> {
  const { data, error } = await supabaseAdmin
    .from('store_plugins')
    .select('store_id, config')
    .eq('plugin_name', 'switchbot')
    .eq('enabled', true);

  if (error || !data) return [];

  return data
    .filter((row: any) => row.config?.token && row.config?.secret)
    .map((row: any) => ({
      storeId: row.store_id,
      token: row.config.token,
      secret: row.config.secret,
      monitoredDevices: Array.isArray(row.config?.monitoredDevices) ? row.config.monitoredDevices : undefined,
    }));
}

/** 指定店舗のデバイス一覧を取得（温度計・温湿度計のみ） */
async function fetchDevices(creds: StoreCredentials): Promise<Array<{ deviceId: string; deviceName: string; deviceType: string }>> {
  try {
    const r = await fetch(`${SWITCHBOT_BASE}/devices`, {
      headers: makeSwitchBotHeaders(creds.token, creds.secret),
    });
    const json: any = await r.json();
    if (!r.ok || json.statusCode !== 100) return [];

    const allDevices = [
      ...(json.body?.deviceList || []),
      ...(json.body?.infraredRemoteList || []),
    ];
    const meters = allDevices.filter((d: any) =>
      /meter|temperature|hub.*mini/i.test(d.deviceType || '')
    );
    return (meters.length > 0 ? meters : allDevices).map((d: any) => ({
      deviceId: d.deviceId,
      deviceName: d.deviceName,
      deviceType: d.deviceType,
    }));
  } catch {
    return [];
  }
}

/** 指定デバイスのステータスを取得 */
async function fetchDeviceStatus(creds: StoreCredentials, deviceId: string) {
  try {
    const r = await fetch(`${SWITCHBOT_BASE}/devices/${deviceId}/status`, {
      headers: makeSwitchBotHeaders(creds.token, creds.secret),
    });
    const json: any = await r.json();
    if (!r.ok || json.statusCode !== 100) return null;

    const body = json.body || {};
    return {
      temperature: body.temperature ?? null,
      humidity: body.humidity ?? null,
      battery: body.battery ?? null,
    };
  } catch {
    return null;
  }
}

export interface CronResult {
  stores: number;
  readings: number;
  errors: number;
}

/** メインの収集処理 */
export async function collectSwitchBotReadings(): Promise<CronResult> {
  const stores = await getAllEnabledStores();
  let totalReadings = 0;
  let totalErrors = 0;

  await Promise.all(
    stores.map(async (creds) => {
      let devices = await fetchDevices(creds);

      // monitoredDevices が設定されている場合は該当デバイスのみに絞り込む
      if (creds.monitoredDevices && creds.monitoredDevices.length > 0) {
        const monitoredSet = new Set(creds.monitoredDevices);
        devices = devices.filter(d => monitoredSet.has(d.deviceId));
      }

      const rows = (
        await Promise.all(
          devices.map(async (device) => {
            const status = await fetchDeviceStatus(creds, device.deviceId);
            if (!status) { totalErrors++; return null; }

            return {
              store_id: creds.storeId,
              device_id: device.deviceId,
              device_name: device.deviceName,
              temperature: status.temperature,
              humidity: status.humidity,
              battery: status.battery,
              recorded_at: new Date().toISOString(),
            };
          })
        )
      ).filter(Boolean);

      if (rows.length > 0) {
        const { error } = await supabaseAdmin
          .from('switchbot_readings')
          .insert(rows);

        if (error) {
          console.error(`[switchbot-cron] insert error store=${creds.storeId}:`, error.message);
          totalErrors += rows.length;
        } else {
          totalReadings += rows.length;
        }
      }
    })
  );

  return { stores: stores.length, readings: totalReadings, errors: totalErrors };
}
