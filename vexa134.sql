-- Vexa 13.4 group roster + server-generated membership events.
begin;
create or replace function public.vexa134_group_roster(p_group_id uuid)
returns table(user_id uuid,role text,display_name text,username text,avatar_path text)
language plpgsql security definer set search_path='' stable as $$
begin
 if auth.uid() is null or not exists(select 1 from public.vexa_group_members m where m.group_id=p_group_id and m.user_id=auth.uid()) then
  raise exception 'Grup üyeliği gerekli';
 end if;
 return query select m.user_id,m.role::text,p.display_name::text,p.username::text,p.avatar_path::text
 from public.vexa_group_members m left join public.profiles p on p.id=m.user_id where m.group_id=p_group_id;
end $$;
revoke all on function public.vexa134_group_roster(uuid) from public,anon;
grant execute on function public.vexa134_group_roster(uuid) to authenticated;
create table if not exists public.vexa134_group_events(
 id uuid primary key default gen_random_uuid(),
 group_id uuid not null references public.vexa_groups(id) on delete cascade,
 body text not null,
 created_at timestamptz not null default now()
);
alter table public.vexa134_group_events enable row level security;
revoke all on public.vexa134_group_events from anon,authenticated;
grant select on public.vexa134_group_events to authenticated;
create or replace function public.vexa134_is_member(p_group_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.vexa_group_members m where m.group_id=p_group_id and m.user_id=auth.uid())
$$;
revoke all on function public.vexa134_is_member(uuid) from public,anon;
grant execute on function public.vexa134_is_member(uuid) to authenticated;
drop policy if exists vexa134_read_events on public.vexa134_group_events;
create policy vexa134_read_events on public.vexa134_group_events for select to authenticated using(public.vexa134_is_member(group_id));
create index if not exists vexa134_events_group_created on public.vexa134_group_events(group_id,created_at desc);
create or replace function public.vexa134_member_event()
returns trigger language plpgsql security definer set search_path='' as $$
declare gid uuid; uid uuid; label text; actor text; message text;
begin
 if tg_op='DELETE' then gid:=old.group_id;uid:=old.user_id;else gid:=new.group_id;uid:=new.user_id;end if;
 if not exists(select 1 from public.vexa_groups g where g.id=gid) then return null;end if;
 select coalesce(nullif(trim(p.display_name),''),nullif(p.username,''),'Bir kullanıcı') into label from public.profiles p where p.id=uid;
 label:=coalesce(label,'Bir kullanıcı');
 if tg_op='INSERT' then message:=label||' gruba katıldı.';
 elsif tg_op='DELETE' then
  if auth.uid()=uid then message:=label||' gruptan ayrıldı.';else message:=label||' gruptan çıkarıldı.';end if;
 elsif old.role is distinct from new.role then message:=label||case when new.role::text='admin' then ' yönetici oldu.' else ' yönetici yetkisi kaldırıldı.' end;
 else return null;end if;
 insert into public.vexa134_group_events(group_id,body) values(gid,message);
 return null;
end $$;
revoke all on function public.vexa134_member_event() from public,anon,authenticated;
drop trigger if exists vexa134_member_event on public.vexa_group_members;
create trigger vexa134_member_event after insert or update or delete on public.vexa_group_members for each row execute function public.vexa134_member_event();
do $$ declare t text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
 foreach t in array array['vexa_groups','vexa_group_members','vexa_group_messages','vexa134_group_events'] loop
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
 execute format('alter publication supabase_realtime add table public.%I',t);
 end if;end loop;end if;
end $$;
commit;
