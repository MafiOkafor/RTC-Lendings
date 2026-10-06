-- Run the numbered SQL files in order in a NEW Supabase project's SQL editor.
-- Existing Auth accounts and the existing public website are not removed.
begin;

-- Business identity and application launch controls. Automatic late charges stay off.
create table public.business_profile (
  id integer primary key check (id = 1),
  name text not null default 'RTC Lendings',
  registration_number text not null default '',
  credit_provider_number text not null default '',
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  privacy_notice text not null default '',
  applications_open boolean not null default false,
  currency text not null default 'ZAR' check (currency = 'ZAR'),
  timezone text not null default 'Africa/Johannesburg',
  late_interest_enabled boolean not null default false check (not late_interest_enabled),
  updated_at timestamptz not null default now()
);
insert into public.business_profile (id) values (1);

-- Staff access is separate from customer profiles. Removal retains the audit trail.
create table public.staff_members (
  user_id uuid primary key references auth.users(id),
  email text not null,
  role text not null check (role in ('owner', 'employee')),
  active boolean not null default true,
  can_approve boolean not null default false,
  removed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Customer-supplied profile. Financial figures are monthly amounts in rand.
create table public.customer_profiles (
  user_id uuid primary key references auth.users(id),
  full_name text not null check (length(trim(full_name)) between 2 and 150),
  email text not null,
  phone text not null check (length(trim(phone)) between 7 and 30),
  address text not null check (length(trim(address)) between 5 and 500),
  employment text not null check (employment in ('employed','self_employed','other')),
  monthly_income numeric(14,2) not null check (monthly_income > 0),
  living_expenses numeric(14,2) not null check (living_expenses >= 0),
  debt_payments numeric(14,2) not null check (debt_payments >= 0),
  updated_at timestamptz not null default now()
);

-- One application retains its submitted profile and accepted contract snapshots.
create table public.loan_applications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(user_id),
  requested_amount numeric(14,2) not null check (requested_amount > 0),
  requested_months integer not null check (requested_months between 1 and 60),
  purpose text not null check (length(trim(purpose)) between 3 and 500),
  profile_snapshot jsonb not null,
  privacy_snapshot text not null,
  consent_at timestamptz not null default now(),
  status text not null default 'submitted' check (status in (
    'submitted','affordability','documents','review','approved','rejected',
    'agreement_accepted','disbursed','completed'
  )),
  assessment_notes text,
  rejection_reason text,
  principal numeric(14,2),
  contractual_interest numeric(14,2),
  total_fees numeric(14,2),
  total_repayable numeric(14,2),
  repayment_count integer,
  first_due_date date,
  agreement_text text,
  agreement_accepted_at timestamptz,
  disbursed_at timestamptz,
  disbursement_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index loan_applications_customer on public.loan_applications(customer_id);
create unique index one_open_application on public.loan_applications(customer_id)
  where status not in ('rejected', 'completed');

-- Staff-visible affordability evidence; approval must not rely only on a ratio.
create table public.affordability_assessments (
  application_id uuid primary key references public.loan_applications(id),
  verified_income numeric(14,2) not null check (verified_income > 0),
  verified_expenses numeric(14,2) not null check (verified_expenses >= 0),
  verified_debt numeric(14,2) not null check (verified_debt >= 0),
  credit_checks_completed boolean not null check (credit_checks_completed),
  notes text not null check (length(trim(notes)) >= 10),
  assessed_by uuid not null references auth.users(id),
  assessed_at timestamptz not null default now()
);

-- Files live in a private Storage bucket; this table holds review metadata only.
create table public.application_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.loan_applications(id),
  kind text not null check (kind in ('identity','income','bank_statement')),
  storage_path text unique not null,
  original_name text not null,
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  review_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Instalments and an append-only payment ledger are the balance source of truth.
create table public.repayment_schedule (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.loan_applications(id),
  sequence integer not null,
  due_date date not null,
  amount numeric(14,2) not null check (amount > 0),
  unique(application_id, sequence)
);
create table public.loan_payments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.loan_applications(id),
  amount numeric(14,2) not null check (amount > 0),
  paid_on date not null,
  reference text not null check (length(trim(reference)) between 3 and 120),
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(application_id, reference)
);
create table public.audit_events (
  id bigint generated always as identity primary key,
  application_id uuid references public.loan_applications(id),
  actor_id uuid references auth.users(id),
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
commit;
