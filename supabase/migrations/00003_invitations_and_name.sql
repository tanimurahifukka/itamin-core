-- スタッフ招待テーブル
create table if not exists public.store_invitations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  email text not null,
  role staff_role not null default 'staff',
  hourly_wage integer,
  invited_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(store_id, email)
);

alter table public.store_invitations enable row level security;

create policy "所属店舗の招待を読める"
  on public.store_invitations for select
  using (store_id in (select public.get_my_store_ids()));

create policy "manager以上が招待を作成できる"
  on public.store_invitations for insert
  with check (store_id in (select public.get_my_managed_store_ids()));

-- ユーザーログイン時に招待を自動処理するための関数
create or replace function public.process_invitations()
returns trigger as $$
declare
  inv record;
begin
  for inv in
    select * from public.store_invitations where email = new.email
  loop
    insert into public.store_staff (store_id, user_id, role, hourly_wage)
    values (inv.store_id, new.id, inv.role, inv.hourly_wage)
    on conflict (store_id, user_id) do nothing;

    delete from public.store_invitations where id = inv.id;
  end loop;
  return new;
end;
$$ language plpgsql security definer;

-- profileが作成されたら（=ユーザー登録時）招待を処理
create or replace trigger on_profile_created_process_invitations
  after insert on public.profiles
  for each row execute function public.process_invitations();
