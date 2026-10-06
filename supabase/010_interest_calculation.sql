-- Daily calculation uses the loan's agreed policy, never the latest business setting.
begin;
create schema if not exists rtc_private;
revoke all on schema rtc_private from public, anon, authenticated;
create index loan_payments_date on public.loan_payments(application_id,paid_on);

-- Replay payment dates and completed days. This is deterministic, with no browser
-- clock and no repeated daily job that could accidentally charge a day twice.
create function rtc_private.calculate_account(p_id uuid, p_as_of date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  loan public.loan_applications; rules jsonb; pay record; day date; first_day date;
  contract_paid numeric := 0; late_paid numeric := 0; paid numeric := 0;
  accrued numeric := 0; overpaid numeric := 0; amount_left numeric; applied numeric;
  due_total numeric; eligible numeric; basis numeric; daily_rate numeric := 0;
  charge numeric := 0; today_estimate numeric := 0; cap numeric := 0;
  grace integer := 0; enabled boolean := false; earliest date; late_earliest date;
  schedule jsonb; charges jsonb := '[]'::jsonb; overdue numeric;
begin
  select * into loan from public.loan_applications where id = p_id;
  if not found then raise exception 'Application not available.'; end if;
  rules := loan.interest_policy;
  enabled := coalesce((rules->>'late_enabled')::boolean,false);
  if enabled then
    grace := (rules->>'grace_days')::integer;
    daily_rate := (rules->>'late_rate')::numeric / 100 /
      case rules->>'rate_period' when 'annual' then 365 when 'monthly' then 30 else 1 end;
    cap := least((rules->>'cap_amount')::numeric, round(loan.principal * (rules->>'cap_percent')::numeric / 100,2));
  end if;

  -- No charges or balance are due until the loan has actually been disbursed.
  first_day := (loan.disbursed_at at time zone 'Africa/Johannesburg')::date;
  if first_day is not null and first_day <= p_as_of then
    day := first_day;
    while day <= p_as_of loop
      -- Payments count before that day's interest. Contract instalments are paid
      -- oldest first, then accrued late interest. Excess is rejected by the caller.
      for pay in select amount from public.loan_payments where application_id = p_id and paid_on = day order by created_at,id loop
        paid := paid + pay.amount;
        applied := least(pay.amount,greatest(0,loan.total_repayable - contract_paid));
        contract_paid := contract_paid + applied;
        amount_left := pay.amount - applied;
        applied := least(amount_left,greatest(0,accrued - late_paid));
        late_paid := late_paid + applied;
        overpaid := overpaid + amount_left - applied;
      end loop;

      -- Grace applies to each instalment; no catch-up charges for grace days.
      select coalesce(sum(amount),0) into due_total from public.repayment_schedule
        where application_id = p_id and due_date + grace < day;
      eligible := greatest(0,due_total - contract_paid);
      charge := 0;
      if enabled and eligible > 0 and accrued < cap then
        basis := case rules->>'calculation_basis'
          when 'overdue_principal' then eligible * loan.principal / loan.total_repayable
          when 'outstanding_principal' then (loan.total_repayable - contract_paid) * loan.principal / loan.total_repayable
          else eligible end;
        -- Compound mode adds only unpaid prior late interest, not amounts paid.
        if rules->>'interest_method' = 'compound' then basis := basis + accrued - late_paid; end if;
        charge := greatest(0,least(round(basis * daily_rate,2),cap - accrued));
      end if;

      if day < p_as_of and charge > 0 then
        accrued := accrued + charge;
        charges := charges || jsonb_build_array(jsonb_build_object('date',day,'amount',charge,'basis',round(basis,2)));
      elsif day = p_as_of then
        -- Today's charge is a projection; only completed days enter the balance.
        today_estimate := charge;
      end if;
      day := day + 1;
    end loop;
  end if;

  -- Display the remaining scheduled debt and oldest unpaid due date.
  with allocated as (
    select sequence,due_date,amount,greatest(0,least(amount,
      sum(amount) over(order by sequence) - contract_paid)) as remaining
    from public.repayment_schedule where application_id = p_id
  ) select coalesce(jsonb_agg(to_jsonb(allocated) order by sequence),'[]'::jsonb),
    coalesce(sum(remaining) filter(where due_date < p_as_of),0),
    min(due_date) filter(where due_date < p_as_of and remaining > 0)
  into schedule,overdue,earliest from allocated;
  with late_rows as (
    select (entry->>'date')::date as charged_on,
      sum((entry->>'amount')::numeric) over(order by entry->>'date') as running
    from jsonb_array_elements(charges) entry
  ) select min(charged_on) into late_earliest from late_rows where running > late_paid;
  earliest := least(earliest,late_earliest);

  return jsonb_build_object('total_repayable',loan.total_repayable,'paid',paid,
    'outstanding',case when first_day is null then 0 else loan.total_repayable - contract_paid + accrued - late_paid end,
    'overdue',overdue + accrued - late_paid,'days_late',coalesce(p_as_of - earliest,0),
    'contractual_interest',loan.contractual_interest,'total_fees',loan.total_fees,
    'late_interest',accrued - late_paid,'late_interest_accrued',accrued,'late_interest_paid',late_paid,
    'late_interest_today_estimate',today_estimate,'late_interest_enabled',enabled,
    'late_interest_cap',cap,'late_interest_cap_remaining',greatest(0,cap - accrued),
    'interest_policy',rules,'interest_charges',charges,'overpaid',overpaid,'as_of',p_as_of,'schedule',schedule);
end $$;
revoke all on function rtc_private.calculate_account(uuid,date) from public,anon,authenticated;
commit;
