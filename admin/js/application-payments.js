// Money actions for application.html: record transfers and received repayments.
import { rpc } from '../../js/data.js';
import { $, bindForm, today } from '../../js/ui.js';

export function bindPayments({ client, staff }, loan) {
  $('[data-disburse]').hidden = staff.role !== 'owner' || loan.status !== 'agreement_accepted';
  $('[data-payment]').hidden = loan.status !== 'disbursed';
  $('[name=paid_on]').value = today();
  $('[name=paid_on]').max = today();

  // Confirm an external transfer already made by the owner.
  bindForm('[data-disburse]', async fields => {
    await rpc(client, 'record_disbursement', { p_id: loan.id, p_reference: fields.get('reference') });
    window.location.reload();
  });

  // Every active staff member can record payments; the database prevents overpayment.
  bindForm('[data-payment]', async fields => {
    await rpc(client, 'record_payment', {
      p_id: loan.id, p_amount: fields.get('amount'), p_paid_on: fields.get('paid_on'), p_reference: fields.get('reference'),
    });
    window.location.reload();
  });
}
