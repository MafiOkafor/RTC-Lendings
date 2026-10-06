// Customer profile: contact details and monthly financial information.
import { session } from '../../js/session.js';
import { result, rpc } from '../../js/data.js';
import { $, showPage, report, bindForm } from '../../js/ui.js';

async function initialize() {
  const context = await session();
  if (!context) return;
  const { client, user } = context;
  const profile = await result(client.from('customer_profiles').select('*').eq('user_id', user.id).maybeSingle());

  // Editing the profile does not change previously submitted loan snapshots.
  if (profile) {
    for (const [name, value] of Object.entries(profile)) {
      const field = $('[data-profile]').elements.namedItem(name);
      if (field) field.value = value;
    }
  }
  showPage();
  bindForm('[data-profile]', async fields => {
    await rpc(client, 'save_customer_profile', {
      p_name: fields.get('full_name'), p_phone: fields.get('phone'),
      p_address: fields.get('address'), p_employment: fields.get('employment'),
      p_income: fields.get('monthly_income'), p_expenses: fields.get('living_expenses'),
      p_debt: fields.get('debt_payments'),
    });
    $('[data-status]').textContent = 'Profile saved. You can now continue to your application.';
  });
}
initialize().catch(report);
