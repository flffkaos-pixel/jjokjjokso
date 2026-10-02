-- schema.sql 마지막(스토리지) 구간입니다.
-- SQL Editor 에 붙여넣고 Run 하면 증거 파일 업로드가 활성화됩니다.

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
