// Page session checks supplement the database's authoritative access policies.
import { getSupabase } from './supabase.js';
import { $, report } from './ui.js';

export async function session(role = 'customer') {
  const client = await getSupabase();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    window.location.replace('./login.html');
    return null;
  }

  // Sign-out remains available even when staff access has been disabled.
  const signout = $('[data-signout]');
  if (signout) {
    signout.hidden = false;
    signout.addEventListener('click', async () => {
      const { error } = await client.auth.signOut();
      if (error) report(error);
      else window.location.replace('./login.html');
    });
  }
  client.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') window.location.replace('./login.html');
  });
  if (role === 'customer') return { client, user: data.user };

  // Staff permissions come from protected records, never editable user metadata.
  const response = await client.from('staff_members').select('*').eq('user_id', data.user.id).maybeSingle();
  if (response.error) throw response.error;
  const staff = response.data;
  if (!staff?.active || staff.removed_at || (role === 'owner' && staff.role !== 'owner')) {
    throw new Error(role === 'owner' ? 'Only the owner can open this page.' : 'This account has no active staff access. Contact the owner.');
  }
  document.querySelectorAll('[data-owner]').forEach(node => node.hidden = staff.role !== 'owner');
  return { client, user: data.user, staff };
}
