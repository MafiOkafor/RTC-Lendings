// Customer sign-in page: customer/login.html.
import { getSupabase } from '../../js/supabase.js';

// 1. Find the form and its feedback elements.
const form = document.querySelector('[data-auth]');
const status = document.querySelector('[data-status]');
const button = form.querySelector('button');

// 2. Enable sign-in only after the connection is ready.
async function initializeLogin() {
  let client;
  try {
    client = await getSupabase();
    button.disabled = false;
    status.textContent = '';
  } catch (error) {
    status.textContent = error.message;
    return;
  }

  // 3. Submit this page's email and password to Supabase.
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    button.disabled = true;
    status.textContent = 'Please wait…';
    const fields = new FormData(form);

    try {
      const { error } = await client.auth.signInWithPassword({
        email: fields.get('email').trim(),
        password: fields.get('password'),
      });
      if (error) throw error;

      // 4. Open the customer dashboard.
      window.location.assign('./dashboard.html');
    } catch {
      status.textContent = 'Unable to sign in. Check your email and password and try again.';
    } finally {
      button.disabled = false;
    }
  });
}

// Start this page's sign-in form.
initializeLogin();
