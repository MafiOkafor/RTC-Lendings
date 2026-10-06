-- Database policies are authoritative; hiding buttons is only a UI convenience.
begin;

-- These helpers always consult the current staff row, so disabling is immediate.
create function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.staff_members
    where user_id = auth.uid() and active and removed_at is null);
$$;
create function public.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.staff_members
    where user_id = auth.uid() and role = 'owner' and active and removed_at is null);
$$;
create function public.can_approve_loans() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.staff_members
    where user_id = auth.uid() and active and removed_at is null
    and (role = 'owner' or can_approve));
$$;
create function public.can_read_application(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.loan_applications
    where id = p_id and (customer_id = auth.uid() or public.is_staff()));
$$;

-- RLS plus read-only table grants: changes are allowed only through checked RPCs.
do $$
declare t text;
begin
  foreach t in array array['business_profile','staff_members','customer_profiles',
    'loan_applications','affordability_assessments','application_documents',
    'repayment_schedule','loan_payments','audit_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;
create policy business_read on public.business_profile for select to authenticated using (true);
create policy staff_read on public.staff_members for select to authenticated
  using (user_id = auth.uid() or public.is_owner());
create policy profile_read on public.customer_profiles for select to authenticated
  using (user_id = auth.uid() or public.is_staff());
create policy application_read on public.loan_applications for select to authenticated
  using (customer_id = auth.uid() or public.is_staff());
create policy assessment_read on public.affordability_assessments for select to authenticated
  using (public.is_staff());
create policy document_read on public.application_documents for select to authenticated
  using (public.can_read_application(application_id));
create policy schedule_read on public.repayment_schedule for select to authenticated
  using (public.can_read_application(application_id));
create policy payment_read on public.loan_payments for select to authenticated
  using (public.can_read_application(application_id));
create policy audit_read on public.audit_events for select to authenticated
  using (public.is_owner() or (application_id is not null and public.can_read_application(application_id)));

-- The final permissions file grants execution only to signed-in accounts.
revoke execute on function public.is_staff() from public, anon;
revoke execute on function public.is_owner() from public, anon;
revoke execute on function public.can_approve_loans() from public, anon;
revoke execute on function public.can_read_application(uuid) from public, anon;
grant execute on function public.is_staff(), public.is_owner(), public.can_approve_loans(),
  public.can_read_application(uuid) to authenticated;
commit;
