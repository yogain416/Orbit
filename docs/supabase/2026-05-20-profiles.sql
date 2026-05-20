-- Orbit Phase 1 — Supabase 초기 스키마 (사용자 콘솔 작업)
--
-- 적용 방법:
--   1. Supabase 콘솔 → SQL Editor → New query
--   2. 아래 전체 복붙 → Run
--   3. Authentication → Providers → Google 활성화 + Authorized redirect URI 확인
--      ('app://orbit/auth/callback'이 Redirect URLs에 등록되어 있어야 함)
--
-- 멱등(idempotent)하므로 여러 번 실행해도 안전합니다.
-- tasks/categories/monthly_goals/daily_reviews 등 동기화용 테이블은 Plan 3(Sync engine)에서 추가합니다.

-- ── 1. profiles 테이블 ────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  google_calendar_id text,
  google_tasklist_id text,
  created_at timestamptz default now()
);

-- ── 2. 회원가입 시 profile 자동 생성 트리거 ──────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      new.email
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 3. RLS — 본인 row만 read/update ───────────────────────────
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

-- profile insert는 트리거(security definer)가 처리하므로 사용자 직접 insert 정책은 만들지 않습니다.
-- delete는 auth.users on delete cascade로 자동 처리.
