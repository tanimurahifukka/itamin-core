import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { storesRouter } from './auth/stores';
import { timecardRouter } from './timecard/routes';
import { pluginRegistry } from './plugins/registry';
import { pluginSettingsRouter } from './plugins/settings';
import { shiftPlugin } from './plugins/shift';
import { checkPlugin } from './plugins/check';

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.VERCEL === '1' ? true : config.frontendUrl,
  credentials: true,
}));
app.use(express.json());

// Core routes（認証はSupabase Auth JWT）
app.use('/api/stores', storesRouter);
app.use('/api/timecard', timecardRouter);

// Plugin system
pluginRegistry.register(shiftPlugin);
pluginRegistry.register(checkPlugin);

app.use('/api/plugin-settings', pluginSettingsRouter);
app.get('/api/plugins', (_req, res) => {
  const plugins = pluginRegistry.list().map(p => ({
    name: p.name,
    version: p.version,
    description: p.description,
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
