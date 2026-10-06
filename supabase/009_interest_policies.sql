-- Owner-configured, versioned interest defaults. Apply after files 001–007.
begin;

-- Each save creates a new immutable version; existing agreements retain their copy.
create table public.interest_policies (
  id bigint generated always as identity primary key,
  regular_monthly_rate numeric(9,6) not null check (regular_monthly_rate between 0 and 100),
  late_enabled boolean not null,
  late_rate numeric(9,6) not null check (late_rate between 0 and 100),
  rate_period text not null check (rate_period in ('daily','monthly','annual')),
  calculation_basis text not null check (calculation_basis in ('overdue_instalments','overdue_principal','outstanding_principal')),
  interest_method text not null check (interest_method in ('simple','compound')),
  grace_days integer not null check (grace_days between 0 and 365),
  cap_amount numeric(14,2) not null check (cap_amount >= 0),
  cap_percent numeric(9,4) not null check (cap_percent between 0 and 100),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (not late_enabled or (late_rate > 0 and cap_amount > 0 and cap_percent > 0))
);
alter table public.interest_policies enable row level security;
revoke all on public.interest_policies from anon, authenticated;
grant select on public.interest_policies to authenticated;
create policy policy_staff_read on public.interest_policies for select to authenticated using(public.is_staff());
alter table public.loan_applications add column interest_policy jsonb;
comment on column public.business_profile.late_interest_enabled is
  'Legacy flag retained for compatibility. Versioned interest_policies control new loans.';

-- Only the owner can publish a version. Numeric bounds are software bounds,
-- not a claim that any selected rate is lawful for a particular credit product.
create function public.save_interest_policy(p_regular_rate numeric, p_enabled boolean,
  p_late_rate numeric, p_period text, p_basis text, p_method text, p_grace integer,
  p_cap_amount numeric, p_cap_percent numeric) returns bigint
language plpgsql security definer set search_path = '' as $$
declare version_id bigint;
begin
  if not public.is_owner() then raise exception 'Only the owner can set interest rules.'; end if;
  if p_regular_rate is null or p_late_rate is null or p_cap_amount is null or p_cap_percent is null or
    p_regular_rate::text in ('NaN','Infinity','-Infinity') or p_late_rate::text in ('NaN','Infinity','-Infinity') or
    p_cap_amount::text in ('NaN','Infinity','-Infinity') or p_cap_percent::text in ('NaN','Infinity','-Infinity')
    then raise exception 'Enter finite rates and caps.'; end if;
  insert into public.interest_policies(regular_monthly_rate,late_enabled,late_rate,rate_period,
    calculation_basis,interest_method,grace_days,cap_amount,cap_percent,created_by)
  values(p_regular_rate,p_enabled,p_late_rate,p_period,p_basis,p_method,p_grace,p_cap_amount,p_cap_percent,auth.uid())
  returning id into version_id;
  insert into public.audit_events(actor_id,action,details)
    values(auth.uid(),'interest_policy_published',jsonb_build_object('version',version_id));
  return version_id;
end $$;

-- Approval previews use the owner's regular monthly simple rate on original principal.
-- A flat contractual amount is disclosed; overdue interest is calculated separately.
create function public.quote_loan(p_principal numeric, p_count integer, p_fees numeric) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare rules public.interest_policies; interest numeric;
begin
  if not public.can_approve_loans() then raise exception 'Loan approval permission required.'; end if;
  if p_principal is null or p_count is null or p_fees is null or p_principal <= 0 or p_fees < 0 or
    p_count not between 1 and 60 or p_principal::text in ('NaN','Infinity','-Infinity') or
    p_fees::text in ('NaN','Infinity','-Infinity') or p_principal <> round(p_principal,2) or p_fees <> round(p_fees,2)
    then raise exception 'Enter a valid principal, term and fees.'; end if;
  select * into rules from public.interest_policies order by id desc limit 1;
  if not found then raise exception 'The owner must save interest settings before approving loans.'; end if;
  interest := round(p_principal * rules.regular_monthly_rate / 100 * p_count,2);
  return jsonb_build_object('policy',to_jsonb(rules),'interest',interest,
    'total',p_principal + interest + p_fees,'maximum_instalment',ceil((p_principal + interest + p_fees)*100/p_count)/100);
end $$;

revoke execute on function public.save_interest_policy(numeric,boolean,numeric,text,text,text,integer,numeric,numeric),
  public.quote_loan(numeric,integer,numeric) from public, anon;
grant execute on function public.save_interest_policy(numeric,boolean,numeric,text,text,text,integer,numeric,numeric),
  public.quote_loan(numeric,integer,numeric) to authenticated;
commit;
