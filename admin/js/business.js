// Owner-only business profile and application launch controls.
import { session } from '../../js/session.js';
import { result, rpc } from '../../js/data.js';
import { $, showPage, report, bindForm } from '../../js/ui.js';

async function initialize() {
  const context = await session('owner');
  if (!context) return;
  const business = await result(context.client.from('business_profile').select('*').eq('id', 1).single());
  for (const [name, value] of Object.entries(business)) {
    const field = $('[data-business]').elements.namedItem(name);
    if (!field) continue;
    if (field.type === 'checkbox') field.checked = value;
    else field.value = value;
  }
  showPage();

  // Interest settings have their own owner-only page and policy versions.
  bindForm('[data-business]', async fields => {
    await rpc(context.client, 'save_business_profile', {
      p_name: fields.get('name'), p_registration: fields.get('registration_number'),
      p_credit_number: fields.get('credit_provider_number'), p_email: fields.get('email'),
      p_phone: fields.get('phone'), p_address: fields.get('address'),
      p_privacy: fields.get('privacy_notice'), p_open: fields.get('applications_open') === 'on',
    });
    $('[data-status]').textContent = 'Business profile saved.';
  });
}
initialize().catch(report);
