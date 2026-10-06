# RTC Lendings

South African lending workflow, with amounts in ZAR and dates in Africa/Johannesburg.
Open index.html with VS Code Live Server. Start with SETUP.md to install the Supabase database.

## Editing guide

Every page has its own HTML and matching JavaScript file. Sections have guide comments.

| Area | Pages | CSS | JavaScript |
| --- | --- | --- | --- |
| Public | index.html | css/home.css | js/home.js |
| Customer | customer/dashboard.html, profile.html, apply.html, documents.html, loan.html | customer/css/customer.css | Matching files under customer/js/ |
| Owner and staff | admin/dashboard.html, business.html, interest.html, employees.html, clients.html, client.html, application.html | admin/css/admin.css | Matching files under admin/js/ |
| Authentication | customer/login.html, register.html; admin/login.html | The corresponding portal CSS | Matching login.js and register.js |

Shared colours/navigation are in css/shared.css. Shared portal tables/forms are in css/portal-components.css.
The Supabase connection stays in js/supabase.js; js/config.local.js contains only public credentials and is ignored by Git.
Shared session, data and statement helpers are separate small files under js/.

The staff application page splits its sections into application-review.js, application-interest.js, application-documents.js and application-payments.js.
Edit the corresponding section instead of reading one large script.

## Workflow

Register → complete profile → submit → affordability assessment → document verification → review → approve/reject → accept agreement → record disbursement → record repayments → complete loan.

## Permissions

Owner: business settings, add/disable/remove employees, set individual approval permission, review applications, approve/reject, record disbursements and payments.
Active employee: view clients and loans, assess affordability, verify documents, record payments. Approval/rejection requires the owner's explicit permission.
Customer: own profile, applications, private documents, agreements and statements only.

Employee removal removes staff access; Auth accounts and audit records remain. Employees register and confirm an email before the owner adds them.

## Current boundaries

- Owner-configured interest defaults are on admin/interest.html. Regular monthly rates and daily overdue rules are versioned and copied into each approved agreement.
- Contractual interest is calculated using the owner’s monthly simple rate on original principal. Fees are entered separately. Approvers must preview the owner’s current policy; they cannot type an arbitrary interest amount.
- Affordability and document checks are manual staff workflows, not bureau/OCR integrations.
- Disbursement and repayment actions record actual external transfers; they do not move money.
- Ledgers are append-only. Payment corrections and reversals require a reviewed administrator procedure; no delete-payment UI is provided.
- Lists show up to 100 latest/matching records. The client directory supports name search; large-scale pagination is future work.
- No live database setup, bank transfer, production deployment, Git commit or push is performed by these source changes.

## References

- Supabase database functions: https://supabase.com/docs/guides/database/functions
- Supabase row-level security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase private storage: https://supabase.com/docs/guides/storage/buckets/fundamentals

## Interest tests

Run npm ci and npm test for isolated legacy-compatibility and interest-policy database checks. They do not connect to the live project.
