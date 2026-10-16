-- 댓글 추천 기능 (community.sql 실행 후 한 번만 실행하세요)

-- 1) 댓글 좋아요 수 컬럼
alter table public.board_comments add column if not exists like_count integer not null default 0;

-- 2) 댓글 좋아요 테이블 (브라우저당 1회)
create table if not exists public.board_comment_likes (
  comment_id uuid not null references public.board_comments(id) on delete cascade,
  voter_key  text not null check (char_length(voter_key) between 8 and 64),
  created_at timestamptz not null default now(),
  primary key (comment_id, voter_key)
);
alter table public.board_comment_likes enable row level security;
-- 클라이언트는 RPC(security definer)로만 접근. 직접 INSERT/DELETE 권한 없음.

-- 3) 토글 RPC (있으면 취소 false, 없으면 등록 true)
create or replace function public.board_comment_like(p_id uuid, p_voter text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_exists boolean;
begin
  if p_id is null or coalesce(p_voter, '') = '' then return false; end if;
  if char_length(p_voter) < 8 or char_length(p_voter) > 64 then return false; end if;
  if not exists(select 1 from public.board_comments where id = p_id) then return false; end if;

  select exists(
    select 1 from public.board_comment_likes
    where comment_id = p_id and voter_key = p_voter
  ) into v_exists;

  if v_exists then
    delete from public.board_comment_likes
     where comment_id = p_id and voter_key = p_voter;
    update public.board_comments
       set like_count = greatest(like_count - 1, 0)
     where id = p_id;
    return false;
  else
    insert into public.board_comment_likes(comment_id, voter_key)
    values (p_id, p_voter);
    update public.board_comments
       set like_count = like_count + 1
     where id = p_id;
    return true;
  end if;
end; $$;

grant execute on function public.board_comment_like(uuid, text) to anon, authenticated;
