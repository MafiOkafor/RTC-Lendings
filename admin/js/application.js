// Staff application detail: display the statement and load stage-specific actions.
import { session } from '../../js/session.js';
import { loanBundle, recordId } from '../../js/data.js';
import { renderLoan } from '../../js/loan-view.js';
import { $, showPage, report, table, money, label } from '../../js/ui.js';
import { bindReview } from './application-review.js';
import { renderDocuments } from './application-documents.js';
import { bindPayments } from './application-payments.js';

async function initialize() {
  const context = await session('staff');
  if (!context) return;
  const bundle = await loanBundle(context.client, recordId());
  renderLoan(bundle);
  const profile = bundle.loan.profile_snapshot;
  $('[data-client-link]').href = `client.html?id=${bundle.loan.customer_id}`;
  table('[data-submitted-profile]', ['Submitted detail', 'Value'], [
    ['Name', profile.full_name], ['Email', profile.email], ['Phone', profile.phone],
    ['Address', profile.address], ['Employment', label(profile.employment)],
    ['Monthly income', money(profile.monthly_income)], ['Living expenses', money(profile.living_expenses)],
    ['Existing debt payments', money(profile.debt_payments)],
  ]);

  // Each workflow section has a small dedicated behavior file.
  bindReview(context, bundle.loan);
  renderDocuments(context, bundle);
  bindPayments(context, bundle.loan);
  showPage();
}
initialize().catch(report);
