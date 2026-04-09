import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { storesRouter } from './auth/stores';
import { kioskRouter } from './kiosk/routes';
import { timecardRouter } from './timecard/routes';
import { attendanceApiRouter } from './services/attendance/routes';
import { lineRouter } from './services/line/routes';
import { linePunchRouter } from './services/line/punch';
import { lineWebhookRouter } from './services/line/webhook';
import { lineStaffRouter } from './services/line/staff';
import { pluginRegistry } from './plugins/registry';
import { pluginSettingsRouter } from './plugins/settings';
import { shiftPlugin, shiftRequestPlugin } from './plugins/shift';
import { checkPlugin } from './plugins/check';
import { inventoryPlugin } from './plugins/inventory';
import { overtimeAlertPlugin } from './plugins/overtime_alert';
import { consecutiveWorkPlugin } from './plugins/consecutive_work';
import { dailyReportPlugin } from './plugins/daily_report';
import { noticePlugin } from './plugins/notice';
import { paidLeavePlugin } from './plugins/paid_leave';
import { expensePlugin } from './plugins/expense';
import { feedbackPlugin } from './plugins/feedback';
import { menuPlugin } from './plugins/menu';
import { punchPlugin, attendancePlugin, staffPlugin, kioskPlugin, haccpKioskPlugin, switchbotPlugin, settingsPlugin } from './plugins/core';
import { salesCapturePlugin } from './plugins/sales_capture';
import { switchbotRouter } from './services/switchbot/routes';
import { collectSwitchBotReadings } from './services/switchbot/cron';
import { lineAttendancePlugin, attendanceAdminPlugin } from './plugins/line_attendance';

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.VERCEL === '1'
    ? (process.env.CORS_ORIGINS || 'https://itamin-core.vercel.app').split(',')
    : config.frontendUrl,
  credentials: true,
}));
app.use(express.json());

// Core routes（認証はSupabase Auth JWT）
app.use('/api/stores', storesRouter);
app.use('/api/kiosk', kioskRouter);
app.use('/api/timecard', timecardRouter);
app.use('/api/attendance', attendanceApiRouter);
app.use('/api/auth/line', lineRouter);
app.use('/api/line-punch', linePunchRouter);
app.use('/api/line-staff', lineStaffRouter);
app.use('/api/webhooks/line', lineWebhookRouter);

// Core plugins（無効化不可）
pluginRegistry.register(punchPlugin);
pluginRegistry.register(attendancePlugin);
pluginRegistry.register(staffPlugin);

// Feature plugins（有効/無効切替可能）
pluginRegistry.register(shiftPlugin);
pluginRegistry.register(shiftRequestPlugin);
pluginRegistry.register(checkPlugin);
pluginRegistry.register(menuPlugin);
pluginRegistry.register(dailyReportPlugin);
pluginRegistry.register(inventoryPlugin);
pluginRegistry.register(overtimeAlertPlugin);
pluginRegistry.register(consecutiveWorkPlugin);
pluginRegistry.register(noticePlugin);
pluginRegistry.register(paidLeavePlugin);
pluginRegistry.register(expensePlugin);
pluginRegistry.register(feedbackPlugin);
pluginRegistry.register(salesCapturePlugin);
pluginRegistry.register(lineAttendancePlugin);
pluginRegistry.register(attendanceAdminPlugin);

pluginRegistry.register(kioskPlugin);
pluginRegistry.register(haccpKioskPlugin);
pluginRegistry.register(switchbotPlugin);

// 設定は常に最後
pluginRegistry.register(settingsPlugin);

app.use('/api/plugin-settings', pluginSettingsRouter);
app.use('/api/switchbot', switchbotRouter);

// Vercel Cron: SwitchBot 定期収集（30分ごと）
app.post('/api/cron/switchbot-readings', async (req, res) => {
  // Vercel Cron は Authorization: Bearer <CRON_SECRET> ヘッダーを付与する
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${cronSecret}`) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }
  try {
    const result = await collectSwitchBotReadings();
    console.log('[cron] switchbot-readings:', result);
    res.json({ ok: true, ...result });
  } catch (e: any) {
    console.error('[cron] switchbot-readings error:', e.message);
    res.status(500).json({ error: e.message });
  }
});
app.get('/api/plugins', (_req, res) => {
  const plugins = pluginRegistry.list().map(p => ({
    name: p.name,
    version: p.version,
    description: p.description,
    label: p.label,
    icon: p.icon,
    settingsSchema: p.settingsSchema || [],
  }));
  res.json({ plugins });
});

pluginRegistry.initializeAll(app);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'itamin-core', version: '0.1.0' });
});


// エラーハンドラ
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Error]', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

// ローカル開発時のみlistenする（Vercel Serverless では不要）
if (process.env.VERCEL !== '1') {
  app.listen(config.port, () => {
    console.log(`
  ╔══════════════════════════════════════╗
  ║         ITAMIN CORE v0.1.0          ║
  ║   痛みを取って、人を育てる。          ║
  ║   Supabase + Vercel Edition         ║
  ╚══════════════════════════════════════╝

  Server running on http://localhost:${config.port}
  Environment: ${config.nodeEnv}
  `);
  });
}

export default app;
