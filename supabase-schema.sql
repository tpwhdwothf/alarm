-- Supabase용 스키마: user_settings, targets, alert_logs

create extension if not exists "pgcrypto";

create table if not exists public.user_settings (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id text not null unique,
  default_group_chat_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.targets (
  id uuid primary key default gen_random_uuid(),
  created_by text not null,
  symbol text not null,
  name text,
  market text not null, -- 'KR' 또는 'US'
  tps jsonb not null,   -- 예: [180,190,200]
  next_level integer not null default 1,
  status text not null default 'ACTIVE', -- ACTIVE / COMPLETED / CLOSED
  group_chat_id text,
  pick_type text default '무료픽',        -- '무료픽' | 'VIP픽'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_targets_created_by_symbol unique (created_by, symbol)
);

create table if not exists public.alert_logs (
  id uuid primary key default gen_random_uuid(),
  created_by text not null,
  symbol text not null,
  tp_level integer not null,
  price numeric not null,
  sent_at timestamptz not null default now(),
  message_id text
);

-- 봇이 anon 키로 저장·조회할 수 있도록 RLS 정책 추가 (정책이 없으면 저장 시 "오류" 발생)
alter table public.user_settings enable row level security;
alter table public.targets enable row level security;
alter table public.alert_logs enable row level security;

drop policy if exists "anon_all_user_settings" on public.user_settings;
create policy "anon_all_user_settings"
  on public.user_settings for all to anon using (true) with check (true);

drop policy if exists "anon_all_targets" on public.targets;
create policy "anon_all_targets"
  on public.targets for all to anon using (true) with check (true);

drop policy if exists "anon_all_alert_logs" on public.alert_logs;
create policy "anon_all_alert_logs"
  on public.alert_logs for all to anon using (true) with check (true);

