begin;
-- A previewed policy version is required, so changing defaults cannot silently
-- change the terms being approved by another staff member at the same time.
create function public.approve_loan_with_policy(p_id uuid, p_principal numeric, p_fees numeric,
  p_count integer, p_first_due date, p_agreement text, p_policy_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare loan public.loan_applications; assessment public.affordability_assessments;
  quote jsonb; policy jsonb; total numeric; terms text;
begin
  if not public.can_approve_loans() then raise exception 'Loan approval permission required.'; end if;
  select * into loan from public.loan_applications where id = p_id for update;
  if not found or loan.status <> 'review' then raise exception 'Complete review before approval.'; end if;
  if loan.customer_id = auth.uid() then raise exception 'A different authorised staff member must approve this application.'; end if;
  quote := public.quote_loan(p_principal,p_count,p_fees);
  policy := quote->'policy';
  if p_policy_id is distinct from (policy->>'id')::bigint then raise exception 'Interest settings changed. Preview the offer again.'; end if;
  if p_principal > loan.requested_amount or p_first_due is null or
    p_first_due <= (now() at time zone 'Africa/Johannesburg')::date or
    p_agreement is null or length(trim(p_agreement)) < 100 then raise exception 'Enter complete, valid agreement terms.'; end if;
  total := (quote->>'total')::numeric;
  select * into assessment from public.affordability_assessments where application_id = p_id;
  if not found or (quote->>'maximum_instalment')::numeric >
    assessment.verified_income - assessment.verified_expenses - assessment.verified_debt
    then raise exception 'The proposed monthly repayment exceeds verified disposable income.'; end if;
  if floor(total * 100 / p_count) < 1 then raise exception 'Instalments must be at least one cent.'; end if;

  -- Store the system-calculated terms with the agreement the customer accepts.
  terms := format(E'\n\nINTEREST TERMS (policy %s)\nRegular interest: %s%% per month, simple on original principal for %s months. Total contractual interest: R%s.',
    policy->>'id',policy->>'regular_monthly_rate',p_count,quote->>'interest');
  if (policy->>'late_enabled')::boolean then
    terms := terms || format(E'\nLate interest: %s%% %s, %s daily calculation, basis %s. Grace: %s calendar days per instalment. Lifetime cap: lower of R%s and %s%% of original principal. Monthly rates divide by 30; annual rates by 365. Completed days only, rounded to cents daily. Payments reduce scheduled debt first, then late interest. Principal components are allocated proportionally across scheduled debt.',
      policy->>'late_rate',policy->>'rate_period',policy->>'interest_method',policy->>'calculation_basis',
      policy->>'grace_days',policy->>'cap_amount',policy->>'cap_percent');
  else terms := terms || E'\nAutomatic late interest is disabled for this loan.'; end if;
  update public.loan_applications set principal = p_principal, contractual_interest = (quote->>'interest')::numeric,
    total_fees = p_fees,total_repayable = total,repayment_count = p_count,first_due_date = p_first_due,
    agreement_text = trim(p_agreement) || terms,interest_policy = policy,status = 'approved',updated_at = now()
    where id = p_id;
  insert into public.audit_events(application_id,actor_id,action,details)
    values(p_id,auth.uid(),'loan_approved',jsonb_build_object('interest_policy_id',p_policy_id));
end $$;

-- Retire the old free-entry interest approval path. Existing loan records stay intact.
revoke execute on function public.approve_application(uuid,numeric,numeric,numeric,integer,date,text)
  from public,anon,authenticated;
revoke execute on function public.approve_loan_with_policy(uuid,numeric,numeric,integer,date,text,bigint) from public,anon;
grant execute on function public.approve_loan_with_policy(uuid,numeric,numeric,integer,date,text,bigint) to authenticated;

-- Customer and staff statements share the same server calculation and access check.
create or replace function public.loan_statement(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_read_application(p_id) then raise exception 'Application not available.'; end if;
  return rtc_private.calculate_account(p_id,(now() at time zone 'Africa/Johannesburg')::date);
end $$;

-- Replay after inserting a payment in this transaction, including backdated payments.
-- Any excess rolls back the insert; completing a loan includes accrued late interest.
create or replace function public.record_payment(p_id uuid,p_amount numeric,p_paid_on date,p_reference text)
returns void language plpgsql security definer set search_path = '' as $$
declare loan public.loan_applications; account jsonb;
begin
  if not public.is_staff() then raise exception 'Staff access required.'; end if;
  select * into loan from public.loan_applications where id = p_id for update;
  if not found or loan.status <> 'disbursed' then raise exception 'This loan is not accepting repayments.'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount,2) or
    p_amount::text in ('NaN','Infinity','-Infinity') or p_paid_on is null or
    p_paid_on > (now() at time zone 'Africa/Johannesburg')::date or
    p_paid_on < (loan.disbursed_at at time zone 'Africa/Johannesburg')::date
    then raise exception 'Enter a valid payment amount and date.'; end if;
  insert into public.loan_payments(application_id,amount,paid_on,reference,recorded_by)
    values(p_id,p_amount,p_paid_on,upper(trim(p_reference)),auth.uid());
  account := rtc_private.calculate_account(p_id,(now() at time zone 'Africa/Johannesburg')::date);
  if (account->>'overpaid')::numeric > 0 then raise exception 'Payment exceeds the balance at its payment date.'; end if;
  update public.loan_applications set status = case when (account->>'outstanding')::numeric = 0
    then 'completed' else 'disbursed' end,updated_at = now() where id = p_id;
  insert into public.audit_events(application_id,actor_id,action,details)
    values(p_id,auth.uid(),'payment_recorded',jsonb_build_object('amount',p_amount,'paid_on',p_paid_on));
  if (account->>'outstanding')::numeric = 0 then
    insert into public.audit_events(application_id,actor_id,action) values(p_id,auth.uid(),'loan_completed');
  end if;
end $$;
commit;
