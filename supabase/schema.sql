-- ============================================================
-- 좆좆소 (JJOKJJOKSO) - Supabase 스키마
-- Supabase Dashboard > SQL Editor 에서 아래 전체를 실행하세요.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- ENUM ----------
do $$ begin
  create type public.post_status as enum
    ('pending', 'reviewing', 'verified', 'partial', 'rejected', 'disputed');
exception when duplicate_object then null; end $$;

-- ---------- 테이블 ----------
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.posts (
  id            uuid primary key default gen_random_uuid(),
  access_token  uuid not null default gen_random_uuid(),
  kind          text not null check (kind in ('company', 'store')),
  title         text not null check (char_length(title) between 5 and 140),
  subject       text not null check (char_length(subject) between 2 and 120),
  category      text not null,
  region        text,
  body          text not null check (char_length(body) between 40 and 12000),
  occurred_at   date,
  status        public.post_status not null default 'pending',
  is_anonymous  boolean not null default true,
  author_name   text check (author_name is null or char_length(author_name) <= 30),
  view_count    integer not null default 0,
  helpful_count integer not null default 0,
  mod_note      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists posts_status_created_idx on public.posts (status, created_at desc);
create index if not exists posts_category_idx on public.posts (category);
create index if not exists posts_region_idx on public.posts (region);

create table if not exists public.evidence (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  kind        text not null check (kind in ('screenshot','receipt','contract','recording','message','link','other')),
  url         text not null,
  caption     text check (caption is null or char_length(caption) <= 300),
  captured_at date,
  created_at  timestamptz not null default now()
);
create index if not exists evidence_post_idx on public.evidence (post_id);

create table if not exists public.status_events (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  from_status public.post_status,
  to_status   public.post_status not null,
  note        text,
  internal    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists status_events_post_idx on public.status_events (post_id, created_at);

create table if not exists public.rebuttals (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references public.posts(id) on delete cascade,
  author_name   text not null check (char_length(author_name) between 2 and 60),
  body          text not null check (char_length(body) between 20 and 6000),
  contact       text,
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  mod_note      text,
  created_at    timestamptz not null default now()
);
create index if not exists rebuttals_post_idx on public.rebuttals (post_id);

create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  body        text not null check (char_length(body) between 2 and 1000),
  author_name text,
  is_anonymous boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists comments_post_idx on public.comments (post_id, created_at);

create table if not exists public.post_votes (
  post_id    uuid not null references public.posts(id) on delete cascade,
  voter_key  text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, voter_key)
);

-- ---------- 함수 ----------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.admins where user_id = auth.uid()) $$;

create or replace function public.site_stats()
returns json language sql stable security definer set search_path = public
as $$
  select json_build_object(
    'posts',    (select count(*) from public.posts where status <> 'pending'),
    'verified', (select count(*) from public.posts where status in ('verified','partial')),
    'evidence', (select count(*) from public.evidence),
    'rebuttals',(select count(*) from public.rebuttals where status = 'approved')
  )
$$;

create or replace function public.post_exists(p_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.posts where id = p_id) $$;

-- 열람용: 본인 대기중 제보는 access_token 으로 조회 가능
create or replace function public.get_post(p_id uuid, p_token uuid default null)
returns setof public.posts language sql stable security definer set search_path = public
as $$
  select * from public.posts
  where id = p_id and (status <> 'pending' or access_token = p_token)
$$;

create or replace function public.view_post(p_id uuid)
returns void language sql security definer set search_path = public
as $$
  update public.posts set view_count = view_count + 1 where id = p_id
$$;

create or replace function public.vote_post(p_id uuid, p_voter text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if p_voter is null or char_length(p_voter) < 8 then return; end if;
  insert into public.post_votes (post_id, voter_key)
  values (p_id, p_voter)
  on conflict do nothing;
  if found then
    update public.posts set helpful_count = helpful_count + 1 where id = p_id;
  end if;
end $$;

-- ---------- 트리거 ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists posts_touch on public.posts;
create trigger posts_touch before update on public.posts
for each row execute function public.touch_updated_at();

create or replace function public.log_status_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.status_events (post_id, from_status, to_status, note)
    values (new.id, null, 'pending', '제보가 접수되었습니다.');
  elsif new.status is distinct from old.status then
    insert into public.status_events (post_id, from_status, to_status, note)
    values (new.id, old.status, new.status, new.mod_note);
  end if;
  return new;
end $$;

drop trigger if exists posts_status_log on public.posts;
create trigger posts_status_log after insert or update on public.posts
for each row execute function public.log_status_event();

create or replace function public.sync_comment_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
  end if;
  return coalesce(new, old);
end $$;

alter table public.posts add column if not exists comment_count integer not null default 0;

drop trigger if exists comments_count on public.comments;
create trigger comments_count after insert or delete on public.comments
for each row execute function public.sync_comment_count();

-- ---------- RLS ----------
alter table public.posts        enable row level security;
alter table public.evidence     enable row level security;
alter table public.status_events enable row level security;
alter table public.rebuttals    enable row level security;
alter table public.comments     enable row level security;
alter table public.post_votes   enable row level security;
alter table public.admins       enable row level security;

drop policy if exists "posts_read" on public.posts;
create policy "posts_read" on public.posts for select
using (status <> 'pending' or public.is_admin());

drop policy if exists "posts_insert" on public.posts;
create policy "posts_insert" on public.posts for insert
with check (status = 'pending');

drop policy if exists "posts_update_admin" on public.posts;
create policy "posts_update_admin" on public.posts for update
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "posts_delete_admin" on public.posts;
create policy "posts_delete_admin" on public.posts for delete
using (public.is_admin());

drop policy if exists "evidence_read" on public.evidence;
create policy "evidence_read" on public.evidence for select using (true);

drop policy if exists "evidence_insert" on public.evidence;
create policy "evidence_insert" on public.evidence for insert
with check (public.post_exists(post_id));

drop policy if exists "evidence_delete_admin" on public.evidence;
create policy "evidence_delete_admin" on public.evidence for delete
using (public.is_admin());

drop policy if exists "events_read" on public.status_events;
create policy "events_read" on public.status_events for select
using (not internal or public.is_admin());

drop policy if exists "events_insert_admin" on public.status_events;
create policy "events_insert_admin" on public.status_events for insert
with check (public.is_admin());

drop policy if exists "rebuttals_read" on public.rebuttals;
create policy "rebuttals_read" on public.rebuttals for select
using (status = 'approved' or public.is_admin());

drop policy if exists "rebuttals_insert" on public.rebuttals;
create policy "rebuttals_insert" on public.rebuttals for insert
with check (status = 'pending');

drop policy if exists "rebuttals_update_admin" on public.rebuttals;
create policy "rebuttals_update_admin" on public.rebuttals for update
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "comments_read" on public.comments;
create policy "comments_read" on public.comments for select using (true);

drop policy if exists "comments_insert" on public.comments;
create policy "comments_insert" on public.comments for insert
with check (
  exists (
    select 1 from public.posts p
    where p.id = post_id
      and p.status in ('reviewing','verified','partial','disputed')
  )
);

drop policy if exists "comments_delete_admin" on public.comments;
create policy "comments_delete_admin" on public.comments for delete
using (public.is_admin());

drop policy if exists "votes_read" on public.post_votes;
create policy "votes_read" on public.post_votes for select using (true);

drop policy if exists "admins_read" on public.admins;
create policy "admins_read" on public.admins for select
using (user_id = auth.uid());

-- ---------- 스토리지 (증거 파일) ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('evidence', 'evidence', true, 10485760)
on conflict (id) do nothing;

drop policy if exists "evidence_files_read" on storage.objects;
create policy "evidence_files_read" on storage.objects for select
using (bucket_id = 'evidence');

drop policy if exists "evidence_files_insert" on storage.objects;
create policy "evidence_files_insert" on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'evidence');

drop policy if exists "evidence_files_delete_admin" on storage.objects;
create policy "evidence_files_delete_admin" on storage.objects for delete
using (bucket_id = 'evidence' and public.is_admin());

-- ============================================================
-- 관리자 등록 (필수!): Supabase Dashboard > Authentication > Users
-- 에서 이메일 유저를 만들고, 그 user_id 를 아래에 삽입합니다.
--   insert into public.admins (user_id) values ('유저UUID');
-- ============================================================
