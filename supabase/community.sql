-- 좆좆소 커뮤니티(자유게시판) + 제보 대상 등록
-- Supabase Dashboard > SQL Editor 에서 이 파일을 1회 실행하세요. (재실행해도 안전합니다)
-- subjects.sql 대신 이 파일만 실행하면 두 기능 모두 준비됩니다.

-- ============================================================
-- 1) 제보 대상 (subjects.sql 포함본 — 이미 실행했어도 안전)
-- ============================================================

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  name_key text generated always as (lower(btrim(name))) stored,
  kind text not null default 'company' check (kind in ('company', 'store')),
  category text,
  region text,
  created_at timestamptz not null default now(),
  unique (name_key, kind)
);

create index if not exists subjects_created_idx on public.subjects (created_at desc);

alter table public.subjects enable row level security;

drop policy if exists "subjects_select" on public.subjects;
create policy "subjects_select" on public.subjects
  for select using (true);

drop policy if exists "subjects_insert" on public.subjects;
create policy "subjects_insert" on public.subjects
  for insert to anon, authenticated
  with check (char_length(btrim(name)) between 2 and 120);

drop policy if exists "subjects_delete_admin" on public.subjects;
create policy "subjects_delete_admin" on public.subjects
  for delete using (public.is_admin());

grant select, insert, delete on public.subjects to anon, authenticated;

create or replace function public.register_subject(
  p_name text,
  p_kind text default 'company',
  p_category text default null,
  p_region text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
  v_kind text;
begin
  v_name := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if char_length(v_name) < 2 then
    raise exception '대상명은 2자 이상이어야 합니다.';
  end if;
  v_kind := case when p_kind in ('company', 'store') then p_kind else 'company' end;

  insert into public.subjects (name, kind, category, region)
  values (
    v_name,
    v_kind,
    nullif(btrim(coalesce(p_category, '')), ''),
    nullif(btrim(coalesce(p_region, '')), '')
  )
  on conflict (name_key, kind) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.subjects
    where name_key = lower(v_name) and kind = v_kind
    limit 1;
  end if;

  return v_id;
end;
$$;

grant execute on function public.register_subject(text, text, text, text) to anon, authenticated;

-- ============================================================
-- 2) 자유게시판
-- ============================================================

create table if not exists public.board_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  category text not null default 'free'
    check (category in ('free', 'qna', 'info', 'share')),
  author_name text check (author_name is null or char_length(author_name) between 1 and 20),
  is_anonymous boolean not null default true,
  view_count integer not null default 0,
  like_count integer not null default 0,
  comment_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists board_posts_created_idx on public.board_posts (created_at desc);
create index if not exists board_posts_category_idx on public.board_posts (category, created_at desc);
create index if not exists board_posts_like_idx on public.board_posts (like_count desc);

create table if not exists public.board_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.board_posts(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 2 and 1000),
  author_name text check (author_name is null or char_length(author_name) between 1 and 20),
  created_at timestamptz not null default now()
);

create index if not exists board_comments_post_idx on public.board_comments (post_id, created_at);

create table if not exists public.board_likes (
  post_id uuid not null references public.board_posts(id) on delete cascade,
  voter_key text not null check (char_length(voter_key) between 8 and 64),
  created_at timestamptz not null default now(),
  primary key (post_id, voter_key)
);

alter table public.board_posts enable row level security;
alter table public.board_comments enable row level security;
alter table public.board_likes enable row level security;

drop policy if exists "board_posts_select" on public.board_posts;
create policy "board_posts_select" on public.board_posts
  for select using (true);

drop policy if exists "board_posts_insert" on public.board_posts;
create policy "board_posts_insert" on public.board_posts
  for insert to anon, authenticated
  with check (
    char_length(btrim(title)) between 1 and 120
    and char_length(btrim(body)) between 1 and 5000
    and category in ('free', 'qna', 'info', 'share')
    and view_count = 0 and like_count = 0 and comment_count = 0
  );

drop policy if exists "board_posts_admin" on public.board_posts;
create policy "board_posts_admin" on public.board_posts
  for update using (public.is_admin());

drop policy if exists "board_posts_delete_admin" on public.board_posts;
create policy "board_posts_delete_admin" on public.board_posts
  for delete using (public.is_admin());

drop policy if exists "board_comments_select" on public.board_comments;
create policy "board_comments_select" on public.board_comments
  for select using (true);

drop policy if exists "board_comments_insert" on public.board_comments;
create policy "board_comments_insert" on public.board_comments
  for insert to anon, authenticated
  with check (char_length(btrim(body)) between 2 and 1000);

drop policy if exists "board_comments_delete_admin" on public.board_comments;
create policy "board_comments_delete_admin" on public.board_comments
  for delete using (public.is_admin());

drop policy if exists "board_likes_select" on public.board_likes;
create policy "board_likes_select" on public.board_likes
  for select using (true);

grant select, insert on public.board_posts to anon, authenticated;
grant update, delete on public.board_posts to authenticated;
grant select, insert on public.board_comments to anon, authenticated;
grant delete on public.board_comments to authenticated;
grant select on public.board_likes to anon, authenticated;

-- 추천 토글 (한 브라우저당 1회, 다시 누르면 해제)
create or replace function public.board_like(p_id uuid, p_voter text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_liked boolean := false;
begin
  if p_id is null or p_voter is null or char_length(p_voter) < 8 then
    return false;
  end if;

  if exists (select 1 from public.board_likes where post_id = p_id and voter_key = p_voter) then
    delete from public.board_likes where post_id = p_id and voter_key = p_voter;
    update public.board_posts
      set like_count = greatest(like_count - 1, 0)
      where id = p_id;
    return false;
  end if;

  insert into public.board_likes (post_id, voter_key)
    values (p_id, p_voter)
    on conflict do nothing;

  update public.board_posts
    set like_count = like_count + 1
    where id = p_id;

  return true;
end;
$$;

grant execute on function public.board_like(uuid, text) to anon, authenticated;

-- 조회수 증가 (페이지 단위 1회는 클라이언트가 제어)
create or replace function public.board_view(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_id is null then return; end if;
  update public.board_posts
    set view_count = view_count + 1
    where id = p_id;
end;
$$;

grant execute on function public.board_view(uuid) to anon, authenticated;

-- updated_at 자동 갱신
create or replace function public.board_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists board_posts_touch on public.board_posts;
create trigger board_posts_touch
  before update on public.board_posts
  for each row execute function public.board_touch_updated_at();

-- 댓글 수 동기화 (anon 이 댓글을 INSERT 해도 게시글 카운트를 올릴 수 있어야 하므로 definer)
create or replace function public.board_sync_comment_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.board_posts
      set comment_count = comment_count + 1
      where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.board_posts
      set comment_count = greatest(comment_count - 1, 0)
      where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists board_comments_count on public.board_comments;
create trigger board_comments_count
  after insert or delete on public.board_comments
  for each row execute function public.board_sync_comment_count();

-- 사진 첨부 컬럼 (재실행 안전)
alter table public.board_posts add column if not exists images text[] not null default '{}';

-- ========== 비밀번호 수정/삭제 (재실행 안전) ==========

-- 비밀번호 해시 컬럼
alter table public.board_posts add column if not exists password_hash text;

-- password_hash 열 권한 회수 (해시가 API로 노출되지 않게)
revoke select on public.board_posts from anon, authenticated;
grant select (id, title, body, category, author_name, is_anonymous, view_count, like_count, comment_count, created_at, updated_at, images)
  on public.board_posts to anon, authenticated;

-- 비밀번호 검증 (수정창 열기 전 확인용)
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

-- 비밀번호 일치 시 제목/내용 수정
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

-- 비밀번호 일치 시 삭제 (댓글은 cascade로 함께 삭제)
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
