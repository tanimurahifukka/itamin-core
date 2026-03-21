-- 招待テーブルに名前カラム追加
alter table public.store_invitations add column if not exists name text;

-- 招待処理関数を更新（名前も反映）
create or replace function public.process_invitations()
returns trigger as $$
declare
  inv record;
begin
  for inv in
    select * from public.store_invitations where email = new.email
  loop
    -- 招待時に指定された名前があればプロフィールを更新
    if inv.name is not null and inv.name != '' then
      update public.profiles set name = inv.name where id = new.id;
    end if;

    insert into public.store_staff (store_id, user_id, role, hourly_wage)
    values (inv.store_id, new.id, inv.role, inv.hourly_wage)
    on conflict (store_id, user_id) do nothing;

    delete from public.store_invitations where id = inv.id;
  end loop;
  return new;
end;
$$ language plpgsql security definer;
