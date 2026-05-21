-- Orbit Phase 1 — Plan 3 (Sync engine) 동기화 테이블 (사용자 콘솔 작업)
--
-- 적용 방법:
--   1. Supabase 콘솔 → SQL Editor → New query
--   2. 아래 전체 복붙 → Run
--   3. Table editor에서 4개 테이블(tasks/categories/monthly_goals/see_memos) + RLS 활성화 확인
--
-- 멱등(idempotent)하므로 여러 번 실행해도 안전합니다.
-- profiles 테이블은 2026-05-20-profiles.sql에서 이미 생성된 상태를 전제로 합니다.
--
-- 설계 결정 (plan §아키텍처 결정):
--   - id 컬럼은 text — 로컬 SQLite의 기존 id 형식(Date.now()+base36) 그대로 보존 (옵션 A)
--   - user_id 컬럼으로 RLS 격리, 같은 계정의 데이터만 select/write 가능
--   - updated_at은 trigger로 서버 시각 자동 갱신 (PC 시계 어긋남 회피, plan §위험 #5)
--   - boolean/jsonb는 Supabase 타입 그대로 사용 — 로컬은 SQLite 관행대로 0/1, JSON string으로 직렬화

-- ── 0. 공통 updated_at 자동 갱신 함수 ────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── 1. tasks ────────────────────────────────────────────────
create table if not exists public.tasks (
  id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default '',
  memo text default '',
  date text not null,
  end_date text,
  is_completed boolean default false,
  is_in_progress boolean default false,
  is_starred boolean default false,
  repeat_type text default 'none',
  repeat_days jsonb,
  order_index integer default 0,
  remind_at text,
  color text,
  category text,
  is_habit boolean default false,
  start_time text,
  end_time text,
  is_template boolean default false,
  parent_id text,
  skipped_dates jsonb,
  rollover_source_id text,
  rolled_at timestamptz,
  completion_note text,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_tasks_user_date on public.tasks(user_id, date);
create index if not exists idx_tasks_user_updated on public.tasks(user_id, updated_at);
create index if not exists idx_tasks_user_parent on public.tasks(user_id, parent_id);

drop trigger if exists set_tasks_updated_at on public.tasks;
create trigger set_tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

alter table public.tasks enable row level security;

drop policy if exists "tasks_select_own" on public.tasks;
create policy "tasks_select_own" on public.tasks for select using (auth.uid() = user_id);
drop policy if exists "tasks_insert_own" on public.tasks;
create policy "tasks_insert_own" on public.tasks for insert with check (auth.uid() = user_id);
drop policy if exists "tasks_update_own" on public.tasks;
create policy "tasks_update_own" on public.tasks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "tasks_delete_own" on public.tasks;
create policy "tasks_delete_own" on public.tasks for delete using (auth.uid() = user_id);

-- ── 2. categories ───────────────────────────────────────────
create table if not exists public.categories (
  id text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  color text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (user_id, id)
);

drop trigger if exists set_categories_updated_at on public.categories;
create trigger set_categories_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

alter table public.categories enable row level security;

drop policy if exists "categories_select_own" on public.categories;
create policy "categories_select_own" on public.categories for select using (auth.uid() = user_id);
drop policy if exists "categories_insert_own" on public.categories;
create policy "categories_insert_own" on public.categories for insert with check (auth.uid() = user_id);
drop policy if exists "categories_update_own" on public.categories;
create policy "categories_update_own" on public.categories for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "categories_delete_own" on public.categories;
create policy "categories_delete_own" on public.categories for delete using (auth.uid() = user_id);

-- ── 3. monthly_goals ────────────────────────────────────────
create table if not exists public.monthly_goals (
  user_id uuid not null references public.profiles(id) on delete cascade,
  ym text not null,
  text text default '',
  updated_at timestamptz default now(),
  primary key (user_id, ym)
);

drop trigger if exists set_monthly_goals_updated_at on public.monthly_goals;
create trigger set_monthly_goals_updated_at
  before update on public.monthly_goals
  for each row execute function public.set_updated_at();

alter table public.monthly_goals enable row level security;

drop policy if exists "monthly_goals_select_own" on public.monthly_goals;
create policy "monthly_goals_select_own" on public.monthly_goals for select using (auth.uid() = user_id);
drop policy if exists "monthly_goals_insert_own" on public.monthly_goals;
create policy "monthly_goals_insert_own" on public.monthly_goals for insert with check (auth.uid() = user_id);
drop policy if exists "monthly_goals_update_own" on public.monthly_goals;
create policy "monthly_goals_update_own" on public.monthly_goals for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "monthly_goals_delete_own" on public.monthly_goals;
create policy "monthly_goals_delete_own" on public.monthly_goals for delete using (auth.uid() = user_id);

-- ── 4. see_memos ────────────────────────────────────────────
create table if not exists public.see_memos (
  user_id uuid not null references public.profiles(id) on delete cascade,
  date text not null,
  good text default '',
  bad text default '',
  "next" text default '',
  updated_at timestamptz default now(),
  primary key (user_id, date)
);

drop trigger if exists set_see_memos_updated_at on public.see_memos;
create trigger set_see_memos_updated_at
  before update on public.see_memos
  for each row execute function public.set_updated_at();

alter table public.see_memos enable row level security;

drop policy if exists "see_memos_select_own" on public.see_memos;
create policy "see_memos_select_own" on public.see_memos for select using (auth.uid() = user_id);
drop policy if exists "see_memos_insert_own" on public.see_memos;
create policy "see_memos_insert_own" on public.see_memos for insert with check (auth.uid() = user_id);
drop policy if exists "see_memos_update_own" on public.see_memos;
create policy "see_memos_update_own" on public.see_memos for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "see_memos_delete_own" on public.see_memos;
create policy "see_memos_delete_own" on public.see_memos for delete using (auth.uid() = user_id);

-- 끝. 확인:
--   select table_name, row_security from information_schema.tables
--   where table_schema='public' and table_name in ('tasks','categories','monthly_goals','see_memos');
