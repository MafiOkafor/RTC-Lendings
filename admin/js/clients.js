// Staff client directory: search names without loading every customer at once.
import { session } from '../../js/session.js';
import { result } from '../../js/data.js';
import { $, showPage, report, bindForm, table, link } from '../../js/ui.js';

async function initialize() {
  const context = await session('staff');
  if (!context) return;
  async function refresh(name = '') {
    let query = context.client.from('customer_profiles').select('user_id,full_name,email,phone')
      .order('full_name').limit(100);
    if (name) query = query.ilike('full_name', `%${name.replace(/[\\%_]/g, '\\$&')}%`);
    const rows = await result(query);
    table('[data-clients]', ['Client', 'Email', 'Phone'], rows.map(row => [
      link(row.full_name, `client.html?id=${row.user_id}`), row.email, row.phone,
    ]));
    $('[data-status]').textContent = '';
  }
  await refresh();
  showPage();
  bindForm('[data-search]', fields => refresh(fields.get('name').trim()));
}
initialize().catch(report);
