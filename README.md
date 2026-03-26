# ITAMIN

飲食店向けプラグイン型オールインワン業務・人材育成SaaS

## 概要

ITAMINは飲食店の日常業務を効率化するためのWebアプリケーションです。チェックリスト管理、日報、在庫管理、シフト管理、経費管理など、必要な機能をプラグイン形式で追加できます。

## 技術スタック

- **Frontend**: React + TypeScript + Vite
- **Backend**: Node.js + TypeScript (Vercel Serverless Functions)
- **Database**: Supabase (PostgreSQL)
- **Hosting**: Vercel

## セットアップ

### 前提条件

- Node.js 18+
- npm
- [Supabase](https://supabase.com/) アカウント
- [Vercel](https://vercel.com/) アカウント（デプロイ時）

### インストール

```bash
git clone https://github.com/tanimurahifukka/itamin-core.git
cd itamin-core
npm install
```

### 環境変数の設定

```bash
cp .env.example .env
```

`.env` を編集し、Supabaseプロジェクトの情報を設定してください。

### データベースのセットアップ

Supabaseプロジェクトを作成し、`seed.sql` および各機能の `.sql` ファイルを実行してテーブルを作成してください。

### 開発サーバーの起動

```bash
npm run dev
```

フロントエンド（Vite）とバックエンドが同時に起動します。

## プロジェクト構成

```
itamin-core/
├── frontend/       # React + Vite フロントエンド
├── backend/        # Express API バックエンド
├── api/            # Vercel Serverless Functions エントリポイント
├── supabase/       # Supabase設定
├── *.sql           # データベーススキーマ
└── vercel.json     # Vercel設定
```

## ライセンス

[MIT](LICENSE)
