# ITAMIN Core 仕様書 v0.1.0

> 飲食店向けプラグイン型オールインワン業務・人材育成SaaS
>
> 作成日: 2026-04-02
> スタック: Vercel (Express + React SPA) + Supabase (PostgreSQL + Auth)

---

## 1. システム概要

### コンセプト
小規模飲食店（カフェ・レストラン）のオーナーが、スタッフの勤怠管理・シフト管理・HACCP衛生チェック・日報・在庫・経費・お知らせなどを1つのアプリで完結できるSaaS。機能はプラグイン方式で店舗ごとにON/OFF切替可能。

### アーキテクチャ
```
[React SPA (Vite)] → [Express API (Vercel Serverless)] → [Supabase PostgreSQL]
                                                           ├── Auth (JWT)
                                                           ├── RLS (Row Level Security)
                                                           └── Storage (画像)
```

### ロール体系
| ロール | 権限 |
|--------|------|
| `owner` | 全権限。打刻不可（管理者なので）。給与・経費・プラグイン設定閲覧可 |
| `manager` | 勤怠修正、日報作成、シフト管理、お知らせ管理 |
| `leader` | マネージャーに近いが一部制限あり |
| `full_time` | 打刻、チェックリスト、自分のシフト確認 |
| `part_time` | 打刻、チェックリスト、自分のシフト確認 |

---

## 2. プラグイン一覧

### コアプラグイン（無効化不可）

| プラグイン | 説明 | 対象ロール |
|-----------|------|-----------|
| `punch` | 出退勤打刻 | manager, leader, full_time, part_time |
| `attendance` | 勤怠ダッシュボード（日別/月別） | owner, manager |
| `staff` | スタッフ管理・招待 | owner, manager |
| `settings` | プラグイン設定・権限管理 | owner |

### 機能プラグイン（ON/OFF切替可能）

| プラグイン | 説明 | デフォルト対象ロール |
|-----------|------|-------------------|
| `shift` | シフト管理（週次カレンダー、テンプレート） | owner, manager, leader |
| `shift_request` | シフト希望提出 | full_time, part_time |
| `check` | HACCP衛生チェックリスト | 全ロール |
| `menu` | 商品マスタ管理 | owner, manager |
| `daily_report` | 日報（売上・客数・天気） | owner, manager, leader |
| `inventory` | 在庫管理 | owner, manager, leader |
| `overtime_alert` | 残業アラート | owner, manager |
| `consecutive_work` | 連勤アラート | owner, manager |
| `notice` | お知らせ掲示板 | 全ロール |
| `paid_leave` | 有給管理 | owner, manager |
| `expense` | 経費管理 | owner, manager |
| `feedback` | 顧客フィードバック | owner, manager |

---

## 3. データモデル（全テーブル）

### 3.1 認証・ユーザー

```sql
-- Supabase Auth管理（auth.users）
-- トリガーでprofiles自動作成

profiles (
  id UUID PK = auth.users.id,
  email TEXT UNIQUE,
  name TEXT,
  phone TEXT,
  picture TEXT
)

stores (
  id UUID PK,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  owner_id UUID → profiles.id,
  timezone TEXT DEFAULT 'Asia/Tokyo',
  settings JSONB DEFAULT '{}'
)

store_staff (
  id UUID PK,
  store_id UUID → stores.id,
  user_id UUID → profiles.id,
  role staff_role NOT NULL DEFAULT 'part_time',
  hourly_wage INTEGER DEFAULT 0,
  joined_at TIMESTAMPTZ DEFAULT now()
  -- UNIQUE(store_id, user_id)
)

store_invitations (
  id UUID PK,
  store_id UUID → stores.id,
  name TEXT,
  email TEXT NOT NULL,
  role staff_role DEFAULT 'part_time',
  hourly_wage INTEGER DEFAULT 0,
  invited_by UUID → profiles.id,
  created_at TIMESTAMPTZ DEFAULT now()
  -- UNIQUE(store_id, email)
)
```

### 3.2 勤怠

```sql
time_records (
  id UUID PK,
  store_id UUID → stores.id,
  staff_id UUID → store_staff.id,
  clock_in TIMESTAMPTZ NOT NULL DEFAULT now(),
  clock_out TIMESTAMPTZ,          -- NULLなら勤務中
  break_minutes INTEGER DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
)
-- INDEX: (store_id, clock_in), (staff_id)
```

### 3.3 シフト

```sql
shifts (
  id UUID PK,
  store_id UUID → stores.id,
  staff_id UUID → store_staff.id,
  date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  break_minutes INTEGER DEFAULT 0,
  note TEXT,
  status shift_status DEFAULT 'draft',  -- draft | published
  created_at TIMESTAMPTZ DEFAULT now()
  -- UNIQUE(store_id, staff_id, date)
)

shift_requests (
  id UUID PK,
  store_id UUID → stores.id,
  staff_id UUID → store_staff.id,
  date DATE NOT NULL,
  request_type request_type,  -- available | unavailable | preferred
  start_time TIME,
  end_time TIME,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
  -- UNIQUE(store_id, staff_id, date)
)

shift_templates (
  id UUID PK,
  store_id UUID → stores.id,
  name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  break_minutes INTEGER DEFAULT 0,
  color TEXT
)
```

### 3.4 チェックリスト

```sql
checklists (
  id UUID PK,
  store_id UUID → stores.id,
  timing check_timing,  -- clock_in | clock_out
  items JSONB NOT NULL DEFAULT '[]'
  -- UNIQUE(store_id, timing)
)

checklist_templates (
  id UUID PK,
  store_id UUID → stores.id,
  name TEXT NOT NULL,
  layer TEXT DEFAULT 'base',    -- base | shift
  timing check_timing,
  items JSONB NOT NULL DEFAULT '[]',
  sort_order INTEGER DEFAULT 0
)

shift_checklist_map (
  id UUID PK,
  store_id UUID → stores.id,
  shift_type TEXT NOT NULL,
  template_id UUID → checklist_templates.id
  -- UNIQUE(store_id, shift_type, template_id)
)

check_records (
  id UUID PK,
  store_id UUID → stores.id,
  staff_id UUID → store_staff.id,
  user_id UUID → profiles.id,
  timing check_timing,
  results JSONB NOT NULL DEFAULT '[]',
  all_checked BOOLEAN DEFAULT false,
  checked_at TIMESTAMPTZ DEFAULT now()
)
```

### 3.5 商品・日報

```sql
menu_items (
  id UUID PK,
  store_id UUID → stores.id,
  name TEXT NOT NULL,
  category TEXT,
  price INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0
)

daily_reports (
  id UUID PK,
  store_id UUID → stores.id,
  date DATE NOT NULL,
  sales INTEGER DEFAULT 0,
  customer_count INTEGER DEFAULT 0,
  weather TEXT,
  memo TEXT,
  created_by UUID → profiles.id,
  created_at TIMESTAMPTZ DEFAULT now()
  -- UNIQUE(store_id, date)
)

daily_report_items (
  id UUID PK,
  report_id UUID → daily_reports.id,
  menu_item_id UUID → menu_items.id,
  quantity INTEGER DEFAULT 0,
  unit_price INTEGER DEFAULT 0
)
```

### 3.6 在庫

```sql
inventory_items (
  id UUID PK,
  store_id UUID → stores.id,
  name TEXT NOT NULL,
  category TEXT,
  unit TEXT,
  quantity NUMERIC DEFAULT 0,
  min_quantity NUMERIC DEFAULT 0,
  cost NUMERIC DEFAULT 0,
  note TEXT,
  status TEXT DEFAULT 'ok',
  last_checked_at TIMESTAMPTZ
)
```

### 3.7 お知らせ

```sql
notices (
  id UUID PK,
  store_id UUID → stores.id,
  author_id UUID → profiles.id,
  title TEXT NOT NULL,
  body TEXT,
  pinned BOOLEAN DEFAULT false,
  image_urls TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
)

notice_reads (
  id UUID PK,
  notice_id UUID → notices.id,
  user_id UUID → profiles.id,
  read_at TIMESTAMPTZ DEFAULT now()
  -- UNIQUE(notice_id, user_id)
)
```

### 3.8 有給管理

```sql
paid_leaves (
  id UUID PK,
  store_id UUID → stores.id,
  staff_id UUID → store_staff.id,
  fiscal_year INTEGER NOT NULL,
  total_days NUMERIC DEFAULT 0,
  used_days NUMERIC DEFAULT 0,
  granted_at TIMESTAMPTZ DEFAULT now()
  -- UNIQUE(store_id, staff_id, fiscal_year)
)

leave_records (
  id UUID PK,
  store_id UUID → stores.id,
  staff_id UUID → store_staff.id,
  date DATE NOT NULL,
  type TEXT DEFAULT '全日',    -- 全日 | 半日
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
)
```

### 3.9 経費

```sql
expenses (
  id UUID PK,
  store_id UUID → stores.id,
  date DATE NOT NULL,
  category TEXT,
  description TEXT,
  amount INTEGER DEFAULT 0,
  receipt_note TEXT,
  created_by UUID → profiles.id,
  created_at TIMESTAMPTZ DEFAULT now()
)
```

### 3.10 顧客フィードバック

```sql
customer_feedback (
  id UUID PK,
  store_id UUID → stores.id,
  date DATE,
  type TEXT,         -- praise | complaint | suggestion | other
  content TEXT,
  response TEXT,
  status TEXT DEFAULT 'new',  -- new | in_progress | resolved
  created_by UUID → profiles.id,
  created_at TIMESTAMPTZ DEFAULT now()
)
```

### 3.11 プラグイン設定

```sql
store_plugins (
  id UUID PK,
  store_id UUID → stores.id,
  plugin_name TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}',
  -- UNIQUE(store_id, plugin_name)
)

plugin_permissions (
  id UUID PK,
  store_id UUID → stores.id,
  plugin_name TEXT NOT NULL,
  role staff_role NOT NULL,
  -- UNIQUE(store_id, plugin_name, role)
)
```

### ENUM定義

```sql
staff_role    = owner | manager | leader | full_time | part_time
check_timing  = clock_in | clock_out
shift_status  = draft | published
request_type  = available | unavailable | preferred
```

---

## 4. APIエンドポイント一覧

### 4.1 認証・店舗管理

| メソッド | パス | 説明 | 権限 |
|---------|------|------|------|
| GET | `/api/stores` | 自分の所属店舗一覧 | 認証済み |
| POST | `/api/stores` | 店舗作成 | 認証済み |
| GET | `/api/stores/:storeId/staff` | スタッフ一覧 | スタッフ |
| POST | `/api/stores/:storeId/staff` | スタッフ招待 | owner/manager |
| PUT | `/api/stores/:storeId/staff/:staffId` | ロール・時給変更 | owner/manager |
| DELETE | `/api/stores/:storeId/staff/:staffId` | スタッフ解除 | owner/manager |
| POST | `/api/stores/:storeId/staff/rehire` | 再雇用 | owner/manager |
| GET | `/api/stores/:storeId/invitations` | 招待一覧 | owner/manager |
| POST | `/api/stores/:storeId/invitations/:id/resend` | 招待再送 | owner/manager |
| DELETE | `/api/stores/:storeId/invitations/:id` | 招待取消 | owner/manager |
| POST | `/api/stores/:storeId/join` | 招待リンクで参加 | 未認証可 |
| PUT | `/api/stores/:storeId/initial-password` | 初期パスワード設定 | owner/manager |
| GET | `/api/stores/:storeId/initial-password` | 初期パスワード取得 | owner/manager |

### 4.2 勤怠（タイムカード）

| メソッド | パス | 説明 | 権限 |
|---------|------|------|------|
| POST | `/api/timecard/:storeId/clock-in` | 出勤打刻 | スタッフ（owner以外） |
| POST | `/api/timecard/:storeId/clock-out` | 退勤打刻 | スタッフ（owner以外） |
| GET | `/api/timecard/:storeId/status` | 打刻状態取得（isStale検出含む） | スタッフ |
| GET | `/api/timecard/:storeId/daily?date=` | 日別タイムカード一覧 | スタッフ |
| GET | `/api/timecard/:storeId/monthly?year=&month=` | 月別集計（給与概算含む） | スタッフ |
| POST | `/api/timecard/:storeId/correct-and-clockin` | 未退勤修正＋新規出勤 | スタッフ |
| PUT | `/api/timecard/:storeId/records/:recordId` | 勤怠レコード修正 | owner/manager |

### 4.3 シフト

| メソッド | パス | 説明 | 権限 |
|---------|------|------|------|
| GET | `/api/shift/:storeId/weekly?date=` | 週次シフト取得 | スタッフ |
| POST | `/api/shift/:storeId` | シフト作成/更新(upsert) | owner/manager/leader |
| POST | `/api/shift/:storeId/publish` | シフト一括公開 | owner/manager/leader |
| DELETE | `/api/shift/:storeId/:shiftId` | シフト削除 | owner/manager/leader |
| GET | `/api/shift/:storeId/requests?date=` | シフト希望一覧 | スタッフ |
| POST | `/api/shift/:storeId/requests` | シフト希望提出 | スタッフ |
| DELETE | `/api/shift/:storeId/requests/:id` | シフト希望削除 | スタッフ |
| GET | `/api/shift/:storeId/templates` | テンプレート一覧 | owner/manager |
| POST | `/api/shift/:storeId/templates` | テンプレート作成 | owner/manager |
| DELETE | `/api/shift/:storeId/templates/:id` | テンプレート削除 | owner/manager |

### 4.4 チェックリスト

| メソッド | パス | 説明 | 権限 |
|---------|------|------|------|
| GET | `/api/check/checklists/:storeId/:timing` | チェックリスト取得 | スタッフ |
| PUT | `/api/check/checklists/:storeId/:timing` | チェックリスト更新 | owner/manager |
| GET | `/api/check/templates/:storeId` | テンプレート一覧 | スタッフ |
| POST | `/api/check/templates/:storeId` | テンプレート作成 | owner/manager |
| PUT | `/api/check/templates/:storeId/:id` | テンプレート更新 | owner/manager |
| DELETE | `/api/check/templates/:storeId/:id` | テンプレート削除 | owner/manager |
| GET | `/api/check/shift-map/:storeId` | シフト別チェック割当 | スタッフ |
| PUT | `/api/check/shift-map/:storeId` | 割当一括更新 | owner/manager |
| GET | `/api/check/templates/:storeId/for-shift/:type/:timing` | シフト用マージ済みリスト | スタッフ |
| POST | `/api/check/records` | チェック結果記録 | スタッフ |
| GET | `/api/check/records/:storeId` | チェック履歴 | スタッフ |

### 4.5 商品マスタ

| メソッド | パス | 説明 | 権限 |
|---------|------|------|------|
| GET | `/api/menu/:storeId/items?active=` | 商品一覧 | スタッフ |
| POST | `/api/menu/:storeId/items` | 商品追加 | owner/manager |
| PUT | `/api/menu/:storeId/items/:id` | 商品更新 | owner/manager |
| DELETE | `/api/menu/:storeId/items/:id` | 商品削除（論理削除） | owner/manager |

### 4.6 日報

| メソッド | パス | 説明 | 権限 |
|---------|------|------|------|
| GET | `/api/daily-report/:storeId/reports?year=&month=` | 月別日報一覧+集計 | owner/manager/leader |
| GET | `/api/daily-report/:storeId/reports/:date` | 日報詳細+明細 | owner/manager/leader |
| POST | `/api/daily-report/:storeId/reports` | 日報作成/更新(upsert) | owner/manager/leader |

### 4.7 在庫

| メソッド | パス | 説明 | 権限 |
|---------|------|------|------|
| GET | `/api/inventory/:storeId/items?category=` | 在庫一覧 | owner/manager/leader |
| POST | `/api/inventory/:storeId/items` | 在庫追加 | owner/manager/leader |
| PUT | `/api/inventory/:storeId/items/:id` | 在庫更新 | owner/manager/leader |
| DELETE | `/api/inventory/:storeId/items/:id` | 在庫削除（物理削除） | owner/manager/leader |

### 4.8 お知らせ

| メソッド | パス | 説明 | 権限 |
|---------|------|------|------|
| GET | `/api/notice/:storeId/posts` | お知らせ一覧（既読状態付き） | スタッフ |
| POST | `/api/notice/:storeId/posts` | お知らせ投稿 | owner/manager |
| POST | `/api/notice/:storeId/posts/:id/read` | 既読にする | スタッフ |
| PUT | `/api/notice/:storeId/posts/:id/pin` | ピン留めトグル | owner/manager |
| PATCH | `/api/notice/:storeId/posts/:id/images` | 画像URL更新 | owner/manager |
| DELETE | `/api/notice/:storeId/posts/:id` | お知らせ削除 | owner/manager |

### 4.9 有給管理

| メソッド | パス | 説明 | 権限 |
|---------|------|------|------|
| GET | `/api/paid-leave/:storeId/summary?fiscalYear=` | 有給残日数一覧 | スタッフ（自分のみ）/管理者（全員） |
| POST | `/api/paid-leave/:storeId/grant` | 有給付与 | owner/manager |
| POST | `/api/paid-leave/:storeId/use` | 有給使用記録 | owner/manager |
| GET | `/api/paid-leave/:storeId/records?fiscalYear=` | 取得履歴 | スタッフ |

### 4.10 残業・連勤アラート

| メソッド | パス | 説明 | 権限 |
|---------|------|------|------|
| GET | `/api/overtime-alert/:storeId/monthly?year=&month=` | 残業状況（normal/warning/danger） | owner/manager |
| GET | `/api/consecutive-work/:storeId/status` | 連勤状況（直近30日） | owner/manager |

### 4.11 経費

| メソッド | パス | 説明 | 権限 |
|---------|------|------|------|
| GET | `/api/expense/:storeId/items?year=&month=&category=` | 経費一覧+カテゴリ集計 | owner/manager |
| POST | `/api/expense/:storeId/items` | 経費追加 | owner/manager |
| PUT | `/api/expense/:storeId/items/:id` | 経費更新 | owner/manager |
| DELETE | `/api/expense/:storeId/items/:id` | 経費削除 | owner/manager |

### 4.12 顧客フィードバック

| メソッド | パス | 説明 | 権限 |
|---------|------|------|------|
| GET | `/api/feedback/:storeId/items?status=&type=` | フィードバック一覧 | owner/manager |
| POST | `/api/feedback/:storeId/items` | フィードバック追加 | owner/manager |
| PUT | `/api/feedback/:storeId/items/:id` | 対応・ステータス更新 | owner/manager |
| DELETE | `/api/feedback/:storeId/items/:id` | フィードバック削除 | owner/manager |

### 4.13 プラグイン設定

| メソッド | パス | 説明 | 権限 |
|---------|------|------|------|
| GET | `/api/plugin-settings/:storeId` | プラグイン一覧（有効/無効/設定） | スタッフ |
| POST | `/api/plugin-settings/:storeId/:pluginName` | プラグインON/OFF | owner |
| PUT | `/api/plugin-settings/:storeId/:pluginName/config` | プラグイン設定更新 | owner |
| PUT | `/api/plugin-settings/:storeId/:pluginName/permissions` | アクセスロール設定 | owner |

---

## 5. フロントエンド画面一覧

### 認証フロー
| 画面 | 説明 |
|------|------|
| LoginPage | メール/パスワードでログイン・新規登録 |
| StoreSelectPage | 所属店舗選択・新規店舗作成 |
| PasswordChangePage | 初回ログイン時のパスワード変更 |

### プラグイン画面
| 画面 | プラグイン | 説明 |
|------|-----------|------|
| PunchClockPage | punch | 大きな出退勤ボタン。現在時刻表示、勤務時間経過、休憩入力モーダル。退勤押し忘れ時は修正モーダル自動表示 |
| DashboardPage | attendance | 日別テーブル（スタッフ・出退勤・休憩・実働）+ 月別集計（出勤日数・合計時間・概算給与）。未退勤アラートバナー。オーナーは行編集可 |
| StaffPage | staff | スタッフ一覧、招待フロー、ロール・時給編集、解除・再雇用 |
| ShiftPage | shift | 週次カレンダー、ドラッグ操作、テンプレート適用、一括公開 |
| ShiftRequestPage | shift_request | スタッフがシフト希望（出勤可/不可/希望）を日別に提出 |
| ChecklistAdminPage | check | チェックリストテンプレート管理（ベース/シフト別レイヤー）、シフト別割当設定 |
| MenuPage | menu | 商品マスタCRUD（名前・カテゴリ・価格・並び順） |
| DailyReportPage | daily_report | 日報入力（手入力 or 商品別）+ 月次一覧、売上推移 |
| InventoryPage | inventory | 在庫一覧、低在庫アラート、数量更新 |
| NoticePage | notice | お知らせ投稿・一覧・既読管理・ピン留め |
| PaidLeavePage | paid_leave | 有給付与・使用記録・残日数表示 |
| OvertimeAlertPage | overtime_alert | 月別残業状況ダッシュボード（normal/warning/danger色分け） |
| ConsecutiveWorkPage | consecutive_work | 連勤日数追跡、疲労度アラート |
| ExpensePage | expense | 経費入力・カテゴリ別集計 |
| FeedbackPage | feedback | 顧客の声の記録・対応状況管理 |
| PluginSettingsPage | settings | プラグインON/OFF、ロール別アクセス設定、プラグイン固有設定 |

### UI構造
- **デスクトップ**: サイドバーナビ（プラグインタブ）+ メインコンテンツ
- **モバイル**: カードグリッドメニュー → 各画面 → 戻るボタン
- プライマリタブ（大きく表示）: `punch`, `check`
- セカンダリタブ: その他全プラグイン

---

## 6. 主要ビジネスロジック

### 6.1 退勤押し忘れ対応
1. **ステータスAPI** が `isStale` フラグを返す（出勤日≠今日なら`true`）
2. **スタッフ側**: ページ表示時に自動検出 → 修正モーダル（退勤時刻・休憩入力）→ `correct-and-clockin` で旧レコード修正＋新規出勤を一括実行
3. **オーナー側**: ダッシュボードにアラートバナー表示（直近7日の未退勤）→ 行タップで編集モーダル

### 6.2 出退勤フロー
```
[出勤ボタン] → チェックリストゲート → API clock-in → 完了
[退勤ボタン] → 休憩入力モーダル → チェックリストゲート
  → (manager/leader) 日報フォーム → API保存 → clock-out
  → (staff) 即 clock-out → 完了
```

### 6.3 シフト管理フロー
```
[スタッフ] シフト希望提出 (available/unavailable/preferred)
[管理者] 週次カレンダーでシフト作成 (draft)
[管理者] 一括公開 (draft → published)
[スタッフ] 公開されたシフトを確認
```

### 6.4 チェックリストレイヤーシステム
- **base**: 全シフト共通のチェック項目
- **shift**: 特定シフトタイプ専用の追加項目
- 実行時は base + 該当shift のテンプレートをマージして表示

### 6.5 月次給与概算
```
合計勤務分 = Σ (clock_out - clock_in - break_minutes)  ※clock_outあるレコードのみ
概算給与 = (合計勤務分 / 60) × hourly_wage
```

### 6.6 日報の商品別入力
- 商品マスタから一覧取得 → 数量入力 → 合計金額自動計算
- daily_report_itemsに明細保存（menuItemId + quantity + unit_price）
- 手入力モードとの切替可能

---

## 7. セキュリティ

### Row Level Security (RLS)
全テーブルにRLS有効。主要ポリシー:
- **profiles**: 自分のみ読み書き
- **stores**: 所属スタッフのみ閲覧
- **store_staff**: 同店舗スタッフのみ閲覧、自分のみ更新
- **time_records**: 同店舗スタッフのみ閲覧、自分のみ挿入/更新
- **その他プラグインテーブル**: 同店舗スタッフのみアクセス

### RLSヘルパー関数（SECURITY DEFINER）
```sql
get_my_store_ids()          -- 自分の所属店舗ID配列
get_my_managed_store_ids()  -- 管理権限のある店舗ID配列
get_my_staff_ids()          -- 自分のstore_staff ID配列
```

### 認証フロー
```
[Frontend] supabase.auth.signIn() → JWT取得
[Frontend] Authorization: Bearer <JWT> をヘッダーに付与
[Backend]  requireAuth middleware → supabaseAdmin.auth.getUser(token) で検証
[Backend]  req.user にユーザー情報セット
```

---

## 8. プラグイン設定スキーマ

### shift
| キー | 型 | デフォルト | 説明 |
|------|-----|----------|------|
| `default_start_time` | text | "09:00" | デフォルト開始時間 |
| `default_end_time` | text | "17:00" | デフォルト終了時間 |
| `allow_staff_request` | boolean | true | スタッフのシフト希望提出許可 |

### overtime_alert
| キー | 型 | デフォルト | 説明 |
|------|-----|----------|------|
| `monthly_limit_hours` | number | 45 | 月間残業上限(時間) |
| `standard_hours_per_day` | number | 8 | 1日の所定労働時間 |

---

## 9. デプロイ構成

```
Frontend + Backend API → Vercel Serverless
  ├── vercel.json でルーティング設定
  ├── /api/* → Express (backend/dist/)
  └── /* → React SPA (frontend/dist/)

Database → Supabase (PostgreSQL)
  ├── supabase/migrations/ でスキーマ管理
  └── RLS + トリガーでセキュリティ担保
```

### 環境変数
```
SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
FRONTEND_URL, PORT, NODE_ENV
VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
```

---

## 10. 技術スタック

| レイヤー | 技術 |
|---------|------|
| Frontend | React 19, Vite 6, React Router 7, TypeScript 5 |
| Backend | Express 4, TypeScript 5, ts-node-dev |
| Database | Supabase (PostgreSQL), RLS |
| Auth | Supabase Auth (JWT) |
| Deploy | Vercel (Serverless Functions) |
| Test | Playwright (E2E) |
| Security | Helmet, CORS, RLS |

---

## 11. 既知の制約・未実装

| 項目 | 状態 |
|------|------|
| reservationsテーブル | スキーマのみ。予約機能は未実装 |
| 画像アップロード | Supabase Storageバケット定義済みだがルート未実装 |
| ページネーション | 全クエリがフルスキャン。大量データ時に問題 |
| オフライン対応 | なし。Service Worker未導入 |
| 監査ログ | created_by/updated_byが一部テーブルにしかない |
| 通知（Push/LINE） | 未実装 |
| 多言語対応 | 日本語のみ |
| ダークモード | 未対応 |

---

## 12. ディレクトリ構成

```
itamin-core/
├── backend/src/
│   ├── index.ts              # エントリポイント、プラグイン登録
│   ├── middleware/auth.ts     # JWT認証ミドルウェア
│   ├── auth/
│   │   ├── stores.ts         # 店舗・スタッフCRUD
│   │   └── authorization.ts  # 権限チェックヘルパー
│   ├── config/
│   │   ├── index.ts          # 環境変数
│   │   └── supabase.ts       # Supabaseクライアント
│   ├── timecard/routes.ts     # 勤怠ルート
│   ├── plugins/
│   │   ├── registry.ts       # プラグインレジストリ
│   │   ├── settings.ts       # プラグイン設定ルート
│   │   ├── core.ts           # コアプラグイン定義
│   │   ├── shift.ts          # シフト
│   │   ├── check.ts          # チェックリスト
│   │   ├── menu.ts           # 商品マスタ
│   │   ├── daily_report.ts   # 日報
│   │   ├── inventory.ts      # 在庫
│   │   ├── notice.ts         # お知らせ
│   │   ├── paid_leave.ts     # 有給
│   │   ├── overtime_alert.ts # 残業
│   │   ├── consecutive_work.ts # 連勤
│   │   ├── expense.ts        # 経費
│   │   └── feedback.ts       # フィードバック
│   └── types/index.ts        # 型定義
├── frontend/src/
│   ├── App.tsx                # メインレイアウト+タブナビ
│   ├── main.tsx               # Reactエントリ
│   ├── contexts/AuthContext.tsx # 認証コンテキスト
│   ├── api/client.ts          # APIクライアント（100+メソッド）
│   ├── pages/                 # 19画面
│   ├── components/            # 共有コンポーネント
│   ├── styles.css             # グローバルCSS
│   └── e2e/                   # Playwrightテスト
├── supabase/migrations/       # 6マイグレーション
├── vercel.json
└── package.json
```
