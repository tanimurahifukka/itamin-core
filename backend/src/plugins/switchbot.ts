/**
 * SwitchBot 連携プラグイン定義
 *
 * SwitchBot 温度計から HACCP チェックリストに自動入力する機能。
 * settingsSchema: API トークンとシークレットキーの設定を含む。
 *
 * Vercel Cron で定期収集するエンドポイント (`/api/cron/switchbot-readings`) の登録も
 * このプラグインの initialize で行う。本体 (index.ts) を薄く保つため (鉄則3)。
 */
import type { Plugin } from '../types';
import type { Express, Request, Response } from 'express';
import { collectSwitchBotReadings } from '../services/switchbot/cron';

function requireCronAuth(req: Request, res: Response): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

export const switchbotPlugin: Plugin = {
  name: 'switchbot',
  version: '1.1.0',
  description: 'SwitchBot温度計からHACCPチェックリストに自動入力',
  label: 'SwitchBot',
  icon: '🌡️',
  core: false,
  category: 'device',
  defaultRoles: ['owner', 'manager'],
  settingsSchema: [
    { key: 'token', label: 'APIトークン', type: 'password', description: 'SwitchBotアプリ → プロフィール → 開発者向けオプション' },
    { key: 'secret', label: 'シークレットキー', type: 'password', description: 'SwitchBotアプリ v6.14以降で取得' },
  ],
  initialize: (app: Express) => {
    app.post('/api/cron/switchbot-readings', async (req, res) => {
      if (!requireCronAuth(req, res)) return;
      try {
        const result = await collectSwitchBotReadings();
        console.log('[cron] switchbot-readings:', result);
        res.json({ ok: true, ...result });
      } catch (e: unknown) {
        console.error('[cron] switchbot-readings error:', e);
        res.status(500).json({ error: 'Internal Server Error' });
      }
    });
  },
};
