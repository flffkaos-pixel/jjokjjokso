-- 게시판 신고 기능 (community.sql 실행 후 한 번만 실행하세요)

-- 1) 신고 테이블
create table if not exists public.board_reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('post', 'comment')),
  target_id uuid not null,
  reason text not null check (char_length(btrim(reason)) between 2 and 300),
  status text not null default 'pending' check (status in ('pending', 'resolved')),
  created_at timestamptz not null default now()
);

alter table public.board_reports enable row level security;

-- 2) 정책: 누구나 접수, 관리자만 조회/처리
drop policy if exists "board_reports_insert" on public.board_reports;
create policy "board_reports_insert" on public.board_reports
  for insert to anon, authenticated
  with check (char_length(btrim(reason)) between 2 and 300);

drop policy if exists "board_reports_select_admin" on public.board_reports;
create policy "board_reports_select_admin" on public.board_reports
  for select using (public.is_admin());

drop policy if exists "board_reports_update_admin" on public.board_reports;
create policy "board_reports_update_admin" on public.board_reports
  for update using (public.is_admin());

-- 3) 권한
grant insert on public.board_reports to anon, authenticated;
grant select, update on public.board_reports to authenticated;
