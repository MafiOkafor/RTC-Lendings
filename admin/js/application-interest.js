// Approval offer preview. Staff cannot type a different contractual interest amount.
import { rpc } from '../../js/data.js';
import { $, money, report } from '../../js/ui.js';
import { policySummary } from '../../js/interest-view.js';

export function prepareOffer(client) {
  const form = $('[data-approve]');
  const approve = form.querySelector('[data-confirm-offer]');
  const preview = form.querySelector('[data-preview-offer]');
  let policyId = null;

  // Changing principal, term or fees invalidates the previous preview.
  const invalidate = () => { policyId = null; approve.disabled = true; };
  ['principal','fees','count'].forEach(name => form.elements[name].addEventListener('input', invalidate));
  invalidate();

  preview.addEventListener('click', async () => {
    invalidate();
    preview.disabled = true;
    try {
      const requested = [form.elements.principal.value, form.elements.count.value, form.elements.fees.value];
      const quote = await rpc(client, 'quote_loan', {
        p_principal: requested[0], p_count: Number(requested[1]), p_fees: requested[2],
      });
      if (requested.some((value, index) => value !==
        [form.elements.principal.value, form.elements.count.value, form.elements.fees.value][index])) {
        throw new Error('Offer details changed while loading. Preview the offer again.');
      }
      policyId = quote.policy.id;
      $('[data-offer-summary]').textContent = `Contractual interest: ${money(quote.interest)}. Total repayable before late interest: ${money(quote.total)}. Maximum monthly instalment: ${money(quote.maximum_instalment)}.`;
      $('[data-offer-policy]').textContent = policySummary(quote.policy);
      approve.disabled = false;
      $('[data-status]').textContent = 'Offer preview ready. Review the terms before approval.';
    } catch (error) { report(error); }
    finally { preview.disabled = false; }
  });
  return () => {
    if (!policyId) throw new Error('Preview the offer after entering the principal, fees and term.');
    return policyId;
  };
}
