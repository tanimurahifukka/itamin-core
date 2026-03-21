-- ITAMIN CORE + CHECK 初期スキーマ
-- Supabase (PostgreSQL) 用

-- ===== ユーザープロフィール =====
-- Supabase Auth の auth.users と連携
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  picture text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "自分のプロフィールを読める"
  on public.profiles for select
  using (auth.uid() = id);

create policy "自分のプロフィールを更新できる"
  on public.profiles for update
  using (auth.uid() = id);

-- 新規ユーザー作成時に自動でprofileを作る
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, name, picture)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===== 店舗 =====
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  owner_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.stores enable row level security;

-- ===== 店舗スタッフ =====
create type staff_role as enum ('owner', 'manager', 'staff');

create table if not exists public.store_staff (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role staff_role not null default 'staff',
  hourly_wage integer,
  joined_at timestamptz not null default now(),
  unique(store_id, user_id)
);

alter table public.store_staff enable row level security;

-- 自分が所属する店舗のスタッフ情報を読める
create policy "所属店舗のスタッフを読める"
  on public.store_staff for select
  using (
    user_id = auth.uid()
    or store_id in (
      select store_id from public.store_staff where user_id = auth.uid()
    )
  );

-- 店舗の所属メンバーなら店舗情報を読める
create policy "所属店舗を読める"
  on public.stores for select
  using (
    id in (select store_id from public.store_staff where user_id = auth.uid())
  );

-- オーナーなら店舗を作成できる
create policy "店舗を作成できる"
  on public.stores for insert
  with check (owner_id = auth.uid());

-- owner/managerならスタッフを追加できる
create policy "スタッフを追加できる"
  on public.store_staff for insert
  with check (
    store_id in (
      select store_id from public.store_staff
      where user_id = auth.uid() and role in ('owner', 'manager')
    )
    or user_id = auth.uid() -- 自分自身（店舗作成時のオーナー登録）
  );

-- ===== タイムカード =====
create table if not exists public.time_records (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  staff_id uuid not null references public.store_staff(id) on delete cascade,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  break_minutes integer not null default 0,
  note text,
  created_at timestamptz not null default now()
);

alter table public.time_records enable row level security;

create policy "所属店舗のタイムカードを読める"
  on public.time_records for select
  using (
    store_id in (select store_id from public.store_staff where user_id = auth.uid())
  );

create policy "自分の打刻を作成できる"
  on public.time_records for insert
  with check (
    staff_id in (select id from public.store_staff where user_id = auth.uid())
  );

create policy "自分の打刻を更新できる"
  on public.time_records for update
  using (
    staff_id in (select id from public.store_staff where user_id = auth.uid())
  );

-- ===== ITAMIN CHECK: チェックリスト =====
create type check_timing as enum ('clock_in', 'clock_out');

create table if not exists public.checklists (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  timing check_timing not null,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id, timing)
);

alter table public.checklists enable row level security;

create policy "所属店舗のチェックリストを読める"
  on public.checklists for select
  using (
    store_id in (select store_id from public.store_staff where user_id = auth.uid())
  );

create policy "owner/managerがチェックリストを更新できる"
  on public.checklists for all
  using (
    store_id in (
      select store_id from public.store_staff
      where user_id = auth.uid() and role in ('owner', 'manager')
    )
  );

-- ===== ITAMIN CHECK: チェック記録 =====
create table if not exists public.check_records (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  staff_id uuid not null references public.store_staff(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  timing check_timing not null,
  results jsonb not null default '[]'::jsonb,
  all_checked boolean not null default false,
  checked_at timestamptz not null default now()
);

alter table public.check_records enable row level security;

create policy "所属店舗のチェック記録を読める"
  on public.check_records for select
  using (
    store_id in (select store_id from public.store_staff where user_id = auth.uid())
  );

create policy "自分のチェック記録を作成できる"
  on public.check_records for insert
  with check (
    user_id = auth.uid()
  );

-- ===== インデックス =====
create index idx_store_staff_user on public.store_staff(user_id);
create index idx_store_staff_store on public.store_staff(store_id);
create index idx_time_records_store_date on public.time_records(store_id, clock_in);
create index idx_time_records_staff on public.time_records(staff_id);
create index idx_check_records_store_date on public.check_records(store_id, checked_at);
