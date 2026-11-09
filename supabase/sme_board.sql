-- 중소 직장인 커뮤니티 전환 (community.sql 실행 후 한 번만 실행하세요)

-- 1) 업종 체크 교체 (먼저!)
alter table public.board_posts drop constraint if exists board_posts_category_check;
alter table public.board_posts add constraint board_posts_category_check
  check (category in ('manu', 'store', 'drive', 'office', 'build', 'etc'));

-- 2) 기존 카테고리(free/qna/info/share) → 기타로 마이그레이션
update public.board_posts set category = 'etc' where category in ('free', 'qna', 'info', 'share');

-- 3) 지역 컬럼 (선택)
alter table public.board_posts add column if not exists region text;

-- 4) 열 권한 재정의 (region 포함 — password_hash 제외 유지)
revoke select on public.board_posts from anon, authenticated;
grant select (id, title, body, category, region, author_name, is_anonymous, view_count, like_count, comment_count, created_at, updated_at, images)
  on public.board_posts to anon, authenticated;
