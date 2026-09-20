begin;
alter table public.exhibit_state drop constraint if exists exhibit_state_locale_check;
alter table public.exhibit_state add constraint exhibit_state_locale_check check (locale in ('ko','tr','en'));
commit;
