# Supabase setup

The public connection configuration is already present on this machine. It cannot install database objects or grant owner access.
Never put a service-role key, database password or secret key into website JavaScript.

## Interest upgrade for an already installed database

If you installed the original lending database, run only supabase/009_interest_policies.sql, 010_interest_calculation.sql and 011_interest_workflow.sql in that order. The supplied RTC-Lendings-Interest-Upgrade.sql combines those three steps into one transaction. Do not run both forms of the upgrade or rerun the original installation.

Then sign in as owner, open Interest and save the desired rules. New approvals require an owner-configured policy. Existing approved loans remain unchanged.

## 1. First installation only

In your Supabase project's SQL Editor, run the files below one at a time, in order:

1. supabase/001_tables.sql — business, staff, profiles, applications and ledger tables.
2. supabase/002_permissions.sql — row-level security and read permissions.
3. supabase/003_customer_actions.sql — profile, application and agreement actions.
4. supabase/004_review_actions.sql — assessment, document gates and approval actions.
5. supabase/005_money_actions.sql — disbursement, repayments and server-calculated statements.
6. supabase/006_owner_actions.sql — business and employee management.
7. supabase/007_private_documents.sql — private document storage and verification.
8. supabase/009_interest_policies.sql — owner rate settings and offer previews.
9. supabase/010_interest_calculation.sql — daily calculation.
10. supabase/011_interest_workflow.sql — loan and repayment integration.

These are first-install scripts, not rerunnable migrations. Each is transactional. If one fails, stop and inspect its error; do not delete existing objects or rerun earlier successful files. Existing Auth accounts are retained. Do not run against an existing lending schema without reviewing name collisions first.

## 2. Set the first owner

Register your own email on customer/register.html and confirm the email.
Open supabase/008_set_owner.sql.example, replace OWNER_EMAIL_HERE with your exact confirmed email and execute the block in the Supabase SQL Editor.
Only an administrator in the Supabase dashboard can perform this step. The first person to register is never automatically made owner.
Sign in through admin/login.html afterward.

## 3. Configure and test the business

Open Business in the staff portal. Set contact information, registration details and a reviewed privacy notice. Then open Interest to set the regular monthly rate and optional overdue-interest rules. No default commercial rate is supplied.
Keep applications closed while testing. Use a test environment/accounts and synthetic documents for the initial full workflow.
Configure Supabase Auth Site URL and allowed redirect URLs for your Live Server origin and later production origin; confirm email links lead back to this site.

## 4. Add an employee

Have the employee register and confirm their own email. Add that email under Employees.
All active employees can record payments. Enable Allow loan approvals and rejections only for employees who should make those decisions.
Disable access to suspend an employee. Remove revokes staff membership while retaining their financial audit history.

## 5. Verify the complete workflow

Test with separate owner, employee and customer accounts, using separate browser profiles or private windows:

- Customer A cannot read Customer B's profile, files or loans.
- Disabled/removed employees cannot read client data or record payments.
- An employee without approval permission cannot approve or reject.
- Assessment and document verification must finish before approval.
- An approved agreement must be accepted by its borrower before owner disbursement recording.
- Duplicate payment references and payments exceeding the balance fail.
- Partial repayments reduce the oldest instalment first; full repayment completes the loan.
- Interest settings can only be changed by the owner.
- Existing agreements retain their original policy after defaults change.
- Daily simple/compound charges obey the agreed basis, grace period and both caps.
- Today’s estimated charge is separate from completed-day charges.
- Final repayment includes any accrued unpaid late interest.

## Deployment details

Serve via HTTP locally and HTTPS in production. The deployment must provide js/config.local.js with ONLY the public project URL and publishable/anon key because Git ignores that file.
The Supabase browser SDK currently loads from jsDelivr v2 and requires internet access; pin a tested version before production.
Only the application owner and authorised staff may access the private loan-documents bucket. It accepts PDF/JPEG/PNG up to 10 MB. Files are downloaded through authenticated requests, not permanent public URLs.

## Limits requiring follow-up

The live project still needs these scripts installed and real Auth/Storage integration testing. No bureau checks, bank integrations, automated document authenticity checks, legal contract generation, payment reversals or email notifications are included.
An expired accepted offer must be reviewed before any transfer; the system blocks disbursement when its first due date has passed. Replacement/revised agreements require a separate workflow before production use.
