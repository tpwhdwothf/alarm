-- alert_groups 테이블에 GENERAL(일반방) role 추가
-- Supabase SQL Editor에서 실행하세요.
-- 기존 check 제약을 수정하여 GENERAL을 허용합니다.

alter table public.alert_groups drop constraint if exists alert_groups_role_check;
alter table public.alert_groups add constraint alert_groups_role_check
  check (role in ('NOTICE', 'VIP', 'GENERAL'));
