// Read-only statement components shared by customer and staff loan pages.
import { $, money, label, table, element } from './ui.js';
import { policySummary } from './interest-view.js';
export function renderLoan({ loan, statement, payments, events }) {
  $('[data-loan-title]').textContent = `Application ${loan.id.slice(0, 8)}`;
  $('[data-loan-status]').textContent = label(loan.status);
  $('[data-request]').textContent = `${money(loan.requested_amount)} over ${loan.requested_months} months — ${loan.purpose}`;
  $('[data-balance]').textContent = money(statement.outstanding);
  $('[data-overdue]').textContent = money(statement.overdue);
  $('[data-days-late]').textContent = `${statement.days_late} days late`;
  $('[data-paid]').textContent = money(statement.paid);
  $('[data-interest]').textContent = money(loan.contractual_interest);
  // Applied terms stay visible to both the borrower and authorised staff.
  $('[data-late-interest]').textContent = money(statement.late_interest);
  $('[data-daily-interest]').textContent = money(statement.late_interest_today_estimate);
  $('[data-interest-policy]').textContent = policySummary(loan.interest_policy);
  $('[data-interest-note]').textContent = statement.late_interest_enabled
    ? `Late interest is included for completed days. Today's estimate can change with payments. Lifetime cap remaining: ${money(statement.late_interest_cap_remaining)}.`
    : 'No automatic late-interest charges apply to this loan.';
  table('[data-interest-charges]', ['Date', 'Calculation base', 'Daily charge'],
    (statement.interest_charges || []).slice(-100).reverse().map(row => [row.date, money(row.basis), money(row.amount)]));
  $('[data-as-of]').textContent = `Balances as of ${statement.as_of} (Johannesburg).`;
  $('[data-rejection]').textContent = loan.rejection_reason || '';
  $('[data-agreement]').textContent = loan.agreement_text || 'An agreement will appear after approval.';
  $('[data-terms]').textContent = loan.total_repayable == null ? 'No offer yet.'
    : `Principal ${money(loan.principal)} · Contractual interest ${money(loan.contractual_interest)} · Fees ${money(loan.total_fees)} · Total ${money(loan.total_repayable)} · ${loan.repayment_count} monthly repayments · First due ${loan.first_due_date}`;

  // The database allocates payments to the oldest instalment first.
  table('[data-schedule]', ['Instalment', 'Due date', 'Amount', 'Remaining'],
    statement.schedule.map(row => [row.sequence, row.due_date, money(row.amount), money(row.remaining)]));
  table('[data-payments]', ['Payment date', 'Amount', 'Reference'],
    payments.map(row => [row.paid_on, money(row.amount), row.reference]));
  $('[data-history]').replaceChildren(...events.map(event => element('li',
    `${new Date(event.created_at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })} — ${label(event.action)}`)));
}
