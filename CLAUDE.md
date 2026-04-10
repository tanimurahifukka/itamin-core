> この CLAUDE.md は `~/.claude/CLAUDE.md`（グローバル規約）を前提とする。

---

# ITAMIN itamin-core 開発規約

飲食店向けプラグイン型オールインワン業務・人材育成SaaS「ITAMIN」の開発規約。

バージョン: v0.1.0

---

## 1. プロジェクト概要

飲食店の業務管理・人材育成を一元化するSaaS。プラグイン機構によって機能を柔軟に追加・無効化できる設計。

---

## 2. 技術スタック

| 領域 | 技術 |
|---|---|
| Frontend | React 19 + TypeScript + Vite + React Router 7 |
| Backend | Express + TypeScript (Vercel Serverless Functions) |
| Database | Supabase (PostgreSQL) |
| Hosting | Vercel |
| E2E テスト | Playwright |

---

## 3. ディレクトリ構成

```
itamin-core/
├── backend/src/         # Express バックエンド
│   ├── auth/            # 認証・認可
│   ├── config/          # 設定
│   ├── kiosk/           # キオスク端末API
│   ├── middleware/       # Express ミドルウェア
│   ├── plugins/         # プラグイン定義 (1ファイル=1プラグイン)
│   ├── services/        # 外部サービス連携 (attendance, line, switchbot)
│   ├── timecard/        # タイムカードAPI
│   └── types/           # 型定義
├── frontend/src/        # React フロントエンド
│   ├── api/             # APIクライアント
│   ├── components/      # 共通コンポーネント
│   ├── contexts/        # React Context
│   ├── hooks/           # カスタムフック
│   ├── pages/           # ページコンポーネント
│   └── types/           # 型定義
├── e2e/                 # Playwright E2Eテスト
└── supabase/            # Supabase設定・マイグレーション
```

---

## 4. プラグイン3鉄則の具体化（ITAMIN 憲法）

グローバル規約「プラグイン機構を持つプロダクトの3鉄則」をこのプロジェクトに具体化する。

### 鉄則1: 1 Plugin = 1 Function

- `backend/src/plugins/` 配下の1ファイルが1プラグインに対応する
- 1つのプラグインは1つの業務機能のみを担う（例: `shift.ts` はシフト管理のみ、`expense.ts` は経費管理のみ）
- 複数の業務機能を1ファイルにまとめることを禁止する

### 鉄則2: 1 Plugin = 1 Settings Panel

- プラグイン固有の設定は `settingsSchema` フィールドに定義する（`backend/src/types/index.ts` の `PluginSettingField[]`）
- ある プラグインの `settingsSchema` が他のプラグインの設定項目を操作・参照することを禁止する
- フロントエンドの設定画面は `settingsSchema` を読み取って自動的にレンダリングする設計を維持する

### 鉄則3: 本体は薄く保つ

- `backend/src/index.ts` はプラグインの登録と初期化のみを行う
- 業務ロジックを `index.ts` に直接書くことを禁止する
- `PluginRegistry`（`backend/src/plugins/registry.ts`）はロードとルーティングのみを担い、業務ロジックを持たない

### core プラグインの扱い

- `core: true` が設定されたプラグインは無効化不可とする（打刻・設定など基幹機能）
- 現在 `core: true` のプラグイン: `punch`、`attendance`、`staff`、`settings`
- 新規プラグインを追加する際に安易に `core: true` をつけることを禁止する。コア機能かどうかは Opus が判断する

---

## 5. 型定義と API 境界の規約

グローバル規約「API 境界型の明示的 Codable 義務化」を TypeScript に読み替えて適用する。

### 境界を越える型の明示的定義義務

以下の境界を越える型は、必ず明示的に型定義を書くこと。TypeScript の型推論に任せてはならない。

- Frontend ↔ Backend の HTTP 境界
- Backend ↔ Supabase の永続化境界
- プラグイン ↔ 本体の境界（`Plugin` インターフェースを実装する型）

### 具体的なルール

- **HTTP レスポンス型**: `frontend/src/types/` に明示的な interface または type alias を定義する
- **HTTP リクエスト型**: Backend 側で `Request` の `body` / `params` / `query` に型をつける（`as unknown as MyType` キャストを禁止する）
- **プラグイン設定値**: `settingsSchema` の `key` と実際のアクセスキーを一致させ、型ガードを書く
- **Supabase から取得したデータ**: `any` で受け取ることを禁止する。`Database` 型（`supabase/` 配下で生成）を使う

### JSON フォーマットの安定性

- API レスポンスのフィールド名を変更する際は、フロントエンドの型定義と同時に変更する
- フィールド名変更は破壊的変更として扱い、Opus の承認を得てからコミットする

---

## 6. 開発コマンド

```bash
# Frontend
cd frontend
npm run dev          # Vite 開発サーバー起動
npm run build        # TypeScript + Vite ビルド
npm run test:e2e     # Playwright E2Eテスト実行

# Backend
# Vercel にデプロイして動作確認する（ローカル開発サーバーは Vercel CLI を使用）
vercel dev           # Vercel 開発サーバー（プロジェクトルートで実行）

# Supabase
supabase db push     # マイグレーション適用
```

---

## 7. 新規プラグイン追加手順

新規プラグインを追加する場合は、以下の手順を必ず守ること。

1. `backend/src/plugins/<plugin_name>.ts` を作成し、`Plugin` インターフェースを実装する
2. `backend/src/index.ts` でプラグインを `pluginRegistry.register()` に登録する
3. フロントエンドに対応するページコンポーネントを `frontend/src/pages/` に追加する
4. 以下のテストを同時に実装する（テスト無しのコミットを禁止する）:
   - 単体テスト: プラグインの各エンドポイントに対するテスト
   - E2E テスト: `e2e/` 配下に Playwright テストを追加する
5. 設定画面が必要な場合は `settingsSchema` を定義し、画面の E2E テストも追加する

---

## 8. Vercel デプロイ規約

- コードを変更したら必ずコミット後にデプロイする（ローカルのみで放置することを禁止する）
- デプロイコマンド: `vercel --prod`（プロジェクトルートで実行）
- デプロイ前に `npm run build`（frontend）が成功することを確認する

---

## 9. 言語規約

- コード・コミットメッセージ・変数名・関数名・コメント内のコード: **英語**
- ドキュメント・説明文・コメントの説明部分・ユーザー向け文言: **日本語**
