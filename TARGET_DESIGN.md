# ITAMIN Core Target Design (2026-04-02)

## 1. Goal

既存の `SPEC.md` を土台に、スタックを大きく崩さずに **運用耐性・拡張性・監査性・開発速度** を最大化するターゲット設計。

- Frontend: React 19 + Vite SPA を維持
- Backend: Express on Vercel を維持
- Database/Auth/Storage: Supabase を維持
- 方針: **microservices ではなく tenant-safe modular monolith**

---

## 2. Core Principles

1. **Postgres を真の業務ソースにする**
   - 整合性はアプリコードだけでなく DB 制約・RLS・関数でも守る
2. **tenant isolation を DB レベルで保証する**
   - すべての運用テーブルに `store_id` を持たせる
3. **role と employment/pay を分離する**
   - 権限と勤怠対象/給与計算対象を同じ列で表現しない
4. **JSONB は設定に使い、運用データは正規化する**
   - 頻繁な検索・集計・監査対象は JSONB に逃がさない
5. **非同期処理は request path から追い出す**
   - 通知・再計算・エクスポートは queue / cron 化する
6. **監査ログを最初から入れる**
   - 誰が何を変えたかを後から追えるようにする
7. **read model を分ける**
   - 集計ダッシュボードを raw table の full scan に依存させない

---

## 3. Target Architecture

```text
[React SPA]
  ├─ Supabase Auth / Session
  ├─ Supabase Broadcast (realtime)
  ├─ Signed Upload URL -> Supabase Storage
  └─ Express API (business commands + privileged reads)

[Express API on Vercel]
  ├─ Modules
  │   ├─ memberships
  │   ├─ attendance
  │   ├─ shifts
  │   ├─ checklist
  │   ├─ menu
  │   ├─ daily-report
  │   ├─ inventory
  │   ├─ notices
  │   ├─ leave
  │   ├─ expenses
  │   ├─ feedback
  │   ├─ plugins
  │   └─ files / notifications
  ├─ Zod validation / OpenAPI generation
  ├─ Idempotency / Audit / Permission gate
  ├─ SQL transaction orchestration
  └─ Emits jobs/events

[Supabase]
  ├─ Postgres + RLS + helper functions
  ├─ Auth
  ├─ Storage
  ├─ Cron
  ├─ Queues
  └─ Broadcast
```

### Why this architecture

- まだマイクロサービスは早い
- ただし Express の巨大化は防ぐため、**module boundary** を明確にする
- 認証・セッション・ファイル配信・リアルタイムは Supabase を使い倒す
- 業務コマンドと複雑権限は Express に集約する
- 非同期は Queue/Cron へ退避し、API は短く速く保つ

---

## 4. Mandatory Design Changes

### 4.1 Initial Password API is removed

削除対象:
- `PUT /api/stores/:storeId/initial-password`
- `GET /api/stores/:storeId/initial-password`

置き換え:
- 招待メール + invite link
- 初回アクセス時の password set / magic link
- production では custom SMTP を前提化

### 4.2 Role と勤怠対象を分離

現行は `owner` が一律打刻不可だが、現場に立つオーナーや時給マネージャーを表現しにくい。

推奨:
- `role`: owner / manager / leader / staff
- `employment_type`: salaried / hourly / contractor
- `attendance_required`: boolean
- `pay_rule_id`: nullable

### 4.3 Shift を date+time から range へ

現行の `UNIQUE(store_id, staff_id, date)` では分割シフト・跨ぎ勤務に弱い。

推奨:
- `start_at timestamptz`
- `end_at timestamptz`
- 1 日複数シフトを許可
- 重複だけ exclusion constraint で禁止
- publish batch による週次公開バージョン管理

### 4.4 勤怠は session + breaks + events

現行の `break_minutes integer` だけでは弱い。

推奨:
- `attendance_sessions`
- `attendance_breaks`
- `attendance_events`
- `attendance_approvals`

こうすることで:
- 複数休憩
- 休憩修正
- 未退勤修正
- payroll 前 lock / approval
- geofence/device snapshot

を扱える。

### 4.5 Checklist は template/item/submission に分解

現行の `items JSONB`, `results JSONB` は v1 なら動くが、
- 設問単位の集計
- 写真必須
- 温度入力
- テンプレート version 管理
- 監査

に弱い。

推奨:
- `checklist_templates`
- `checklist_template_items`
- `checklist_assignments`
- `checklist_submissions`
- `checklist_submission_items`
- 監査用 snapshot JSON は提出時に保持

### 4.6 Inventory は current quantity だけでなく ledger を持つ

現行の `inventory_items.quantity` だけでは履歴が飛ぶ。

推奨:
- `inventory_items`
- `inventory_movements` (purchase / use / waste / adjust / stocktake)
- `inventory_stocktakes` (optional)

`quantity` は projection / cached value として持つか、movement から導出する。

### 4.7 Leave は summary row ではなく ledger にする

現行の `paid_leaves(total_days, used_days)` は補正に弱い。

推奨:
- `leave_ledger`
  - grant
  - use
  - adjust
  - expire
- `leave_balances` は read model でよい

### 4.8 Wage は current value ではなく history + snapshot

現行の `store_staff.hourly_wage` だけだと、時給改定後に過去月の給与概算が壊れる。

推奨:
- `wage_rates`
- `attendance_sessions.wage_rate_snapshot`

---

## 5. Recommended Data Model

## 5.1 Shared Columns

運用テーブルには原則として以下を標準化する。

- `id uuid pk`
- `store_id uuid not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `created_by uuid null`
- `updated_by uuid null`
- `deleted_at timestamptz null` (必要テーブルのみ)
- `row_version bigint not null default 0`

### Common rule

子テーブルにも `store_id` を持たせる。

理由:
- tenant isolation を FK と RLS の両面で強化できる
- join 時に条件が単純になる
- partitioning / indexing 設計がやりやすい

---

## 5.2 Identity / Membership

```sql
profiles (
  id uuid pk,
  email text unique,
  name text,
  phone text,
  picture text,
  created_at timestamptz,
  updated_at timestamptz
)

stores (
  id uuid pk,
  name text not null,
  address text,
  phone text,
  timezone text not null default 'Asia/Tokyo',
  business_day_cutoff_minutes integer not null default 240,
  settings jsonb not null default '{}',
  created_at timestamptz,
  updated_at timestamptz
)

memberships (
  id uuid pk,
  store_id uuid not null,
  user_id uuid not null,
  role text not null,
  employment_type text not null default 'hourly',
  attendance_required boolean not null default true,
  status text not null default 'active',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid,
  updated_by uuid
)

wage_rates (
  id uuid pk,
  store_id uuid not null,
  membership_id uuid not null,
  rate_type text not null default 'hourly',
  amount numeric not null,
  effective_from timestamptz not null,
  effective_to timestamptz,
  created_at timestamptz,
  created_by uuid
)

invitations (
  id uuid pk,
  store_id uuid not null,
  email text not null,
  intended_role text not null,
  intended_employment_type text not null default 'hourly',
  invited_by uuid not null,
  token_hash text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz
)
```

### Constraints

- active membership のみ unique: `(store_id, user_id) where left_at is null`
- `stores.owner_id` は廃止し、owner は membership で表現

---

## 5.3 Permission Model

`plugin_permissions(role 単位のみ)` だと柔軟性が足りない。

推奨:

```sql
permission_grants (
  id uuid pk,
  store_id uuid not null,
  subject_type text not null,   -- role | membership
  subject_key text not null,    -- manager / leader / <membership_id>
  permission_key text not null, -- shift.publish / attendance.manage
  effect text not null default 'allow', -- allow | deny
  created_at timestamptz,
  created_by uuid
)
```

### Permission strategy

- role は base template
- membership override を許可
- plugin ON/OFF は `store_plugins`
- plugin が disable でもデータは保持して hidden にする

---

## 5.4 Attendance

```sql
attendance_sessions (
  id uuid pk,
  store_id uuid not null,
  membership_id uuid not null,
  business_date date not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  unpaid_break_minutes integer not null default 0,
  wage_rate_snapshot numeric,
  status text not null default 'open', -- open | closed | corrected | locked
  source text not null default 'web',  -- web | mobile | kiosk | api
  geo_lat numeric,
  geo_lng numeric,
  geo_accuracy_m numeric,
  device_id_hash text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid,
  updated_by uuid,
  corrected_by uuid,
  corrected_reason text,
  locked_at timestamptz,
  locked_by uuid,
  work_minutes integer generated always as (
    case
      when ended_at is null then null
      else greatest(0, floor(extract(epoch from (ended_at - started_at)) / 60)::int - unpaid_break_minutes)
    end
  ) stored
)

attendance_breaks (
  id uuid pk,
  store_id uuid not null,
  session_id uuid not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz,
  created_by uuid
)

attendance_events (
  id uuid pk,
  store_id uuid not null,
  session_id uuid,
  membership_id uuid not null,
  event_type text not null, -- clock_in | break_start | break_end | clock_out | correction
  payload jsonb not null default '{}',
  occurred_at timestamptz not null,
  actor_user_id uuid,
  created_at timestamptz not null default now()
)

attendance_approvals (
  id uuid pk,
  store_id uuid not null,
  membership_id uuid not null,
  period_start date not null,
  period_end date not null,
  approved_at timestamptz,
  approved_by uuid,
  locked_at timestamptz,
  created_at timestamptz
)
```

### Important indexes/constraints

- unique open session: `(store_id, membership_id) where ended_at is null`
- index: `(store_id, business_date desc)`
- index: `(membership_id, business_date desc)`
- index: `(store_id, started_at desc)`

---

## 5.5 Shifts

```sql
shift_publish_batches (
  id uuid pk,
  store_id uuid not null,
  week_start date not null,
  revision integer not null,
  published_at timestamptz not null,
  published_by uuid not null,
  notify_staff boolean not null default true,
  created_at timestamptz not null default now()
)

shift_slots (
  id uuid pk,
  store_id uuid not null,
  membership_id uuid,
  station text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  unpaid_break_minutes integer not null default 0,
  status text not null default 'draft', -- draft | published | cancelled
  publish_batch_id uuid,
  note text,
  ack_required boolean not null default false,
  acknowledged_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid,
  updated_by uuid,
  slot_range tstzrange generated always as (tstzrange(start_at, end_at, '[)')) stored
)

shift_requests (
  id uuid pk,
  store_id uuid not null,
  membership_id uuid not null,
  request_kind text not null, -- unavailable | preferred | available
  start_at timestamptz not null,
  end_at timestamptz not null,
  note text,
  created_at timestamptz not null default now()
)

shift_templates (
  id uuid pk,
  store_id uuid not null,
  name text not null,
  station text,
  start_time time not null,
  end_time time not null,
  unpaid_break_minutes integer not null default 0,
  color text,
  created_at timestamptz,
  updated_at timestamptz
)
```

### Constraints

- `end_at > start_at`
- same membership overlapping shift 禁止
- same station coverage rules は将来拡張

---

## 5.6 Checklist / HACCP

```sql
checklist_templates (
  id uuid pk,
  store_id uuid not null,
  name text not null,
  timing text not null,         -- clock_in | clock_out | shift_mid
  layer text not null default 'base',
  version integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid,
  updated_by uuid
)

checklist_template_items (
  id uuid pk,
  store_id uuid not null,
  template_id uuid not null,
  item_key text not null,
  label text not null,
  item_type text not null,      -- checkbox | numeric | text | photo
  required boolean not null default true,
  min_value numeric,
  max_value numeric,
  options jsonb not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz,
  updated_at timestamptz
)

checklist_assignments (
  id uuid pk,
  store_id uuid not null,
  timing text not null,
  shift_type text,
  template_id uuid not null,
  created_at timestamptz not null default now()
)

checklist_submissions (
  id uuid pk,
  store_id uuid not null,
  membership_id uuid not null,
  session_id uuid,
  shift_slot_id uuid,
  timing text not null,
  template_id uuid not null,
  template_version integer not null,
  all_passed boolean not null default false,
  submitted_at timestamptz not null,
  submitted_by uuid not null,
  snapshot jsonb not null default '{}'
)

checklist_submission_items (
  id uuid pk,
  store_id uuid not null,
  submission_id uuid not null,
  template_item_id uuid,
  item_key text not null,
  bool_value boolean,
  numeric_value numeric,
  text_value text,
  file_path text,
  passed boolean,
  created_at timestamptz not null default now()
)
```

---

## 5.7 Menu / Daily Report

```sql
menu_items (
  id uuid pk,
  store_id uuid not null,
  name text not null,
  category text,
  price integer not null,
  is_active boolean not null default true,
  display_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)

daily_reports (
  id uuid pk,
  store_id uuid not null,
  business_date date not null,
  report_mode text not null default 'manual', -- manual | menu_breakdown | pos_import
  sales integer not null default 0,
  customer_count integer not null default 0,
  weather text,
  memo text,
  labor_cost integer,
  labor_ratio numeric,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)

daily_report_lines (
  id uuid pk,
  store_id uuid not null,
  report_id uuid not null,
  menu_item_id uuid,
  menu_item_name_snapshot text not null,
  unit_price_snapshot integer not null,
  quantity integer not null default 0,
  line_total integer generated always as (unit_price_snapshot * quantity) stored,
  created_at timestamptz not null default now()
)
```

---

## 5.8 Inventory

```sql
inventory_items (
  id uuid pk,
  store_id uuid not null,
  name text not null,
  category text,
  unit text,
  current_quantity numeric not null default 0,
  min_quantity numeric not null default 0,
  average_cost numeric,
  status text not null default 'ok',
  archived_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)

inventory_movements (
  id uuid pk,
  store_id uuid not null,
  item_id uuid not null,
  movement_type text not null, -- purchase | usage | waste | adjust | stocktake
  quantity_delta numeric not null,
  unit_cost numeric,
  note text,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by uuid
)
```

---

## 5.9 Notices

```sql
notices (
  id uuid pk,
  store_id uuid not null,
  title text not null,
  body text,
  author_id uuid not null,
  pinned boolean not null default false,
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)

notice_reads (
  id uuid pk,
  store_id uuid not null,
  notice_id uuid not null,
  membership_id uuid not null,
  read_at timestamptz not null default now(),
  unique (notice_id, membership_id)
)

files (
  id uuid pk,
  store_id uuid not null,
  bucket text not null,
  path text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid,
  created_at timestamptz not null default now()
)
```

---

## 5.10 Leave / Expense / Feedback

```sql
leave_ledger (
  id uuid pk,
  store_id uuid not null,
  membership_id uuid not null,
  fiscal_year integer not null,
  entry_type text not null, -- grant | use | adjust | expire
  days numeric not null,
  business_date date not null,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid
)

expenses (
  id uuid pk,
  store_id uuid not null,
  business_date date not null,
  category text,
  description text,
  amount integer not null,
  status text not null default 'submitted', -- submitted | approved | rejected
  created_by uuid not null,
  approved_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)

expense_files (
  id uuid pk,
  store_id uuid not null,
  expense_id uuid not null,
  file_id uuid not null,
  created_at timestamptz not null default now()
)

customer_feedback (
  id uuid pk,
  store_id uuid not null,
  business_date date,
  source text default 'manual',
  type text not null,
  content text not null,
  response text,
  status text not null default 'new',
  priority text not null default 'normal',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

---

## 5.11 Ops / Internal Tables

```sql
audit_logs (
  id uuid pk,
  store_id uuid,
  actor_user_id uuid,
  actor_membership_id uuid,
  resource_type text not null,
  resource_id uuid,
  action text not null,
  before jsonb,
  after jsonb,
  request_id text,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
)

idempotency_keys (
  id uuid pk,
  store_id uuid not null,
  key text not null,
  request_hash text not null,
  response_code integer,
  response_body jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (store_id, key)
)

notification_jobs (
  id uuid pk,
  store_id uuid not null,
  job_type text not null,
  payload jsonb not null,
  status text not null default 'queued',
  run_after timestamptz not null default now(),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)

alert_instances (
  id uuid pk,
  store_id uuid not null,
  alert_type text not null, -- overtime | consecutive_work | stale_punch
  severity text not null,   -- normal | warning | danger
  target_membership_id uuid,
  snapshot jsonb not null default '{}',
  emitted_at timestamptz not null default now(),
  resolved_at timestamptz
)
```

---

## 6. RLS / Security Design

## 6.1 Policy Rule

- exposed schema は `public` のみ最小化
- helper functions は `private` schema に置く
- `SECURITY DEFINER` を使うときは `SET search_path = ''`
- policy 内では `(select private.has_permission(store_id, 'attendance.manage'))` の形に統一
- `TO authenticated` を明示
- policy に出る列には index を貼る
- client に expose する view は `security_invoker = true`

## 6.2 JWT Strategy

- JWT に細かい動的権限を詰め込まない
- JWT には粗い claim のみ
- 本当の権限評価は DB 側 membership / permission_grants を参照
- `user_metadata` を認可ソースに使わない

## 6.3 Audit Strategy

- 業務監査は `audit_logs`
- DB statement 監査は `pgaudit` を限定的に使用
- global logging は避ける

## 6.4 Auth Hardening

- owner / manager は MFA 必須推奨
- 招待・パスワード設定・password reset は token link ベース
- custom SMTP 前提

---

## 7. Plugin System v2

## 7.1 Plugin Manifest

コード上の manifest を持つ。

```ts
export type PluginManifest = {
  key: string
  core: boolean
  dependencies: string[]
  permissions: string[]
  configSchema: unknown
  nav: {
    label: string
    icon: string
    mobilePriority: 'primary' | 'secondary'
  }
}
```

### Example

- `shift_request` depends on `shift`
- `overtime_alert` depends on `attendance`
- `consecutive_work` depends on `attendance`

## 7.2 Effective Plugin Resolution

画面表示時は以下の AND 条件で決める。

- plugin enabled
- permission granted
- dependency enabled
- store feature rollout enabled (optional)

---

## 8. API Design Rules

## 8.1 Style

- `/v1/...`
- list API は cursor pagination 必須
- mutation API は idempotency key 対応
- response envelope を統一
- request id をすべて返す

### Response shape

```json
{
  "data": {},
  "meta": {
    "requestId": "...",
    "nextCursor": null
  },
  "error": null
}
```

## 8.2 Commands vs Resources

### Resource examples
- `GET /v1/stores/:storeId/attendance/sessions?from=&to=&cursor=`
- `GET /v1/stores/:storeId/shifts?from=&to=&cursor=`
- `GET /v1/stores/:storeId/notices?cursor=`

### Command examples
- `POST /v1/stores/:storeId/attendance/actions/clock-in`
- `POST /v1/stores/:storeId/attendance/actions/clock-out`
- `POST /v1/stores/:storeId/shifts/actions/publish-week`
- `POST /v1/stores/:storeId/files/actions/create-upload-url`

## 8.3 Validation

- Zod schema を single source of truth にする
- OpenAPI は schema から生成
- frontend / backend の shared package で型共有

---

## 9. Async / Realtime

## 9.1 Cron Jobs

- stale punch sweep
- monthly labor summary refresh
- leave expiry / carryover
- daily digest
- orphan upload cleanup

## 9.2 Queue Jobs

- notice fanout
- shift publish notification fanout
- email delivery
- payroll export generation
- image post-processing
- webhook delivery retry

## 9.3 Realtime

Use cases:
- 新着お知らせ
- シフト公開完了
- 打刻状態の更新
- 管理者承認の反映

---

## 10. Reporting / Read Models

raw table を直接 full scan しない。

推奨 read model:
- `attendance_daily_summary`
- `attendance_monthly_summary`
- `labor_daily_summary`
- `inventory_low_stock_view`
- `leave_balance_view`
- `overtime_monthly_status`
- `consecutive_work_status`

materialized view / table / incremental projection のいずれかで実装する。

---

## 11. Observability / Production Readiness

## 11.1 App Observability

- request_id を全レイヤーで伝搬
- structured logs
- `store_id`, `user_id`, `membership_id`, `route`, `duration_ms` を基本項目にする
- OpenTelemetry 導入

## 11.2 DB Observability

- Security Advisor / Performance Advisor を定期確認
- connection pool usage monitoring
- slow query log のレビュー

## 11.3 Production Settings

- Vercel region と Supabase region を近接させる
- transaction pooler を使う
- prepared statements 無効化
- PITR / backups 有効化
- custom SMTP 設定

---

## 12. Product Features Worth Adding (v2/v3)

### v2 強化

- geofenced clock in/out
- shift acknowledgment
- timesheet approval & payroll lock
- multiple wage rates
- labor cost vs sales dashboard
- shift reminders / read receipts

### v3 強化

- shift swap / open shift marketplace
- POS integration
- accounting integration
- training / certification plugin
- LINE/push notifications
- forecast scheduling

---

## 13. Migration Order

## Phase 1 — Security + Core Integrity

1. initial-password API 廃止
2. membership / pay model 導入
3. attendance_sessions 系へ移行
4. shift_slots 系へ移行
5. checklist 正規化
6. audit_logs / idempotency_keys 導入
7. RLS helper 関数を private schema 化

## Phase 2 — Scale + Ops

1. pagination
2. summary/read models
3. storage signed upload
4. cron / queue
5. Broadcast realtime
6. observability / pgaudit / advisors

## Phase 3 — Differentiators

1. geofence
2. payroll lock / approvals
3. wage history UX
4. labor-cost insights
5. integrations

---

## 14. Final Recommendation

最強設計としては、以下の一文に要約できる。

> **ITAMIN は、Supabase を基盤にした tenant-safe modular monolith として設計し、DB 制約・RLS・監査ログで整合性を守り、通知や再計算は Queue/Cron に逃がし、フロントには capability-aware plugin registry を返す。**

この形なら:
- MVP の速度を落とさない
- multi-tenant / security を崩しにくい
- 飲食店ドメインの split shift / break / labor cost / compliance に耐えやすい
- 将来の multi-location, integrations, analytics に拡張しやすい
