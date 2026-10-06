begin;
-- Save only the calling customer's profile. Email is taken from Auth, not the form.
create function public.save_customer_profile(p_name text, p_phone text, p_address text,
  p_employment text, p_income numeric, p_expenses numeric, p_debt numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if p_income is null or p_expenses is null or p_debt is null or
    p_income::text in ('NaN','Infinity','-Infinity') or
    p_expenses::text in ('NaN','Infinity','-Infinity') or p_debt::text in ('NaN','Infinity','-Infinity')
    then raise exception 'Enter valid monthly amounts.'; end if;
  insert into public.customer_profiles(user_id, full_name, email, phone, address,
    employment, monthly_income, living_expenses, debt_payments)
  select auth.uid(), trim(p_name), u.email, trim(p_phone), trim(p_address),
    p_employment, p_income, p_expenses, p_debt from auth.users u where u.id = auth.uid()
  on conflict(user_id) do update set full_name = excluded.full_name, phone = excluded.phone,
    address = excluded.address, employment = excluded.employment, email = excluded.email,
    monthly_income = excluded.monthly_income, living_expenses = excluded.living_expenses,
    debt_payments = excluded.debt_payments, updated_at = now();
end $$;

-- The application captures the exact profile and privacy notice at submission.
create function public.submit_application(p_amount numeric, p_months integer, p_purpose text, p_consent boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare profile public.customer_profiles; business public.business_profile; new_id uuid;
begin
  if auth.uid() is null or p_consent is distinct from true then raise exception 'Consent is required.'; end if;
  if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') then raise exception 'Enter a valid amount.'; end if;
  select * into business from public.business_profile where id = 1;
  if not business.applications_open then raise exception 'Applications are not open yet.'; end if;
  select * into profile from public.customer_profiles where user_id = auth.uid();
  if not found then raise exception 'Complete your profile first.'; end if;
  insert into public.loan_applications(customer_id, requested_amount, requested_months,
    purpose, profile_snapshot, privacy_snapshot)
  values(auth.uid(), p_amount, p_months, trim(p_purpose), to_jsonb(profile), business.privacy_notice)
  returning id into new_id;
  insert into public.audit_events(application_id, actor_id, action)
    values(new_id, auth.uid(), 'application_submitted');
  return new_id;
end $$;

-- An agreement can be accepted only by its borrower, after an approved offer.
create function public.accept_agreement(p_id uuid, p_consent boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare loan public.loan_applications;
begin
  select * into loan from public.loan_applications where id = p_id for update;
  if not found or loan.customer_id is distinct from auth.uid() or auth.uid() is null
    then raise exception 'Application not available.'; end if;
  if loan.status <> 'approved' or p_consent is distinct from true
    then raise exception 'An approved agreement and acceptance are required.'; end if;
  if loan.first_due_date <= (now() at time zone 'Africa/Johannesburg')::date
    then raise exception 'This offer has expired. Contact RTC Lendings.'; end if;
  update public.loan_applications set status = 'agreement_accepted', agreement_accepted_at = now(),
    updated_at = now() where id = p_id;
  insert into public.audit_events(application_id, actor_id, action)
    values(p_id, auth.uid(), 'agreement_accepted');
end $$;

-- Lock down newly created functions immediately, even before later files are run.
revoke execute on function public.save_customer_profile(text,text,text,text,numeric,numeric,numeric),
  public.submit_application(numeric,integer,text,boolean), public.accept_agreement(uuid,boolean)
  from public, anon;
grant execute on function public.save_customer_profile(text,text,text,text,numeric,numeric,numeric),
  public.submit_application(numeric,integer,text,boolean), public.accept_agreement(uuid,boolean)
  to authenticated;
commit;
