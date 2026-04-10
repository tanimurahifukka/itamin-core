# sql/archive/

このディレクトリは、`supabase/migrations/` に取り込まれる前に作業用として使っていた SQL ファイルのアーカイブです。

いずれのファイルも **現在は対応するマイグレーションファイルが存在**しており、本番 DB への適用は `supabase/migrations/` を正とします。
このアーカイブを直接 Supabase に適用しないでください。

---

## ファイル一覧と対応するマイグレーション

| ファイル | 内容 | 対応するマイグレーション |
|---|---|---|
| `attendance.sql` | 勤怠 / LINE打刻テーブル群 (attendance_policies 等) | `00009_attendance.sql` |
| `customer_feedback.sql` | お客様の声テーブル | `00002_plugin_tables.sql` |
| `daily_report.sql` | 日報テーブル (daily_reports) | `00002_plugin_tables.sql` |
| `expense.sql` | 経費テーブル (expenses) | `00002_plugin_tables.sql` |
| `inventory.sql` | 在庫管理テーブル (inventory_items) | `00002_plugin_tables.sql` |
| `notice.sql` | 連絡ノートテーブル (notices) | `00002_plugin_tables.sql` |
| `paid_leave.sql` | 有給残日数テーブル (paid_leaves) | `00002_plugin_tables.sql` |
| `fix_rls.sql` | RLS ヘルパー関数の CREATE OR REPLACE と全テーブルの RLS ポリシー再定義パッチ | `00015_fix_rls.sql` として取り込み済み |

---

## fix_rls.sql について（重要）

`fix_rls.sql` は、00001_schema.sql で定義された RLS ポリシーに無限再帰バグが見つかった際の修正パッチとして作成されたファイルです。

内容:
- `get_my_store_ids` / `get_my_managed_store_ids` / `get_my_staff_ids` の CREATE OR REPLACE
- store_staff, stores, profiles, time_records, store_plugins, plugin_permissions, checklists, check_records, shifts, shift_requests, shift_templates, store_invitations, reservations の全テーブルに対するポリシーの DROP & 再作成

このパッチは Supabase の SQL エディタで直接実行して対処した経緯があり、正式なマイグレーションとして番号付きファイルには落ちていません。

`00015_fix_rls.sql` として正式にマイグレーションへ取り込み済みです。

---

## seed データ

`seed.sql` は Supabase の慣例に従い `supabase/seed.sql` に移動済みです。
`supabase db reset` を実行すると、マイグレーション適用後に自動でシードデータが投入されます。
