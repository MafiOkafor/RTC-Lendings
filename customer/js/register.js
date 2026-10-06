// Account creation page: customer/register.html.
import { getSupabase } from '../../js/supabase.js';

// 1. Find the registration form and feedback elements.
const form = document.querySelector('[data-auth]');
const status = document.querySelector('[data-status]');
const button = form.querySelector('button');

// 2. Connect before allowing registration.
async function initializeRegistration() {
  let client;
  try {
    client = await getSupabase();
    button.disabled = false;
    status.textContent = '';
  } catch (error) {
    status.textContent = error.message;
    return;
  }

  // 3. Create the account using the entered email and password.
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    button.disabled = true;
    status.textContent = 'Please wait…';
    const fields = new FormData(form);

    try {
      const { data, error } = await client.auth.signUp({
        email: fields.get('email').trim(),
        password: fields.get('password'),
      });
      if (error) throw error;

      // 4. Explain email confirmation, or continue if already signed in.
      if (!data.session) {
        status.textContent = 'Check your email for a confirmation link. If you already have an account, sign in.';
        form.reset();
      } else {
        window.location.assign('./dashboard.html');
      }
    } catch {
      status.textContent = 'We could not create your account. Check your details and try again.';
    } finally {
      button.disabled = false;
    }
  });
}

// Start this page's registration form.
initializeRegistration();
