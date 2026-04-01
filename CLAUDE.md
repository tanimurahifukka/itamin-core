# CLAUDE.md - itamin-core

## Project Overview

飲食店向けプラグイン型オールインワン業務・人材育成SaaS「ITAMIN」のコアリポジトリ。

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite 6 + React Router v7
- **Backend**: Express.js + TypeScript (Vercel Serverless)
- **Database**: PostgreSQL via Supabase (Auth, RLS, Realtime)
- **Testing**: Playwright (E2E)
- **Deploy**: Vercel (region: hnd1)

## Project Structure

```
frontend/src/pages/       # ページコンポーネント (Login, Staff, DailyReport, Inventory, etc.)
frontend/src/components/  # 再利用可能UIコンポーネント
frontend/src/contexts/    # AuthContext
frontend/src/hooks/       # カスタムフック (usePluginHooks)
frontend/src/api/         # APIクライアント
frontend/e2e/             # Playwright E2Eテスト
backend/src/plugins/      # プラグインモジュール (shift, expense, inventory, check, etc.)
backend/src/auth/         # 認証・店舗管理
backend/src/middleware/   # 認証ミドルウェア
backend/src/config/       # Supabase設定
backend/api/index.ts      # Vercel serverlessエントリ
supabase/                 # Supabase設定・マイグレーション
*.sql                     # DBスキーマファイル
```

## Key Commands

```bash
npm run dev            # frontend + backend 同時起動
npm run build          # 両方ビルド
```

## Backend Plugins

core, check, shift, expense, inventory, notice, paid_leave, overtime_alert, consecutive_work, feedback, settings - すべて `backend/src/plugins/` に配置。

## Database

Supabase PostgreSQL。RLS有効。スキーマはルートの`.sql`ファイルと`supabase/migrations/`で管理。

## Rules for Claude

- 日本語で応答すること
- 応答は簡潔に。説明は最小限にし、コードで示す
- ファイル探索を最小限に。このCLAUDE.mdの情報を活用する
- 不要なコメント・docstring・型注釈を追加しない
- 変更していないコードを修正しない
- package-lock.json, node_modules, .env は読まない
- SQLファイルを変更する場合は既存のRLSパターンに従う
