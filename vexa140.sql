begin;
-- Private economy: all mutations are performed by authenticated, checked RPCs or server triggers.
create table if not exists public.vexa140_days(a uuid not null,b uuid not null,day date not null,a_sent boolean not null default false,b_sent boolean not null default false,primary key(a,b,day),check(a<b));
create table if not exists public.vexa140_streak_state(a uuid not null,b uuid not null,days integer not null default 0,best integer not null default 0,last_day date,primary key(a,b),check(a<b));
create table if not exists public.vexa140_wallet(user_id uuid primary key,balance integer not null default 0 check(balance>=0));
create table if not exists public.vexa140_ledger(id uuid primary key default gen_random_uuid(),user_id uuid not null,delta integer not null,reason text not null,unique_key text not null,created_at timestamptz not null default now(),unique(user_id,unique_key));
create table if not exists public.vexa140_catalog(id text primary key,title text not null,kind text not null check(kind in ('badge','theme','frame')),cost integer not null check(cost>0),description text not null);
insert into public.vexa140_catalog values ('badge-flame','Seri yıldızı','badge',50,'Profilde özel seri rozeti'),('badge-collector','Koleksiyoncu','badge',250,'Özel koleksiyon rozeti'),('theme-forest','Orman','theme',100,'Zümrüt sohbet arka planı'),('theme-cosmos','Kozmos','theme',180,'Kozmik sohbet arka planı'),('frame-neon','Zümrüt','frame',150,'Zümrüt profil çerçevesi'),('frame-cosmos','Kozmik','frame',300,'Mor profil çerçevesi') on conflict(id) do nothing;
create table if not exists public.vexa140_inventory(user_id uuid not null,item_id text not null references public.vexa140_catalog(id),equipped boolean not null default false,primary key(user_id,item_id));
create table if not exists public.vexa140_support(id uuid primary key default gen_random_uuid(),user_id uuid not null,subject text not null,body text not null,status text not null default 'open' check(status in ('open','closed')),reply text,created_at timestamptz not null default now());
do $$ declare t text;begin foreach t in array array['vexa140_days','vexa140_streak_state','vexa140_wallet','vexa140_ledger','vexa140_catalog','vexa140_inventory','vexa140_support'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);end loop;end $$;
create or replace function public.vexa140_award(p_user uuid,p_delta integer,p_reason text,p_key text) returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.vexa140_ledger(user_id,delta,reason,unique_key) values(p_user,p_delta,p_reason,p_key) on conflict(user_id,unique_key) do nothing;
 if found then insert into public.vexa140_wallet(user_id,balance) values(p_user,p_delta) on conflict(user_id) do update set balance=public.vexa140_wallet.balance+excluded.balance;end if;
end $$;
revoke all on function public.vexa140_award(uuid,integer,text,text) from public,anon,authenticated;
create or replace function public.vexa140_message_streak() returns trigger language plpgsql security definer set search_path='' as $$
declare a_id uuid; b_id uuid; d date; s public.vexa140_streak_state%rowtype; both_sent boolean; n integer; reward integer; k text;
begin
 if new.sender_id=new.recipient_id or new.deleted_at is not null then return new;end if;
 if not exists(select 1 from public.friend_requests f where f.status='accepted' and ((f.sender_id=new.sender_id and f.recipient_id=new.recipient_id) or (f.recipient_id=new.sender_id and f.sender_id=new.recipient_id))) then return new;end if;
 a_id:=least(new.sender_id,new.recipient_id);b_id:=greatest(new.sender_id,new.recipient_id);d:=(now() at time zone 'Europe/Istanbul')::date;
 insert into public.vexa140_streak_state(a,b) values(a_id,b_id) on conflict do nothing;
 select * into s from public.vexa140_streak_state where a=a_id and b=b_id for update;
 insert into public.vexa140_days(a,b,day,a_sent,b_sent) values(a_id,b_id,d,new.sender_id=a_id,new.sender_id=b_id) on conflict(a,b,day) do update set a_sent=public.vexa140_days.a_sent or excluded.a_sent,b_sent=public.vexa140_days.b_sent or excluded.b_sent returning a_sent and b_sent into both_sent;
 if not both_sent or s.last_day=d then return new;end if;
 n:=case when s.last_day=d-1 then s.days+1 else 1 end;
 update public.vexa140_streak_state set days=n,best=greatest(best,n),last_day=d where a=a_id and b=b_id;
 reward:=case n when 7 then 50 when 30 then 200 when 100 then 600 else 0 end;
 if reward>0 then k:='streak:'||a_id||':'||b_id||':'||n;perform public.vexa140_award(a_id,reward,n||' günlük seri',k);perform public.vexa140_award(b_id,reward,n||' günlük seri',k);end if;
 return new;
exception when others then raise warning 'vexa140 streak: %',sqlstate;return new;
end $;
revoke all on function public.vexa140_message_streak() from public,anon,authenticated;
drop trigger if exists vexa140_message_streak on public.messages;
create trigger vexa140_message_streak after insert on public.messages for each row execute function public.vexa140_message_streak();
create or replace function public.vexa140_streaks() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('peer_id',case when a=auth.uid() then b else a end,'days',case when last_day>=((now() at time zone 'Europe/Istanbul')::date-1) then days else 0 end,'best',best,'today',coalesce(last_day=(now() at time zone 'Europe/Istanbul')::date,false),'last_day',last_day) order by days desc),'[]'::jsonb) from public.vexa140_streak_state where auth.uid() in(a,b)
$$;
create or replace function public.vexa140_streak(p_peer uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select value from jsonb_array_elements(public.vexa140_streaks()) where value->>'peer_id'=p_peer::text limit 1),jsonb_build_object('peer_id',p_peer,'days',0,'best',0,'today',false,'last_day',null))
$$;
create or replace function public.vexa140_market() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('balance',coalesce((select balance from public.vexa140_wallet where user_id=auth.uid()),0),'items',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'title',c.title,'kind',c.kind,'cost',c.cost,'description',c.description,'owned',i.item_id is not null,'equipped',coalesce(i.equipped,false)) order by c.cost) from public.vexa140_catalog c left join public.vexa140_inventory i on i.item_id=c.id and i.user_id=auth.uid()),'[]'::jsonb),'history',coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at desc) from (select id,delta,reason,created_at from public.vexa140_ledger where user_id=auth.uid() order by created_at desc limit 30) l),'[]'::jsonb))
$$;
create or replace function public.vexa140_buy(p_item text) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); c public.vexa140_catalog%rowtype; bal integer;
begin
 if u is null then raise exception 'Giriş gerekli';end if;
 select * into c from public.vexa140_catalog where id=p_item;if not found then raise exception 'Ürün bulunamadı';end if;
 insert into public.vexa140_wallet(user_id) values(u) on conflict do nothing;
 select balance into bal from public.vexa140_wallet where user_id=u for update;
 if exists(select 1 from public.vexa140_inventory where user_id=u and item_id=p_item) then return;end if;
 if bal<c.cost then raise exception 'Yetersiz Vexa Puanı';end if;
 insert into public.vexa140_inventory(user_id,item_id) values(u,p_item);
 update public.vexa140_wallet set balance=balance-c.cost where user_id=u;
 insert into public.vexa140_ledger(user_id,delta,reason,unique_key) values(u,-c.cost,c.title,'buy:'||p_item);
end $$;
create or replace function public.vexa140_equip(p_item text) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); k text; was boolean;
begin
 if u is null then raise exception 'Giriş gerekli';end if;
 perform 1 from public.vexa140_wallet where user_id=u for update;
 select c.kind,i.equipped into k,was from public.vexa140_inventory i join public.vexa140_catalog c on c.id=i.item_id where i.user_id=u and i.item_id=p_item;
 if not found then raise exception 'Ürün sana ait değil';end if;
 update public.vexa140_inventory i set equipped=false from public.vexa140_catalog c where i.user_id=u and c.id=i.item_id and c.kind=k;
 if not was then update public.vexa140_inventory set equipped=true where user_id=u and item_id=p_item;end if;
end $$;
create or replace function public.vexa140_public_look(p_user uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(c.kind,c.id),'{}'::jsonb) from public.vexa140_inventory i join public.vexa140_catalog c on c.id=i.item_id where i.user_id=p_user and i.equipped and c.kind in ('badge','frame')
$$;
create or replace function public.vexa140_tickets(p_admin boolean default false) returns setof public.vexa140_support language plpgsql stable security definer set search_path='' as $$
begin if auth.uid() is null then raise exception 'Giriş gerekli';end if;
 if p_admin then if not exists(select 1 from public.vexa_founders f where f.user_id=auth.uid()) then raise exception 'Yetki yok';end if;return query select * from public.vexa140_support order by (status='open') desc,created_at desc limit 200;
 else return query select * from public.vexa140_support where user_id=auth.uid() order by created_at desc limit 100;end if;end $$;
create or replace function public.vexa140_ticket_create(p_subject text,p_body text) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();begin if u is null then raise exception 'Giriş gerekli';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,140));
 if length(trim(coalesce(p_subject,''))) not between 3 and 100 or length(trim(coalesce(p_body,''))) not between 10 and 2000 then raise exception 'Geçersiz talep';end if;
 if (select count(*) from public.vexa140_support where user_id=u and created_at>now()-interval '24 hours')>=5 then raise exception 'Günlük talep sınırı';end if;
 insert into public.vexa140_support(user_id,subject,body) values(u,trim(p_subject),trim(p_body));end $$;
create or replace function public.vexa140_ticket_reply(p_id uuid,p_reply text,p_close boolean) returns void language plpgsql security definer set search_path='' as $$
begin if not exists(select 1 from public.vexa_founders f where f.user_id=auth.uid()) then raise exception 'Yetki yok';end if;
 if length(trim(coalesce(p_reply,''))) not between 1 and 2000 then raise exception 'Yanıt gerekli';end if;
 update public.vexa140_support set reply=trim(p_reply),status=case when p_close then 'closed' else 'open' end where id=p_id and status='open';if not found then raise exception 'Açık talep bulunamadı';end if;end $$;
do $$ declare sig text;begin foreach sig in array array['vexa140_streaks()','vexa140_streak(uuid)','vexa140_market()','vexa140_buy(text)','vexa140_equip(text)','vexa140_public_look(uuid)','vexa140_tickets(boolean)','vexa140_ticket_create(text,text)','vexa140_ticket_reply(uuid,text,boolean)'] loop execute 'revoke all on function public.'||sig||' from public,anon';execute 'grant execute on function public.'||sig||' to authenticated';end loop;end $$;
-- Group replies and polls. Group message IDs are UUID in the current client; derive actual type dynamically.
do $ declare typ text;begin select format_type(a.atttypid,a.atttypmod) into typ from pg_attribute a where a.attrelid='public.vexa_group_messages'::regclass and a.attname='id';execute format('alter table public.vexa_group_messages add column if not exists reply_to %s',typ);end $;
create or replace function public.vexa140_validate_reply() returns trigger language plpgsql security definer set search_path='' as $ begin if new.reply_to is not null and not exists(select 1 from public.vexa_group_messages m where m.id=new.reply_to and m.group_id=new.group_id) then raise exception 'Yanıt aynı grupta olmalı';end if;return new;end $;
revoke all on function public.vexa140_validate_reply() from public,anon,authenticated;
drop trigger if exists vexa140_validate_reply on public.vexa_group_messages;
create trigger vexa140_validate_reply before insert or update of reply_to on public.vexa_group_messages for each row execute function public.vexa140_validate_reply();
create table if not exists public.vexa140_polls(id uuid primary key default gen_random_uuid(),group_id uuid not null references public.vexa_groups(id) on delete cascade,creator uuid not null,question text not null,options text[] not null,closed boolean not null default false,created_at timestamptz default now());
create table if not exists public.vexa140_votes(poll_id uuid references public.vexa140_polls(id) on delete cascade,user_id uuid not null,choice integer not null,primary key(poll_id,user_id));
alter table public.vexa140_polls enable row level security;alter table public.vexa140_votes enable row level security;
revoke all on public.vexa140_polls,public.vexa140_votes from public,anon,authenticated;
create or replace function public.vexa140_group_member(p_group uuid) returns boolean language sql stable security definer set search_path='' as $ select exists(select 1 from public.vexa_group_members where group_id=p_group and user_id=auth.uid()) $;
revoke all on function public.vexa140_group_member(uuid) from public,anon,authenticated;
create or replace function public.vexa140_polls(p_group uuid) returns jsonb language plpgsql stable security definer set search_path='' as $ begin
 if not public.vexa140_group_member(p_group) then raise exception 'Üyelik gerekli';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'question',p.question,'options',p.options,'closed',p.closed,'creator',p.creator,'mine',(select choice from public.vexa140_votes where poll_id=p.id and user_id=auth.uid()),'counts',(select jsonb_agg((select count(*) from public.vexa140_votes v where v.poll_id=p.id and v.choice=x) order by x) from generate_series(0,cardinality(p.options)-1) x)) order by p.created_at desc) from (select * from public.vexa140_polls where group_id=p_group order by created_at desc limit 30) p),'[]'::jsonb);end $;
create or replace function public.vexa140_poll_create(p_group uuid,p_question text,p_options text[]) returns void language plpgsql security definer set search_path='' as $ begin
 if not public.vexa140_group_member(p_group) then raise exception 'Üyelik gerekli';end if;
 if length(trim(coalesce(p_question,''))) not between 3 and 150 or coalesce(cardinality(p_options),0) not between 2 and 6 or exists(select 1 from unnest(p_options) x where x is null or length(trim(x)) not between 1 and 80) or (select count(distinct lower(trim(x))) from unnest(p_options) x)<>cardinality(p_options) then raise exception 'Geçersiz anket';end if;
 if (select count(*) from public.vexa140_polls where creator=auth.uid() and created_at>now()-interval '1 hour')>=10 then raise exception 'Anket sınırı';end if;
 insert into public.vexa140_polls(group_id,creator,question,options) values(p_group,auth.uid(),trim(p_question),p_options);end $;
create or replace function public.vexa140_poll_vote(p_poll uuid,p_choice integer) returns void language plpgsql security definer set search_path='' as $ declare p public.vexa140_polls%rowtype;begin
 select * into p from public.vexa140_polls where id=p_poll for update;if not found or not public.vexa140_group_member(p.group_id) or p.closed or p_choice is null or p_choice<0 or p_choice>=cardinality(p.options) then raise exception 'Oy kullanılamaz';end if;
 insert into public.vexa140_votes(poll_id,user_id,choice) values(p_poll,auth.uid(),p_choice) on conflict(poll_id,user_id) do update set choice=excluded.choice;end $;
create or replace function public.vexa140_poll_close(p_poll uuid) returns void language plpgsql security definer set search_path='' as $ begin update public.vexa140_polls set closed=true where id=p_poll and creator=auth.uid() and public.vexa140_group_member(group_id);if not found then raise exception 'Yetki yok';end if;end $;
do $ declare sig text;begin foreach sig in array array['vexa140_polls(uuid)','vexa140_poll_create(uuid,text,text[])','vexa140_poll_vote(uuid,integer)','vexa140_poll_close(uuid)'] loop execute 'revoke all on function public.'||sig||' from public,anon';execute 'grant execute on function public.'||sig||' to authenticated';end loop;end $;
-- Private group media. Only current group members can read; only uploader can write/delete.
alter table public.vexa_group_messages add column if not exists media_path text;
alter table public.vexa_group_messages add column if not exists media_type text;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('vexa-group-media140','vexa-group-media140',false,26214400,array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','audio/webm','audio/mp4','audio/ogg','audio/mpeg','audio/wav','application/pdf']) on conflict(id) do nothing;
create or replace function public.vexa140_group_media_access(p_path text,p_write boolean) returns boolean language sql stable security definer set search_path='' as $
 select auth.uid() is not null and exists(select 1 from public.vexa_group_members m where m.group_id::text=split_part(p_path,'/',1) and m.user_id=auth.uid()) and (not p_write or split_part(p_path,'/',2)=auth.uid()::text)
$;
revoke all on function public.vexa140_group_media_access(text,boolean) from public,anon;
grant execute on function public.vexa140_group_media_access(text,boolean) to authenticated;
drop policy if exists vexa140_media_read on storage.objects;
create policy vexa140_media_read on storage.objects for select to authenticated using(bucket_id='vexa-group-media140' and public.vexa140_group_media_access(name,false));
drop policy if exists vexa140_media_insert on storage.objects;
create policy vexa140_media_insert on storage.objects for insert to authenticated with check(bucket_id='vexa-group-media140' and public.vexa140_group_media_access(name,true));
drop policy if exists vexa140_media_delete on storage.objects;
create policy vexa140_media_delete on storage.objects for delete to authenticated using(bucket_id='vexa-group-media140' and public.vexa140_group_media_access(name,true));
create or replace function public.vexa140_validate_group_media() returns trigger language plpgsql security definer set search_path='' as $
begin if new.media_path is not null then
 if split_part(new.media_path,'/',1)<>new.group_id::text or split_part(new.media_path,'/',2)<>new.sender_id::text or new.media_type is null or new.media_type not in ('image','video','audio','document') then raise exception 'Geçersiz grup medyası';end if;
 end if;return new;end $;
revoke all on function public.vexa140_validate_group_media() from public,anon,authenticated;
drop trigger if exists vexa140_validate_group_media on public.vexa_group_messages;
create trigger vexa140_validate_group_media before insert or update of media_path,media_type on public.vexa_group_messages for each row execute function public.vexa140_validate_group_media();
commit;
