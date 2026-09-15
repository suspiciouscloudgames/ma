-- Safe workshop shutdown. Apply once before deploying the end button.
begin;
alter table public.exhibit_state add column if not exists workshop_closed boolean not null default false;

create or replace function private.workshop_accepts_uploads() returns boolean
language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.exhibit_state where id and not workshop_closed); $$;
revoke all on function private.workshop_accepts_uploads() from public;
grant execute on function private.workshop_accepts_uploads() to anon,authenticated;

drop policy if exists "public add photos" on public.photos;
create policy "public add photos" on public.photos for insert to anon,authenticated with check(private.workshop_accepts_uploads());
drop policy if exists "public add questions" on public.questions;
create policy "public add questions" on public.questions for insert to anon,authenticated with check(private.workshop_accepts_uploads());
drop policy if exists "public add responses" on public.responses;
create policy "public add responses" on public.responses for insert to anon,authenticated with check(private.workshop_accepts_uploads());
drop policy if exists "public upload workshop photos" on storage.objects;
create policy "public upload workshop photos" on storage.objects for insert to anon,authenticated
with check(bucket_id='workshop-photos' and (storage.foldername(name))[1] in ('photos','thumbnails') and private.workshop_accepts_uploads());

create or replace function public.admin_set_state(admin_key text,next_display_mode text,next_questions_enabled boolean,next_locale text)
returns public.exhibit_state language plpgsql security definer set search_path=public,private as $$
declare result public.exhibit_state;
begin
 if not private.is_admin(admin_key) then raise exception 'forbidden' using errcode='42501';end if;
 update public.exhibit_state set display_mode=next_display_mode,questions_enabled=next_questions_enabled,locale=next_locale,
 workshop_closed=case when next_display_mode<>'none' or next_questions_enabled then false else workshop_closed end,
 version=(extract(epoch from clock_timestamp())*1000)::bigint where id returning * into result;
 return result;
end $$;

create or replace function public.admin_begin_workshop_end(admin_key text) returns public.exhibit_state
language plpgsql security definer set search_path=public,private as $$
declare result public.exhibit_state;
begin
 if not private.is_admin(admin_key) then raise exception 'forbidden' using errcode='42501';end if;
 update public.exhibit_state set workshop_closed=true,questions_enabled=false,
 version=(extract(epoch from clock_timestamp())*1000)::bigint where id returning * into result;
 return result;
end $$;

create or replace function public.admin_finalize_workshop_end(admin_key text,backup jsonb) returns jsonb
language plpgsql security definer set search_path=public,private,storage as $$
declare tab text; actual jsonb; expected jsonb; paths jsonb;
begin
 if not private.is_admin(admin_key) then raise exception 'forbidden' using errcode='42501';end if;
 -- Compare and delete in one transaction; concurrent inserts/edits cannot slip
 -- between a client-side verification and cascading deletes.
 lock table public.exhibit_state,public.photos,public.questions,public.responses,storage.objects in share row exclusive mode;
 if not exists(select 1 from public.exhibit_state where id and workshop_closed) then raise exception 'workshop_not_closed';end if;
 foreach tab in array array['photos','questions','responses'] loop
   if jsonb_typeof(backup->tab) is distinct from 'array' then raise exception 'invalid_backup';end if;
   execute format('select coalesce(jsonb_agg(to_jsonb(t) order by id),''[]''::jsonb) from public.%I t',tab) into actual;
   select coalesce(jsonb_agg(v order by v->>'id'),'[]'::jsonb) into expected from jsonb_array_elements(backup->tab) v;
   if actual<>expected then raise exception 'backup_changed';end if;
 end loop;
 if jsonb_typeof(backup->'storage') is distinct from 'array' then raise exception 'invalid_backup';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name),'[]'::jsonb) into actual from storage.objects where bucket_id='workshop-photos';
 select coalesce(jsonb_agg(v order by v->>'name'),'[]'::jsonb) into expected from jsonb_array_elements(backup->'storage') v;
 if actual<>expected then raise exception 'backup_changed';end if;
 paths=actual;
 delete from public.responses;delete from public.photos;delete from public.questions;
 update public.exhibit_state set display_mode='none',questions_enabled=false,version=(extract(epoch from clock_timestamp())*1000)::bigint where id;
 return jsonb_build_object('storage',paths);
end $$;
revoke all on function public.admin_begin_workshop_end(text) from public;
revoke all on function public.admin_finalize_workshop_end(text,jsonb) from public;
grant execute on function public.admin_begin_workshop_end(text),public.admin_finalize_workshop_end(text,jsonb) to anon,authenticated;
commit;
