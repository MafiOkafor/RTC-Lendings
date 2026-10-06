// Staff dashboard: filter the application queue by its current stage.
import { session } from '../../js/session.js';
import { result } from '../../js/data.js';
import { $, showPage, report, table, money, label, link, bindForm } from '../../js/ui.js';

async function initialize() {
  const context = await session('staff');
  if (!context) return;
  async function refresh(status = '') {
    let query = context.client.from('loan_applications').select('id,customer_id,requested_amount,status,created_at')
      .order('created_at', { ascending: false }).limit(100);
    if (status) query = query.eq('status', status);
    const loans = await result(query);
    table('[data-applications]', ['Application', 'Customer', 'Requested', 'Stage', 'Submitted'], loans.map(row => [
      link(row.id.slice(0, 8), `application.html?id=${row.id}`),
      link('View profile', `client.html?id=${row.customer_id}`),
      money(row.requested_amount), label(row.status), row.created_at.slice(0, 10),
    ]));
    $('[data-status]').textContent = '';
  }
  await refresh();
  showPage();
  bindForm('[data-filter]', fields => refresh(fields.get('stage')));
}
initialize().catch(report);
