-- store_staff の RLS ポリシーが自己参照で無限再帰になる問題を修正
-- セキュリティ定義関数でRLSをバイパスして所属店舗IDを取得する

-- ユーザーの所属店舗IDを返すヘルパー関数（security definer でRLSバイパス）
create or replace function public.get_my_store_ids()
returns setof uuid as $$
  select store_id from public.store_staff where user_id = auth.uid()
$$ language sql security definer stable;

-- ユーザーがowner/managerの店舗IDを返すヘルパー関数
create or replace function public.get_my_managed_store_ids()
returns setof uuid as $$
  select store_id from public.store_staff
  where user_id = auth.uid() and role in ('owner', 'manager')
$$ language sql security definer stable;

-- ユーザーのstore_staff IDを返すヘルパー関数
create or replace function public.get_my_staff_ids()
returns setof uuid as $$
  select id from public.store_staff where user_id = auth.uid()
$$ language sql security definer stable;

-- ===== store_staff ポリシー修正 =====
drop policy "所属店舗のスタッフを読める" on public.store_staff;
create policy "所属店舗のスタッフを読める"
  on public.store_staff for select
  using (
    user_id = auth.uid()
    or store_id in (select public.get_my_store_ids())
  );

drop policy "スタッフを追加できる" on public.store_staff;
create policy "スタッフを追加できる"
  on public.store_staff for insert
  with check (
    store_id in (select public.get_my_managed_store_ids())
    or user_id = auth.uid()
  );

-- ===== stores ポリシー修正 =====
drop policy "所属店舗を読める" on public.stores;
create policy "所属店舗を読める"
  on public.stores for select
  using (
    id in (select public.get_my_store_ids())
  );

-- ===== time_records ポリシー修正 =====
drop policy "所属店舗のタイムカードを読める" on public.time_records;
create policy "所属店舗のタイムカードを読める"
  on public.time_records for select
  using (
    store_id in (select public.get_my_store_ids())
  );

drop policy "自分の打刻を作成できる" on public.time_records;
create policy "自分の打刻を作成できる"
  on public.time_records for insert
  with check (
    staff_id in (select public.get_my_staff_ids())
  );

drop policy "自分の打刻を更新できる" on public.time_records;
create policy "自分の打刻を更新できる"
  on public.time_records for update
  using (
    staff_id in (select public.get_my_staff_ids())
  );

-- ===== checklists ポリシー修正 =====
drop policy "所属店舗のチェックリストを読める" on public.checklists;
create policy "所属店舗のチェックリストを読める"
  on public.checklists for select
  using (
    store_id in (select public.get_my_store_ids())
  );

drop policy "owner/managerがチェックリストを更新できる" on public.checklists;
create policy "owner/managerがチェックリストを更新できる"
  on public.checklists for all
  using (
    store_id in (select public.get_my_managed_store_ids())
  );

-- ===== check_records ポリシー修正 =====
drop policy "所属店舗のチェック記録を読める" on public.check_records;
create policy "所属店舗のチェック記録を読める"
  on public.check_records for select
  using (
    store_id in (select public.get_my_store_ids())
  );
