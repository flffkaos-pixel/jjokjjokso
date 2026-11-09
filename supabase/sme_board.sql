-- 중소 직장인 커뮤니티 전환 (community.sql 실행 후 한 번만 실행하세요)

-- 1) 기존 제약 제거 (검증 해제)
alter table public.board_posts drop constraint if exists board_posts_category_check;

-- 2) 기존 카테고리(free/qna/info/share) → 기타 마이그레이션
update public.board_posts set category = 'etc' where category in ('free', 'qna', 'info', 'share');

-- 3) 새 업종 제약 추가 (이 시점엔 모든 행이 유효)
alter table public.board_posts add constraint board_posts_category_check
  check (category in ('manu', 'store', 'drive', 'office', 'build', 'etc'));

-- 4) 지역 컬럼 (선택)
alter table public.board_posts add column if not exists region text;

-- 5) 등록 정책도 업종 체크로 교체 (community.sql 재실행 대비 자가복구)
drop policy if exists "board_posts_insert" on public.board_posts;
create policy "board_posts_insert" on public.board_posts
  for insert to anon, authenticated
  with check (
    char_length(btrim(title)) between 1 and 120
    and char_length(btrim(body)) between 1 and 5000
    and category in ('manu', 'store', 'drive', 'office', 'build', 'etc')
    and view_count = 0 and like_count = 0 and comment_count = 0
  );

-- 6) 열 권한 재정의 (region 포함 — password_hash 제외 유지)
revoke select on public.board_posts from anon, authenticated;
grant select (id, title, body, category, region, author_name, is_anonymous, view_count, like_count, comment_count, created_at, updated_at, images)
  on public.board_posts to anon, authenticated;
