-- targets 테이블에 buy_price_range 컬럼 추가 (매수가 범위, 예: "110000 ~ 220000")
-- Supabase SQL Editor에서 실행하세요.

alter table public.targets
  add column if not exists buy_price_range text;
