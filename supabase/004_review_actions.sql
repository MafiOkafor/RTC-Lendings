begin;
-- Begin review and record verified affordability evidence as separate steps.
create function public.start_assessment(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Staff access required.'; end if;
  update public.loan_applications set status = 'affordability', updated_at = now()
    where id = p_id and status = 'submitted';
  if not found then raise exception 'This application is not awaiting assessment.'; end if;
  insert into public.audit_events(application_id, actor_id, action) values(p_id, auth.uid(), 'assessment_started');
end $$;

create function public.assess_affordability(p_id uuid, p_income numeric, p_expenses numeric,
  p_debt numeric, p_credit_checked boolean, p_notes text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Staff access required.'; end if;
  perform 1 from public.loan_applications where id = p_id and status = 'affordability' for update;
  if not found then raise exception 'Start the affordability assessment first.'; end if;
  if p_income is null or p_expenses is null or p_debt is null or
    p_income::text in ('NaN','Infinity','-Infinity') or p_expenses::text in ('NaN','Infinity','-Infinity') or
    p_debt::text in ('NaN','Infinity','-Infinity') or p_income - p_expenses - p_debt <= 0
    then raise exception 'Verified disposable income must be positive.'; end if;
  insert into public.affordability_assessments(application_id, verified_income, verified_expenses,
    verified_debt, credit_checks_completed, notes, assessed_by)
  values(p_id, p_income, p_expenses, p_debt, p_credit_checked, trim(p_notes), auth.uid());
  update public.loan_applications set status = 'documents', updated_at = now() where id = p_id;
  insert into public.audit_events(application_id, actor_id, action) values(p_id, auth.uid(), 'affordability_recorded');
end $$;

-- No application reaches review until all three required document types are verified.
create function public.finish_document_review(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Staff access required.'; end if;
  perform 1 from public.loan_applications where id = p_id and status = 'documents' for update;
  if not found then raise exception 'This application is not at document verification.'; end if;
  if (select count(distinct kind) from public.application_documents
    where application_id = p_id and status = 'verified') <> 3
    then raise exception 'Verify identity, income and bank statement documents first.'; end if;
  update public.loan_applications set status = 'review', updated_at = now() where id = p_id;
  insert into public.audit_events(application_id, actor_id, action) values(p_id, auth.uid(), 'documents_verified');
end $$;

-- Only the owner or an employee with explicit approval permission can make an offer.
-- Amounts come from a reviewed contract. This function does NOT invent interest rates.
create function public.approve_application(p_id uuid, p_principal numeric, p_interest numeric,
  p_fees numeric, p_count integer, p_first_due date, p_agreement text) returns void
language plpgsql security definer set search_path = '' as $$
declare loan public.loan_applications; assessment public.affordability_assessments; total numeric;
begin
  if not public.can_approve_loans() then raise exception 'Loan approval permission required.'; end if;
  select * into loan from public.loan_applications where id = p_id for update;
  if not found or loan.status <> 'review' then raise exception 'Complete review before approval.'; end if;
  if loan.customer_id = auth.uid() then raise exception 'A different authorised staff member must approve this application.'; end if;
  if p_principal is null or p_interest is null or p_fees is null or p_count is null or
    p_first_due is null or p_agreement is null or p_principal <= 0 or p_principal > loan.requested_amount or
    p_interest < 0 or p_fees < 0 or p_count not between 1 and 60 or
    p_principal::text in ('NaN','Infinity','-Infinity') or p_interest::text in ('NaN','Infinity','-Infinity') or
    p_fees::text in ('NaN','Infinity','-Infinity') or p_first_due <= (now() at time zone 'Africa/Johannesburg')::date or
    length(trim(p_agreement)) < 100 then raise exception 'Enter complete, valid agreement terms.'; end if;
  total := round(p_principal, 2) + round(p_interest, 2) + round(p_fees, 2);
  select * into assessment from public.affordability_assessments where application_id = p_id;
  if not found or ceil(total * 100 / p_count) / 100 >
    assessment.verified_income - assessment.verified_expenses - assessment.verified_debt
    then raise exception 'The proposed monthly repayment exceeds verified disposable income.'; end if;
  if floor(total * 100 / p_count) < 1 then raise exception 'Instalments must be at least one cent.'; end if;
  update public.loan_applications set principal = p_principal, contractual_interest = p_interest,
    total_fees = p_fees, total_repayable = total, repayment_count = p_count, first_due_date = p_first_due,
    agreement_text = trim(p_agreement), status = 'approved', updated_at = now() where id = p_id;
  insert into public.audit_events(application_id, actor_id, action) values(p_id, auth.uid(), 'loan_approved');
end $$;

-- A rejected application keeps its reason and history for the customer.
create function public.reject_application(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_approve_loans() then raise exception 'Loan approval permission required.'; end if;
  if p_reason is null or length(trim(p_reason)) < 5 then raise exception 'Provide a rejection reason.'; end if;
  update public.loan_applications set status = 'rejected', rejection_reason = trim(p_reason), updated_at = now()
    where id = p_id and status in ('submitted','affordability','documents','review','approved');
  if not found then raise exception 'This application cannot be rejected at its current stage.'; end if;
  insert into public.audit_events(application_id, actor_id, action) values(p_id, auth.uid(), 'loan_rejected');
end $$;

revoke execute on function public.start_assessment(uuid),
  public.assess_affordability(uuid,numeric,numeric,numeric,boolean,text),
  public.finish_document_review(uuid), public.approve_application(uuid,numeric,numeric,numeric,integer,date,text),
  public.reject_application(uuid,text) from public, anon;
grant execute on function public.start_assessment(uuid),
  public.assess_affordability(uuid,numeric,numeric,numeric,boolean,text),
  public.finish_document_review(uuid), public.approve_application(uuid,numeric,numeric,numeric,integer,date,text),
  public.reject_application(uuid,text) to authenticated;
commit;
