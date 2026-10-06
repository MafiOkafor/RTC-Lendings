// Customer overview: profile readiness and application history.
import { session } from '../../js/session.js';
import { result } from '../../js/data.js';
import { $, showPage, report, table, money, label, link } from '../../js/ui.js';

async function initialize() {
  const context = await session();
  if (!context) return;
  const { client, user } = context;
  const [profile, applications] = await Promise.all([
    result(client.from('customer_profiles').select('full_name').eq('user_id', user.id).maybeSingle()),
    result(client.from('loan_applications').select('id,requested_amount,status,created_at')
      .eq('customer_id', user.id).order('created_at', { ascending: false }).limit(100)),
  ]);

  // The database returns only this customer's permitted records.
  $('[data-welcome]').textContent = profile ? `Welcome, ${profile.full_name}.` : 'Welcome. Complete your profile to get started.';
  $('[data-profile-state]').textContent = profile ? 'Your profile is ready. Keep your details up to date.' : 'Add your contact details, income and expenses.';
  table('[data-applications]', ['Application', 'Requested', 'Stage', 'Submitted'], applications.map(row => [
    link(row.id.slice(0, 8), `loan.html?id=${row.id}`), money(row.requested_amount), label(row.status), row.created_at.slice(0, 10),
  ]));
  showPage();
}
initialize().catch(report);
