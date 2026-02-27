-- targets 테이블에 name 컬럼이 없을 때 한 번만 실행하세요.
-- Supabase SQL Editor에 붙여 넣고 Run 하면 됩니다.

alter table public.targets
  add column if not exists name text;
