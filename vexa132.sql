begin;
alter table public.vexa130_live add column if not exists image_url text;
commit;
