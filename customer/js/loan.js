// Customer loan: current stage, agreement, statement and repayments.
import { session } from '../../js/session.js';
import { loanBundle, recordId, rpc } from '../../js/data.js';
import { renderLoan } from '../../js/loan-view.js';
import { $, showPage, report, bindForm } from '../../js/ui.js';

async function initialize() {
  const context = await session();
  if (!context) return;
  const id = recordId();
  const bundle = await loanBundle(context.client, id);
  renderLoan(bundle);
  $('[data-documents-link]').href = `documents.html?id=${id}`;
  $('[data-accept]').hidden = bundle.loan.status !== 'approved';
  showPage();

  // The database records acceptance against the immutable approved agreement.
  bindForm('[data-accept]', async fields => {
    await rpc(context.client, 'accept_agreement', { p_id: id, p_consent: fields.get('accept') === 'on' });
    window.location.reload();
  });
}
initialize().catch(report);
