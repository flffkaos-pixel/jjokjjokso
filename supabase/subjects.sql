-- 좌좌소 "제보 대상" 등록 테이블
-- Supabase Dashboard > SQL Editor 에서 이 파일을 1회 실행하세요. (스키마 실행과 별개)

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

-- 정규화된 이름으로 중복을 무시하고 등록 (없으면 insert, 있으면 기존 id 반환)
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
