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

Supabaseプロジェクトを作成し、以下のSQLを順番に実行してテーブルを作成してください。

1. `supabase/migrations/` 内のマイグレーションファイル（番号順）
2. `attendance.sql` — 勤怠・LINE打刻テーブル
3. その他の機能SQL（`daily_report.sql`, `inventory.sql` 等）
4. `fix_rls.sql` — RLSポリシー修正
5. `seed.sql` — テストデータ（任意）

### LINE打刻機能のセットアップ

LINE打刻機能を使用するには、以下が必要です。

1. [LINE Developers Console](https://developers.line.biz/) でチャネル作成
   - LINE Login チャネル（必須）
   - LIFF アプリの作成（エンドポイントURL: `{APP_URL}/attendance`）
2. `.env` に以下を設定
   - `LINE_LOGIN_CHANNEL_ID`
   - `LINE_LOGIN_CHANNEL_SECRET`
   - `LINE_LOGIN_CALLBACK_URL`（推奨: `{APP_URL}/auth/line/callback?storeId={STORE_ID}`）
   - `VITE_LINE_LIFF_ID`
3. Supabase に `attendance.sql` を実行

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

## LINE打刻 手動確認手順

### 1. LINE連携フロー
1. 管理者ログイン → 「勤怠管理(LINE)」 → 「LINE連携」タブ
2. スタッフの「コード発行」ボタンをクリック → 6桁コードが表示される
3. スタッフが LINE から LIFF を開く → 未連携なら連携コード入力画面
4. 6桁コードを入力 → 連携完了 → 打刻ホームへ遷移

### 2. 打刻フロー
1. スタッフログイン → 「LINE打刻」タブ → 打刻ホーム
2. 「出勤する」→ ステータスが「勤務中」に変わる
3. 「休憩開始」→「休憩中」に変わる
4. 「休憩終了」→「勤務中」に戻る
5. 「退勤する」→「退勤済み」に変わる
6. 同じボタンの連打で二重レコードが作られないことを確認

### 3. 履歴・修正申請
1. 「履歴」タブ → 月別の勤怠一覧が表示される
2. 各レコードの「修正申請」→ 種別・時刻・理由を入力して送信
3. 管理者が「修正申請」タブで承認 / 却下

### 4. 管理画面
1. 「今日の出勤」→ 全スタッフの当日出勤状況
2. 「月次一覧」→ スタッフ別の月間集計
3. 各スタッフの「詳細」→ 日別レコード・管理者による手動修正
4. 「ポリシー」→ タイムゾーン、営業日切替時刻、丸め等の設定

### 5. 権限チェック
- `staff` / `part_time` / `full_time` は管理画面（勤怠管理(LINE)）にアクセス不可
- `owner` / `manager` のみ管理画面を操作可能

## ライセンス

[MIT](LICENSE)
