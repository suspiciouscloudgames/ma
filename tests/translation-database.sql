-- OPTIONAL, NOT EXECUTED: safety review blocked this broader production test.
-- Requires explicit approval before running as postgres; prefer isolated DB.
-- All synthetic rows and state changes are intended to roll back.
begin;
update public.exhibit_state set workshop_closed=false where id;
update private.translation_jobs set state='done';
insert into private.translation_budget(day) values(current_date) on conflict(day) do update set calls=0,characters=0;
set local role anon;
insert into public.questions(id,text,participant_id) values('11111111-1111-4111-8111-000000000001','Bu bir test mi?','11111111-1111-4111-8111-000000000002');
insert into public.photos(id,storage_path,thumbnail_path) values('11111111-1111-4111-8111-000000000003','photos/translation-rollback-only.jpg','thumbnails/translation-rollback-only.jpg');
insert into public.responses(id,question_id,photo_id,text,participant_id) values('11111111-1111-4111-8111-000000000004','11111111-1111-4111-8111-000000000001','11111111-1111-4111-8111-000000000003','Bana denizi hatırlatıyor.','11111111-1111-4111-8111-000000000002');
reset role;
insert into public.questions(text,participant_id) select 'Deneme sorusu '||n,gen_random_uuid() from generate_series(1,30) n;
do $$declare j jsonb; n integer=0; begin
 loop
  j=public.claim_workshop_translation();exit when j is null;
  if not public.finish_workshop_translation((j->>'id')::uuid,(j->>'lease')::uuid,'Test translation','시험 번역',true) then raise exception 'save failed';end if;
  n=n+1;
 end loop;
 if n<>32 then raise exception 'wrong processed count: %',n;end if;
 if (select translation_ko from public.responses where id='11111111-1111-4111-8111-000000000004')<>'시험 번역' then raise exception 'response missing';end if;
 if (select text from public.responses where id='11111111-1111-4111-8111-000000000004')<>'Bana denizi hatırlatıyor.' then raise exception 'original changed';end if;
 if has_function_privilege('anon','public.claim_workshop_translation()','execute') or has_column_privilege('anon','public.responses','translation_ko','insert') then raise exception 'public translation write allowed';end if;
end $$;
select 'PASS: anonymous question/photo/response uploads; 32 translations saved once; original preserved; rollback' as result;
rollback;
