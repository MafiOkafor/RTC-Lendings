// New application: profile check, privacy notice and submission.
import { session } from '../../js/session.js';
import { result, rpc } from '../../js/data.js';
import { $, showPage, report, bindForm } from '../../js/ui.js';

async function initialize() {
  const context = await session();
  if (!context) return;
  const { client, user } = context;
  const [profile, business] = await Promise.all([
    result(client.from('customer_profiles').select('user_id').eq('user_id', user.id).maybeSingle()),
    result(client.from('business_profile').select('*').eq('id', 1).single()),
  ]);
  $('[data-privacy]').textContent = business.privacy_notice || 'The privacy notice is not available yet.';
  showPage();

  // Submission stays unavailable until the owner opens applications.
  if (!profile || !business.applications_open) {
    $('[data-application-fields]').disabled = true;
    $('[data-status]').textContent = !profile ? 'Complete your profile before applying.' : 'The owner has not opened applications yet.';
    return;
  }
  bindForm('[data-application]', async fields => {
    const id = await rpc(client, 'submit_application', {
      p_amount: fields.get('amount'), p_months: Number(fields.get('months')),
      p_purpose: fields.get('purpose'), p_consent: fields.get('consent') === 'on',
    });
    window.location.assign(`documents.html?id=${id}`);
  });
}
initialize().catch(report);
