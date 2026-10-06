// Owner-only interest settings. Every save creates a new policy version.
import { session } from '../../js/session.js';
import { result, rpc } from '../../js/data.js';
import { $, showPage, report, bindForm } from '../../js/ui.js';
import { policySummary } from '../../js/interest-view.js';

async function initialize() {
  const context = await session('owner');
  if (!context) return;
  const form = $('[data-interest-settings]');
  const versions = await result(context.client.from('interest_policies').select('*')
    .order('id', { ascending: false }).limit(1));
  const policy = versions[0];

  // Load the current defaults; no rates are invented for an unconfigured business.
  if (policy) {
    for (const [name, value] of Object.entries(policy)) {
      const field = form.elements.namedItem(name);
      if (!field) continue;
      if (field.type === 'checkbox') field.checked = value;
      else field.value = value;
    }
    $('[data-current-policy]').textContent = policySummary(policy);
  }
  const updateFields = () => {
    $('[data-late-fields]').disabled = !form.elements.late_enabled.checked;
  };
  form.elements.late_enabled.addEventListener('change', updateFields);
  updateFields();
  showPage();

  // Only the owner can save. Existing loan snapshots are never updated here.
  bindForm('[data-interest-settings]', async fields => {
    const version = await rpc(context.client, 'save_interest_policy', {
      p_regular_rate: Number(fields.get('regular_monthly_rate')),
      p_enabled: fields.get('late_enabled') === 'on',
      p_late_rate: Number(fields.get('late_rate') || 0),
      p_period: fields.get('rate_period') || 'daily',
      p_basis: fields.get('calculation_basis') || 'overdue_instalments',
      p_method: fields.get('interest_method') || 'simple',
      p_grace: Number(fields.get('grace_days') || 0),
      p_cap_amount: Number(fields.get('cap_amount') || 0),
      p_cap_percent: Number(fields.get('cap_percent') || 0),
    });
    $('[data-status]').textContent = `Interest policy ${version} saved. It applies to newly approved loans only.`;
    const latest = await result(context.client.from('interest_policies').select('*').eq('id', version).single());
    $('[data-current-policy]').textContent = policySummary(latest);
  });
}
initialize().catch(report);
