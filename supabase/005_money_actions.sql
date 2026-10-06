begin;
-- Disbursement is a record of an external bank transfer, not a bank integration.
-- Only the owner may record it, after the customer has accepted the agreement.
create function public.record_disbursement(p_id uuid, p_reference text) returns void
language plpgsql security definer set search_path = '' as $$
declare loan public.loan_applications; i integer; cents numeric;
begin
  if not public.is_owner() then raise exception 'Owner access required.'; end if;
  select * into loan from public.loan_applications where id = p_id for update;
  if not found or loan.status <> 'agreement_accepted' then raise exception 'The customer must accept the agreement first.'; end if;
  if p_reference is null or length(trim(p_reference)) not between 3 and 120 then raise exception 'Enter the bank transfer reference.'; end if;
  if loan.first_due_date <= (now() at time zone 'Africa/Johannesburg')::date
    then raise exception 'The first repayment date has passed. Do not disburse this expired offer.'; end if;
  cents := loan.total_repayable * 100;
  for i in 1..loan.repayment_count loop
    insert into public.repayment_schedule(application_id, sequence, due_date, amount)
    values(p_id, i, (loan.first_due_date + make_interval(months => i - 1))::date,
      (floor(cents / loan.repayment_count) + case when i <= mod(cents, loan.repayment_count) then 1 else 0 end) / 100);
  end loop;
  update public.loan_applications set status = 'disbursed', disbursed_at = now(),
    disbursement_reference = trim(p_reference), updated_at = now() where id = p_id;
  insert into public.audit_events(application_id, actor_id, action)
    values(p_id, auth.uid(), 'disbursement_recorded');
end $$;

-- Owner and active employees may record money actually received.
-- Row locking prevents simultaneous payments from overpaying a loan.
create function public.record_payment(p_id uuid, p_amount numeric, p_paid_on date, p_reference text)
returns void language plpgsql security definer set search_path = '' as $$
declare loan public.loan_applications; paid numeric;
begin
  if not public.is_staff() then raise exception 'Staff access required.'; end if;
  select * into loan from public.loan_applications where id = p_id for update;
  if not found or loan.status <> 'disbursed' then raise exception 'This loan is not accepting repayments.'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) or
    p_amount::text in ('NaN','Infinity','-Infinity') or p_paid_on is null or
    p_paid_on > (now() at time zone 'Africa/Johannesburg')::date or
    p_paid_on < (loan.disbursed_at at time zone 'Africa/Johannesburg')::date
    then raise exception 'Enter a valid payment amount and date.'; end if;
  select coalesce(sum(amount),0) into paid from public.loan_payments where application_id = p_id;
  if p_amount > loan.total_repayable - paid then raise exception 'Payment exceeds the outstanding balance.'; end if;
  insert into public.loan_payments(application_id, amount, paid_on, reference, recorded_by)
    values(p_id, p_amount, p_paid_on, upper(trim(p_reference)), auth.uid());
  update public.loan_applications set
    status = case when paid + p_amount = total_repayable then 'completed' else 'disbursed' end,
    updated_at = now() where id = p_id;
  insert into public.audit_events(application_id, actor_id, action, details)
    values(p_id, auth.uid(), 'payment_recorded', jsonb_build_object('amount',p_amount));
  if paid + p_amount = loan.total_repayable then
    insert into public.audit_events(application_id, actor_id, action) values(p_id, auth.uid(), 'loan_completed');
  end if;
end $$;

-- Produce balances on the database, using Johannesburg's date and FIFO allocation.
-- Late interest is explicitly zero until reviewed rules have been implemented.
create function public.loan_statement(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare loan public.loan_applications; paid numeric; overdue numeric; earliest date; schedule jsonb;
  today date := (now() at time zone 'Africa/Johannesburg')::date;
begin
  if not public.can_read_application(p_id) then raise exception 'Application not available.'; end if;
  select * into loan from public.loan_applications where id = p_id;
  select coalesce(sum(amount),0) into paid from public.loan_payments where application_id = p_id;
  with allocated as (
    select sequence, due_date, amount, greatest(0, least(amount,
      sum(amount) over(order by sequence) - paid)) as remaining
    from public.repayment_schedule where application_id = p_id
  ) select coalesce(jsonb_agg(to_jsonb(allocated) order by sequence),'[]'::jsonb),
    coalesce(sum(remaining) filter(where due_date < today),0),
    min(due_date) filter(where due_date < today and remaining > 0)
  into schedule, overdue, earliest from allocated;
  return jsonb_build_object('total_repayable',loan.total_repayable,'paid',paid,
    'outstanding', case when loan.status in ('disbursed','completed') then loan.total_repayable - paid else 0 end,
    'overdue',overdue,'days_late',coalesce(today - earliest,0),
    'contractual_interest',loan.contractual_interest,'total_fees',loan.total_fees,
    'late_interest',0,'late_interest_enabled',false,'as_of',today,'schedule',schedule);
end $$;

revoke execute on function public.record_disbursement(uuid,text),
  public.record_payment(uuid,numeric,date,text), public.loan_statement(uuid) from public, anon;
grant execute on function public.record_disbursement(uuid,text),
  public.record_payment(uuid,numeric,date,text), public.loan_statement(uuid) to authenticated;
commit;
