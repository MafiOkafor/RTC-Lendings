begin;
-- Public website reads only the business details intended for publication.
create function public.public_business_details() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('name',name,'email',email,'phone',phone,'address',address,
    'registration_number',registration_number,'credit_provider_number',credit_provider_number,
    'applications_open',applications_open) from public.business_profile where id = 1;
$$;
revoke execute on function public.public_business_details() from public;
grant execute on function public.public_business_details() to anon, authenticated;

-- Owner-editable business details and a deliberate application launch switch.
create function public.save_business_profile(p_name text, p_registration text, p_credit_number text,
  p_email text, p_phone text, p_address text, p_privacy text, p_open boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'Owner access required.'; end if;
  if p_name is null or length(trim(p_name)) < 2 then raise exception 'Business name is required.'; end if;
  if p_open and (length(trim(coalesce(p_privacy,''))) < 100 or length(trim(coalesce(p_email,''))) < 5
    or length(trim(coalesce(p_credit_number,''))) < 3)
    then raise exception 'Add the contact email, credit-provider registration and reviewed privacy notice before opening applications.'; end if;
  update public.business_profile set name = trim(p_name), registration_number = trim(p_registration),
    credit_provider_number = trim(p_credit_number), email = trim(p_email), phone = trim(p_phone),
    address = trim(p_address), privacy_notice = trim(p_privacy), applications_open = p_open,
    updated_at = now() where id = 1;
  insert into public.audit_events(actor_id, action) values(auth.uid(), 'business_profile_updated');
end $$;

-- Add an existing, email-confirmed account as an employee. No admin secret in browser.
-- The employee first registers normally; the owner grants access to their exact email.
create function public.add_employee(p_email text, p_can_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare target auth.users;
begin
  if not public.is_owner() then raise exception 'Owner access required.'; end if;
  select * into target from auth.users where lower(email) = lower(trim(p_email)) and email_confirmed_at is not null;
  if not found then raise exception 'Ask the employee to register and confirm this email first.'; end if;
  if exists(select 1 from public.staff_members where user_id = target.id and removed_at is null)
    then raise exception 'This account is already a staff member.'; end if;
  insert into public.staff_members(user_id,email,role,active,can_approve)
    values(target.id,target.email,'employee',true,p_can_approve)
  on conflict(user_id) do update set active = true, can_approve = excluded.can_approve,
    removed_at = null, email = excluded.email;
  insert into public.audit_events(actor_id,action,details)
    values(auth.uid(),'employee_added',jsonb_build_object('employee_id',target.id,'can_approve',p_can_approve));
end $$;

-- Disable, enable, change approval permission, or remove an employee.
-- Owner accounts cannot be changed here; this prevents accidental owner lockout.
create function public.update_employee(p_user_id uuid, p_active boolean, p_can_approve boolean, p_remove boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'Owner access required.'; end if;
  update public.staff_members set active = case when p_remove then false else p_active end,
    can_approve = case when p_remove then false else p_can_approve end,
    removed_at = case when p_remove then now() else null end
    where user_id = p_user_id and role = 'employee' and removed_at is null;
  if not found then raise exception 'Employee not available.'; end if;
  insert into public.audit_events(actor_id,action,details)
    values(auth.uid(),case when p_remove then 'employee_removed' else 'employee_updated' end,
      jsonb_build_object('employee_id',p_user_id,'active',p_active,'can_approve',p_can_approve));
end $$;

revoke execute on function public.save_business_profile(text,text,text,text,text,text,text,boolean),
  public.add_employee(text,boolean), public.update_employee(uuid,boolean,boolean,boolean) from public, anon;
grant execute on function public.save_business_profile(text,text,text,text,text,text,text,boolean),
  public.add_employee(text,boolean), public.update_employee(uuid,boolean,boolean,boolean) to authenticated;
commit;
