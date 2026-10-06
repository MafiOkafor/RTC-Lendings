# Owner-configured interest rules

## Who controls the settings

The owner sets rules on admin/interest.html. Active employees can read the rules and preview offers if allowed to approve, but cannot edit rates or caps.
Every save creates a new immutable version. An approved loan stores a copy of the version and appends its terms to the accepted agreement. Changing defaults never reprices existing loans.
Loans approved before this upgrade keep their original contractual amounts and receive no automatic late-interest policy.

## Regular interest

The owner sets a monthly percentage. Regular contractual interest is simple and flat on original principal: principal × monthly percentage / 100 × number of months, rounded to cents once.
Staff enter principal, total fees, repayment count and first due date, then request a server preview. Approval requires the exact policy version previewed. The database rejects a stale version or an unaffordable proposed instalment.

## Daily overdue interest

The owner can enable or disable overdue interest for newly approved loans and choose:

- Rate and period: daily, monthly or annual. The daily nominal rate is rate / 100, additionally divided by 30 for a monthly rate or 365 for an annual rate.
- Basis: unpaid instalments after grace; the principal portion of those instalments; or all unpaid principal while an instalment is overdue beyond grace.
- Method: simple, or daily compound including unpaid prior late interest.
- Grace period: 0–365 calendar days for each instalment. Accrual starts the following day, without retroactive charges for grace days.
- Lifetime caps: an absolute rand amount and percentage of original principal. Both are required when enabled; the lower limit applies. Payments never replenish a loan's cap.

Daily charges are rounded to two decimals and clamped to the remaining cap. Business dates use Africa/Johannesburg. Only completed days are included in a statement balance; today's estimate is separate and may change if a payment arrives today.
For example, when an instalment is due on 1 June and grace is two days, the first chargeable day is 4 June. That completed day's charge appears in the 5 June balance.

## Payments and principal allocation

The implementation retains the existing schedule model: payments reduce scheduled contractual debt in oldest-instalment order, then accrued late interest. The principal portion of scheduled debt is proportional to original principal / total contractual repayment. These are explicit product assumptions, not a regulatory determination of payment allocation.
Each statement replays actual payment dates before the day's charge. Backdated payments recalculate affected days; a payment that would exceed the debt at its payment date is rejected transactionally, including when it conflicts with later payments already recorded.
Once all scheduled debt is cleared, no new late interest is charged, including on a remaining late-interest-only balance. A loan completes only when both scheduled debt and accrued late interest are settled.
Statements are derived on the server; no background task or open browser is needed for elapsed-day calculations. A live open page must be refreshed to show the latest statement.

## Scope of the caps

These are owner-configured business caps on late interest, not an automated implementation of every South African credit limit. In particular, section 103(5) addresses aggregate specified charges during default, not only a separately labelled late-interest amount. Product-specific rate limits, fee limits, allocation of repayments and contract wording must be reviewed before live use.

Primary references:
- National Credit Act: https://www.gov.za/documents/national-credit-act
- NCR circular on charges and section 103(5): https://ncr.org.za/documents/Circulars/Circular%206of%202023-%20Emoulument%20Attachment%20Orders.pdf
- Interest-rate regulations by credit category: https://www.gov.za/sites/default/files/gcis_document/201511/39379gon1080.pdf

## Database files

- 009_interest_policies.sql: owner policy versions, save action and offer preview.
- 010_interest_calculation.sql: private date-by-date interest and payment calculation.
- 011_interest_workflow.sql: rate-based approval, statement integration and payment completion.

The legacy business_profile.late_interest_enabled flag remains for schema compatibility; only the loan's stored interest_policy governs accrual.
