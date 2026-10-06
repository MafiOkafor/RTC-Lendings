// Assessment, approval and rejection controls for application.html only.
import { rpc } from '../../js/data.js';
import { $, bindForm } from '../../js/ui.js';
import { prepareOffer } from './application-interest.js';

export function bindReview({ client, staff }, loan) {
  const offerPolicyId = prepareOffer(client);
  const approve = staff.role === 'owner' || staff.can_approve;
  $('[data-start]').hidden = loan.status !== 'submitted';
  $('[data-assessment]').hidden = loan.status !== 'affordability';
  $('[data-finish-documents]').hidden = loan.status !== 'documents';
  $('[data-approve]').hidden = loan.status !== 'review' || !approve;
  $('[data-reject]').hidden = !approve || !['submitted','affordability','documents','review','approved'].includes(loan.status);

  // Save verified figures and a record of the manual affordability checks.
  bindForm('[data-start]', async () => {
    await rpc(client, 'start_assessment', { p_id: loan.id }); window.location.reload();
  });
  bindForm('[data-assessment]', async fields => {
    await rpc(client, 'assess_affordability', {
      p_id: loan.id, p_income: fields.get('income'), p_expenses: fields.get('expenses'),
      p_debt: fields.get('debt'), p_credit_checked: fields.get('credit_checked') === 'on', p_notes: fields.get('notes'),
    });
    window.location.reload();
  });
  bindForm('[data-finish-documents]', async () => {
    await rpc(client, 'finish_document_review', { p_id: loan.id }); window.location.reload();
  });

  // Offer values and the full agreement are retained for customer acceptance.
  bindForm('[data-approve]', async fields => {
    await rpc(client, 'approve_loan_with_policy', {
      p_id: loan.id, p_principal: fields.get('principal'), p_policy_id: offerPolicyId(),
      p_fees: fields.get('fees'), p_count: Number(fields.get('count')),
      p_first_due: fields.get('first_due'), p_agreement: fields.get('agreement'),
    });
    window.location.reload();
  });
  bindForm('[data-reject]', async fields => {
    await rpc(client, 'reject_application', { p_id: loan.id, p_reason: fields.get('reason') });
    window.location.reload();
  });
}
