-- targets 테이블에 pick_type 컬럼이 없을 때 한 번만 실행하세요.
-- Supabase SQL Editor에 붙여 넣고 Run 하면 됩니다.
--
-- pick_type: '무료픽' | 'VIP픽' (또는 null)

alter table public.targets
  add column if not exists pick_type text default '무료픽';
