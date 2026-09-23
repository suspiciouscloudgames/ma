-- Additive migration: original text, photos and layout are untouched.
begin;
alter table public.questions add column if not exists translation_en text;
alter table public.questions add column if not exists translation_ko text;
alter table public.responses add column if not exists translation_en text;
alter table public.responses add column if not exists translation_ko text;
-- Participants may write originals, never server-produced translations.
revoke insert on public.questions,public.responses from anon,authenticated;
grant insert(id,text,participant_id,created_at,x,y,z) on public.questions to anon,authenticated;
grant insert(id,question_id,photo_id,text,participant_id,created_at,x,y,z) on public.responses to anon,authenticated;
create table if not exists private.translation_jobs(
 id uuid primary key default gen_random_uuid(),
 question_id uuid unique references public.questions(id) on delete cascade,
 response_id uuid unique references public.responses(id) on delete cascade,
 state text not null default 'pending', attempts integer not null default 0,
 next_at timestamptz not null default now(), lease uuid,
 created_at timestamptz not null default now(), error_code text,
 check ((question_id is null) <> (response_id is null))
);
create table if not exists private.translation_budget(day date primary key, calls integer not null default 0, characters integer not null default 0);
revoke all on private.translation_jobs,private.translation_budget from public,anon,authenticated;
create or replace function private.queue_translation() returns trigger
language plpgsql security definer set search_path=public,private as $$
begin
 if tg_table_name='questions' then
  insert into private.translation_jobs(question_id) values(new.id) on conflict(question_id) do update set state='pending',attempts=0,next_at=now(),lease=null;
 else
  insert into private.translation_jobs(response_id) values(new.id) on conflict(response_id) do update set state='pending',attempts=0,next_at=now(),lease=null;
 end if;
 return new;
end $$;
create trigger questions_translation_queue after insert or update of text on public.questions for each row execute function private.queue_translation();
create trigger responses_translation_queue after insert or update of text on public.responses for each row execute function private.queue_translation();
insert into private.translation_jobs(question_id) select id from public.questions on conflict do nothing;
insert into private.translation_jobs(response_id) select id from public.responses on conflict do nothing;

create or replace function public.claim_workshop_translation() returns jsonb
language plpgsql security definer set search_path=public,private as $$
declare job private.translation_jobs; original text; token uuid; budget private.translation_budget;
begin
 -- Serialize budget and lease allocation across all screens/participants.
 perform pg_advisory_xact_lock(38271054);
 perform 1 from public.exhibit_state where id and not workshop_closed for share;
 if not found then return null;end if;
 if (select count(*) from private.translation_jobs where state='working' and next_at>now())>=3 then return null;end if;
 select * into job from private.translation_jobs where state in ('pending','working') and next_at<=now() and attempts<5 order by created_at,id limit 1 for update skip locked;
 if not found then return null;end if;
 if job.question_id is not null then select text into original from public.questions where id=job.question_id;
 else select text into original from public.responses where id=job.response_id;end if;
 insert into private.translation_budget(day) values(current_date) on conflict do nothing;
 select * into budget from private.translation_budget where day=current_date for update;
 if budget.calls>=1000 or budget.characters+length(original)>500000 then return null;end if;
 update private.translation_budget set calls=calls+1,characters=characters+length(original) where day=current_date;
 token=gen_random_uuid();
 update private.translation_jobs set state='working',attempts=attempts+1,lease=token,next_at=now()+interval '3 minutes' where id=job.id;
 return jsonb_build_object('id',job.id,'lease',token,'text',original);
end $$;

create or replace function public.finish_workshop_translation(job_id uuid,lease_id uuid,english text,korean text,turkish boolean) returns boolean
language plpgsql security definer set search_path=public,private as $$
declare job private.translation_jobs;
begin
 -- Once archive capture starts no translation may change its snapshot.
 perform 1 from public.exhibit_state where id and not workshop_closed for share;
 if not found then return false;end if;
 select * into job from private.translation_jobs where id=job_id and lease=lease_id and state='working' for update;
 if not found then return false;end if;
 if turkish then
  if length(btrim(english)) not between 1 and 100000 or length(btrim(korean)) not between 1 and 100000 or english is null or korean is null then raise exception 'invalid_translation';end if;
  if job.question_id is not null then update public.questions set translation_en=english,translation_ko=korean where id=job.question_id;
  else update public.responses set translation_en=english,translation_ko=korean where id=job.response_id;end if;
 end if;
 update private.translation_jobs set state=case when turkish then 'done' else 'skipped' end,lease=null,error_code=null where id=job_id;
 return true;
end $$;

create or replace function public.fail_workshop_translation(job_id uuid,lease_id uuid,failure_code text) returns void
language plpgsql security definer set search_path=private as $$
begin
 update private.translation_jobs set state=case when attempts>=5 then 'failed' else 'pending' end,
 next_at=now()+make_interval(secs=>case when failure_code in ('credit_balance_exhausted','insufficient_quota','invalid_api_key') then 3600 else least(900,30*power(2,attempts)::integer) end),
 lease=null,error_code=left(failure_code,80) where id=job_id and lease=lease_id and state='working';
end $$;
revoke all on function public.claim_workshop_translation(),public.finish_workshop_translation(uuid,uuid,text,text,boolean),public.fail_workshop_translation(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_workshop_translation(),public.finish_workshop_translation(uuid,uuid,text,text,boolean),public.fail_workshop_translation(uuid,uuid,text) to service_role;
create or replace function public.check_translation_admin(admin_key text) returns boolean language sql security definer set search_path=private as $$select private.is_admin(admin_key);$$;
revoke all on function public.check_translation_admin(text) from public,anon,authenticated;
grant execute on function public.check_translation_admin(text) to service_role;
commit;
