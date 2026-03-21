-- ===== ITAMIN SHIFT: シフト管理プラグイン =====

-- 有効プラグイン管理テーブル
create table if not exists public.store_plugins (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  plugin_name text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique(store_id, plugin_name)
);

alter table public.store_plugins enable row level security;

create policy "所属店舗のプラグインを読める"
  on public.store_plugins for select
  using (store_id in (select public.get_my_store_ids()));

create policy "manager以上がプラグインを管理できる"
  on public.store_plugins for all
  using (store_id in (select public.get_my_managed_store_ids()));

-- シフトテーブル
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  staff_id uuid not null references public.store_staff(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  break_minutes integer not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id, staff_id, date)
);

alter table public.shifts enable row level security;

create policy "所属店舗のシフトを読める"
  on public.shifts for select
  using (store_id in (select public.get_my_store_ids()));

create policy "manager以上がシフトを管理できる"
  on public.shifts for all
  using (store_id in (select public.get_my_managed_store_ids()));

-- 自分のシフトはスタッフも追加可能（希望シフト）
create policy "自分のシフトを追加できる"
  on public.shifts for insert
  with check (
    staff_id in (select public.get_my_staff_ids())
  );

create index idx_shifts_store_date on public.shifts(store_id, date);
create index idx_shifts_staff on public.shifts(staff_id);
