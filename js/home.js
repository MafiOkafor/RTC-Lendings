// Public homepage: show the owner's published business contact details.
import { getSupabase } from './supabase.js';

async function loadBusiness() {
  try {
    const client = await getSupabase();
    const { data, error } = await client.rpc('public_business_details');
    if (error || !data) return;

    // Only public business fields are returned by this database function.
    document.querySelector('[data-business-name]').textContent = data.name;
    document.querySelector('[data-business-contact]').textContent =
      [data.email, data.phone, data.address].filter(Boolean).join(' · ');
    document.querySelector('[data-business-registration]').textContent =
      [data.registration_number, data.credit_provider_number].filter(Boolean).join(' · ');
    document.querySelector('[data-application-availability]').textContent = data.applications_open
      ? 'Online applications are open. Complete your profile to get started.'
      : 'Online applications are not open yet.';
  } catch {
    // The public page remains readable before the database setup is installed.
  }
}
loadBusiness();
