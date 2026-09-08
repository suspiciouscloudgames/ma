create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.admin_settings (
  id boolean primary key default true check (id),
  password_hash text not null
);
insert into private.admin_settings (id, password_hash)
values (true, extensions.crypt('0000', extensions.gen_salt('bf')))
on conflict (id) do nothing;

create table if not exists public.exhibit_state (
  id boolean primary key default true check (id),
  display_mode text not null default 'none' check (display_mode in ('none','photos','play')),
  questions_enabled boolean not null default false,
  locale text not null default 'ko' check (locale in ('ko','ja')),
  version bigint not null default (extract(epoch from clock_timestamp()) * 1000)::bigint
);
insert into public.exhibit_state (id) values (true) on conflict (id) do nothing;

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique check (storage_path like 'photos/%'),
  thumbnail_path text not null unique check (thumbnail_path like 'thumbnails/%'),
  created_at timestamptz not null default now(),
  x double precision,
  y double precision,
  z integer
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  text text not null check (length(btrim(text)) between 1 and 50000),
  participant_id uuid not null,
  created_at timestamptz not null default now(),
  x double precision,
  y double precision,
  z integer
);

create table if not exists public.responses (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  photo_id uuid not null references public.photos(id) on delete cascade,
  text text not null check (length(btrim(text)) between 1 and 50000),
  participant_id uuid not null,
  created_at timestamptz not null default now(),
  x double precision,
  y double precision,
  z integer
);

alter table public.exhibit_state enable row level security;
alter table public.photos enable row level security;
alter table public.questions enable row level security;
alter table public.responses enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.exhibit_state, public.photos, public.questions, public.responses to anon, authenticated;
grant insert on public.photos, public.questions, public.responses to anon, authenticated;

drop policy if exists "public read exhibit state" on public.exhibit_state;
create policy "public read exhibit state" on public.exhibit_state for select to anon, authenticated using (true);
drop policy if exists "public read photos" on public.photos;
create policy "public read photos" on public.photos for select to anon, authenticated using (true);
drop policy if exists "public add photos" on public.photos;
create policy "public add photos" on public.photos for insert to anon, authenticated with check (true);
drop policy if exists "public read questions" on public.questions;
create policy "public read questions" on public.questions for select to anon, authenticated using (true);
drop policy if exists "public add questions" on public.questions;
create policy "public add questions" on public.questions for insert to anon, authenticated with check (true);
drop policy if exists "public read responses" on public.responses;
create policy "public read responses" on public.responses for select to anon, authenticated using (true);
drop policy if exists "public add responses" on public.responses;
create policy "public add responses" on public.responses for insert to anon, authenticated with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('workshop-photos', 'workshop-photos', true, 10485760, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public view workshop photos" on storage.objects;
create policy "public view workshop photos" on storage.objects for select to anon, authenticated
using (bucket_id = 'workshop-photos');
drop policy if exists "public upload workshop photos" on storage.objects;
create policy "public upload workshop photos" on storage.objects for insert to anon, authenticated
with check (bucket_id = 'workshop-photos' and (storage.foldername(name))[1] in ('photos','thumbnails'));

create or replace function private.is_admin(candidate text) returns boolean
language sql stable security definer set search_path = private, public
as $$ select exists(select 1 from private.admin_settings where id and password_hash = extensions.crypt(candidate, password_hash)); $$;
revoke all on function private.is_admin(text) from public, anon, authenticated;

drop policy if exists "admin delete workshop photos" on storage.objects;
create policy "admin delete workshop photos" on storage.objects for delete to anon, authenticated
using (
  bucket_id = 'workshop-photos'
  and private.is_admin((current_setting('request.headers', true)::jsonb ->> 'x-admin-key'))
);

create or replace function public.admin_set_state(
  admin_key text, next_display_mode text, next_questions_enabled boolean, next_locale text
) returns public.exhibit_state
language plpgsql security definer set search_path = public, private
as $$
declare result public.exhibit_state;
begin
  if not private.is_admin(admin_key) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.exhibit_state set
    display_mode = next_display_mode,
    questions_enabled = next_questions_enabled,
    locale = next_locale,
    version = (extract(epoch from clock_timestamp()) * 1000)::bigint
  where id returning * into result;
  return result;
end $$;

create or replace function public.admin_move_item(
  admin_key text, item_kind text, item_id uuid, next_x double precision, next_y double precision, next_z integer
) returns void
language plpgsql security definer set search_path = public, private
as $$
begin
  if not private.is_admin(admin_key) then raise exception 'forbidden' using errcode = '42501'; end if;
  if item_kind = 'photo' then update public.photos set x=next_x,y=next_y,z=next_z where id=item_id;
  elsif item_kind = 'question' then update public.questions set x=next_x,y=next_y,z=next_z where id=item_id;
  elsif item_kind = 'response' then update public.responses set x=next_x,y=next_y,z=next_z where id=item_id;
  else raise exception 'invalid item kind'; end if;
end $$;

create or replace function public.admin_delete_item(admin_key text, item_kind text, item_id uuid) returns jsonb
language plpgsql security definer set search_path = public, private
as $$
declare result jsonb := '{}'::jsonb;
begin
  if not private.is_admin(admin_key) then raise exception 'forbidden' using errcode = '42501'; end if;
  if item_kind = 'photo' then
    select jsonb_build_object('storage_path',storage_path,'thumbnail_path',thumbnail_path) into result from public.photos where id=item_id;
    delete from public.photos where id=item_id;
  elsif item_kind = 'question' then delete from public.questions where id=item_id;
  elsif item_kind = 'response' then delete from public.responses where id=item_id;
  else raise exception 'invalid item kind'; end if;
  return coalesce(result, '{}'::jsonb);
end $$;

grant execute on function public.admin_set_state(text,text,boolean,text) to anon, authenticated;
grant execute on function public.admin_move_item(text,text,uuid,double precision,double precision,integer) to anon, authenticated;
grant execute on function public.admin_delete_item(text,text,uuid) to anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='exhibit_state') then alter publication supabase_realtime add table public.exhibit_state; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='photos') then alter publication supabase_realtime add table public.photos; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='questions') then alter publication supabase_realtime add table public.questions; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='responses') then alter publication supabase_realtime add table public.responses; end if;
end $$;
