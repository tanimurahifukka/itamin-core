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
import { shiftPlugin } from './plugins/shift';
import { shiftRequestPlugin } from './plugins/shift_request';
import { shiftMultiPlugin } from './plugins/shift_multi';
import { haccpPlugin } from './plugins/haccp';
import { inventoryPlugin } from './plugins/inventory';
import { overtimeAlertPlugin } from './plugins/overtime_alert';
import { consecutiveWorkPlugin } from './plugins/consecutive_work';
import { dailyReportPlugin } from './plugins/daily_report';
import { noticePlugin } from './plugins/notice';
import { paidLeavePlugin } from './plugins/paid_leave';
import { expensePlugin } from './plugins/expense';
import { feedbackPlugin } from './plugins/feedback';
import { menuPlugin } from './plugins/menu';
import { punchPlugin } from './plugins/punch';
import { attendancePlugin } from './plugins/attendance_plugin';
import { staffPlugin } from './plugins/staff';
import { kioskPlugin } from './plugins/kiosk';
import { nfcCleaningPlugin } from './plugins/nfc_cleaning';
import { switchbotPlugin } from './plugins/switchbot';
import { settingsPlugin } from './plugins/settings_plugin';
import { salesCapturePlugin } from './plugins/sales_capture';
import { customersPlugin } from './plugins/customers';
import { calendarPlugin } from './plugins/calendar';
import { switchbotRouter } from './services/switchbot/routes';
import { lineAttendancePlugin } from './plugins/line_attendance';
import { attendanceAdminPlugin } from './plugins/attendance_admin';
import { organizationsRouter } from './services/organizations/routes';
import { platformRouter } from './services/platform/routes';
import { nfcRouter } from './nfc/routes';
import { nfcPunchRouter } from './nfc/punch';
import { reservationTablePlugin } from './plugins/reservation_table';
import { reservationTimeslotPlugin } from './plugins/reservation_timeslot';
import { reservationSchoolPlugin } from './plugins/reservation_school';
import { reservationEventPlugin } from './plugins/reservation_event';
import { publicReservationRouter } from './services/reservation/table_routes';
import { timeslotPublicRouter } from './services/reservation/timeslot_routes';
import { schoolPublicRouter } from './services/reservation/school_routes';
import { eventPublicRouter } from './services/reservation/event_routes';

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.VERCEL === '1'
    ? (process.env.CORS_ORIGINS || 'https://itamin-core.vercel.app').split(',')
    : config.frontendUrl,
  credentials: true,
}));
// JSON パース時に生の body を保持する。LINE Webhook の HMAC 署名検証は
// JSON 再シリアライズだとホワイトスペースの有無で不一致になるため、必ず
// 受信した生バイト列で HMAC を計算する必要がある。
app.use(express.json({
  verify: (req, _res, buf) => {
    if (buf && buf.length) {
      (req as Express.Request).rawBody = Buffer.from(buf);
    }
  },
}));

// Core routes（認証はSupabase Auth JWT）
app.use('/api/stores', storesRouter);
app.use('/api/kiosk', kioskRouter);
app.use('/api/timecard', timecardRouter);
app.use('/api/attendance', attendanceApiRouter);
app.use('/api/auth/line', lineRouter);
app.use('/api/line-punch', linePunchRouter);
app.use('/api/line-staff', lineStaffRouter);
app.use('/api/webhooks/line', lineWebhookRouter);
app.use('/api/organizations', organizationsRouter);
app.use('/api/platform', platformRouter);
// `/api/nfc/punch/*` を `/api/nfc/*` より先に登録して優先させる
app.use('/api/nfc/punch', nfcPunchRouter);
app.use('/api/nfc', nfcRouter);
// 公開予約 API (認証なし、slug ベース)
// 特化ルーターを先に登録してから共通ルーターにフォールバック
app.use('/api/public/r/:slug/timeslot', timeslotPublicRouter);
app.use('/api/public/r/:slug/school', schoolPublicRouter);
app.use('/api/public/r/:slug/event', eventPublicRouter);
app.use('/api/public/r', publicReservationRouter);

// Core plugins（無効化不可）
pluginRegistry.register(punchPlugin);
pluginRegistry.register(attendancePlugin);
pluginRegistry.register(staffPlugin);

// Feature plugins（有効/無効切替可能）
pluginRegistry.register(shiftPlugin);
pluginRegistry.register(shiftRequestPlugin);
pluginRegistry.register(shiftMultiPlugin);
pluginRegistry.register(haccpPlugin);
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
pluginRegistry.register(nfcCleaningPlugin);
pluginRegistry.register(switchbotPlugin);
pluginRegistry.register(customersPlugin);
pluginRegistry.register(calendarPlugin);
pluginRegistry.register(reservationTablePlugin);
pluginRegistry.register(reservationTimeslotPlugin);
pluginRegistry.register(reservationSchoolPlugin);
pluginRegistry.register(reservationEventPlugin);

// 設定は常に最後
pluginRegistry.register(settingsPlugin);

app.use('/api/plugin-settings', pluginSettingsRouter);
app.use('/api/switchbot', switchbotRouter);

// Vercel Cron のハンドラは各プラグイン側 (switchbot / reservation_table) に移管した (鉄則3)。

app.get('/api/plugins', (_req, res) => {
  const plugins = pluginRegistry.list().map(p => ({
    name: p.name,
    version: p.version,
    description: p.description,
    label: p.label,
    icon: p.icon,
    category: p.category,
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
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Error]', err);
  res.status(500).json({ error: 'Internal Server Error' });
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
