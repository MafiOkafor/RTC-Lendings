begin;
-- Store only PDFs and images in a private bucket, with a 10 MB upload limit.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('loan-documents','loan-documents',false,10485760,array['application/pdf','image/jpeg','image/png']);

-- Every path is customer-id/application-id/random-id.ext.
create function public.can_upload_document(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.loan_applications
    where customer_id = auth.uid() and customer_id::text = split_part(p_path,'/',1)
    and id::text = split_part(p_path,'/',2) and status in ('submitted','affordability','documents'));
$$;
create function public.can_read_document_file(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.application_documents d
    where storage_path = p_path and public.can_read_application(d.application_id))
    or public.can_upload_document(p_path);
$$;
create policy loan_document_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'loan-documents' and public.can_upload_document(name));
create policy loan_document_download on storage.objects for select to authenticated
  using (bucket_id = 'loan-documents' and public.can_read_document_file(name));
-- No update or delete policy: submitted evidence cannot be silently replaced.

-- Attach an uploaded object only to its real borrower's application.
create function public.attach_document(p_id uuid, p_kind text, p_path text, p_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.loan_applications where id = p_id and customer_id = auth.uid()
    and status in ('submitted','affordability','documents') for update;
  if not found or not public.can_upload_document(p_path) or split_part(p_path,'/',2) <> p_id::text
    then raise exception 'Uploads are not allowed for this application.'; end if;
  if p_name is null or length(p_name) not between 1 and 255 then raise exception 'Invalid document name.'; end if;
  if not exists(select 1 from storage.objects where bucket_id = 'loan-documents' and name = p_path)
    then raise exception 'Upload the document before attaching it.'; end if;
  insert into public.application_documents(application_id,kind,storage_path,original_name)
    values(p_id,p_kind,p_path,p_name);
  insert into public.audit_events(application_id,actor_id,action)
    values(p_id,auth.uid(),'document_uploaded');
end $$;

-- Staff record a review outcome; the stored file remains immutable evidence.
create function public.review_document(p_document_id uuid, p_verified boolean, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare app_id uuid;
begin
  if not public.is_staff() then raise exception 'Staff access required.'; end if;
  select application_id into app_id from public.application_documents where id = p_document_id;
  perform 1 from public.loan_applications where id = app_id and status = 'documents' for update;
  if not found then raise exception 'Document review is not open for this application.'; end if;
  if p_verified is null or p_note is null or length(trim(p_note)) < 3 then raise exception 'Add a document review note.'; end if;
  update public.application_documents set status = case when p_verified then 'verified' else 'rejected' end,
    review_note = trim(p_note), reviewed_by = auth.uid(), reviewed_at = now() where id = p_document_id;
  insert into public.audit_events(application_id,actor_id,action)
    values(app_id,auth.uid(),'document_reviewed');
end $$;

revoke execute on function public.can_upload_document(text), public.can_read_document_file(text),
  public.attach_document(uuid,text,text,text), public.review_document(uuid,boolean,text) from public, anon;
grant execute on function public.can_upload_document(text), public.can_read_document_file(text),
  public.attach_document(uuid,text,text,text), public.review_document(uuid,boolean,text) to authenticated;
commit;
