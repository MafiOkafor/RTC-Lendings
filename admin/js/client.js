// Staff view of one customer's profile and loan balances.
import { session } from '../../js/session.js';
import { result, recordId, rpc } from '../../js/data.js';
import { $, showPage, report, table, money, label, link } from '../../js/ui.js';

async function initialize() {
  const context = await session('staff');
  if (!context) return;
  const { client } = context;
  const id = recordId();
  const [profile, applications] = await Promise.all([
    result(client.from('customer_profiles').select('*').eq('user_id', id).single()),
    result(client.from('loan_applications').select('id,status,requested_amount,created_at')
      .eq('customer_id', id).order('created_at', { ascending: false }).limit(100)),
  ]);

  // Display current profile separately from each application's submitted snapshot.
  $('[data-client-name]').textContent = profile.full_name;
  table('[data-profile]', ['Detail', 'Value'], [
    ['Email', profile.email], ['Phone', profile.phone], ['Address', profile.address],
    ['Employment', label(profile.employment)], ['Monthly income', money(profile.monthly_income)],
    ['Living expenses', money(profile.living_expenses)], ['Existing debt payments', money(profile.debt_payments)],
  ]);
  const rows = await Promise.all(applications.map(async loan => {
    const statement = await rpc(client, 'loan_statement', { p_id: loan.id });
    return [link(loan.id.slice(0, 8), `application.html?id=${loan.id}`), label(loan.status),
      money(statement.outstanding), money(statement.overdue), statement.days_late,
      money(statement.contractual_interest), money(statement.late_interest)];
  }));
  table('[data-loans]', ['Application', 'Stage', 'Outstanding', 'Overdue', 'Days late', 'Contractual interest', 'Unpaid late interest'], rows);
  showPage();
}
initialize().catch(report);
