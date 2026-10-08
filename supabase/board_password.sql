-- 자유게시판 비밀번호 수정/삭제 (community.sql 실행 후 한 번만 실행하세요)

-- 1) 비밀번호 해시 컬럼 추가
alter table public.board_posts add column if not exists password_hash text;

-- 2) password_hash 열 권한 회수 (해시가 API로 노출되지 않게)
revoke select on public.board_posts from anon, authenticated;
grant select (id, title, body, category, author_name, is_anonymous, view_count, like_count, comment_count, created_at, updated_at, images)
  on public.board_posts to anon, authenticated;

-- 3) 비밀번호 검증 (수정창 열기 전 확인용)
create or replace function public.board_check(p_id uuid, p_pass_hash text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_id is null or coalesce(p_pass_hash, '') = '' then return false; end if;
  return exists(
    select 1 from public.board_posts
    where id = p_id and password_hash = p_pass_hash
  );
end; $$;

-- 4) 비밀번호 일치 시 제목/내용 수정
create or replace function public.board_update(p_id uuid, p_pass_hash text, p_title text, p_body text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_id is null or coalesce(p_pass_hash, '') = '' then return false; end if;
  if char_length(btrim(coalesce(p_title, ''))) < 1 or char_length(btrim(coalesce(p_title, ''))) > 120 then
    raise exception '제목은 1~120자여야 합니다.';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) < 1 or char_length(btrim(coalesce(p_body, ''))) > 5000 then
    raise exception '내용은 1~5000자여야 합니다.';
  end if;
  update public.board_posts
     set title = btrim(p_title), body = btrim(p_body)
   where id = p_id and password_hash = p_pass_hash;
  return found;
end; $$;

-- 5) 비밀번호 일치 시 삭제 (댓글은 cascade로 함께 삭제)
create or replace function public.board_delete(p_id uuid, p_pass_hash text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_id is null or coalesce(p_pass_hash, '') = '' then return false; end if;
  delete from public.board_posts
   where id = p_id and password_hash = p_pass_hash;
  return found;
end; $$;

grant execute on function public.board_check(uuid, text) to anon, authenticated;
grant execute on function public.board_update(uuid, text, text, text) to anon, authenticated;
grant execute on function public.board_delete(uuid, text) to anon, authenticated;
