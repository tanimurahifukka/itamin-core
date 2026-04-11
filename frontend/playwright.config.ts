import { defineConfig } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';

// local supabase 資格情報は backend/.env に入っている想定 (root .env にも fallback)。
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../backend/.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// TEST_SUPABASE_* を SUPABASE_* から補完する (ローカル開発 DB = テスト DB)
process.env.TEST_SUPABASE_URL ??= process.env.SUPABASE_URL;
process.env.TEST_SUPABASE_SERVICE_KEY ??= process.env.SUPABASE_SERVICE_ROLE_KEY;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  // 並列実行すると spec 間で demo owner セッションが相互に壊れるため、
  // worker 1 本で spec を直列化する。plugins/password-store/dogfooding/ux-improvements
  // が同じ demo owner アカウントを触るのが原因。
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL: process.env.TEST_BASE_URL || 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
