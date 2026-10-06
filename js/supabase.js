// Shared Supabase connection. Every account page imports this module.
// Public settings stay in config.local.js; page behavior lives beside its page.
let clientPromise;

// 1. Reject unsuitable project URLs and non-public API keys.
export function validateConfig(config) {
  const url = new URL(config.supabaseUrl);
  const invalidUrl = url.protocol !== 'https:' || url.username || url.password
    || url.search || url.hash || url.pathname !== '/';
  if (invalidUrl) throw new Error('Use your HTTPS Supabase project URL.');

  const key = config.supabasePublishableKey;
  if (typeof key !== 'string') throw new Error('A public API key is required.');
  if (key.startsWith('sb_publishable_') && key.length > 20) return config;

  // Legacy browser keys must declare the anon role.
  // This check screens configuration; Supabase verifies the actual key.
  try {
    const payload = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    if (key.split('.').length === 3 && JSON.parse(atob(payload)).role === 'anon') {
      return config;
    }
  } catch {
    // Malformed keys fall through to the message below.
  }
  throw new Error('Only a publishable or legacy anon key is allowed.');
}

// 2. Read the local public configuration and load the Supabase library.
async function createConfiguredClient() {
  let config;
  try {
    ({ config } = await import('./config.local.js'));
  } catch {
    throw new Error('Account services are not configured yet. Please check back later.');
  }
  validateConfig(config);

  const { createClient } = await import(
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'
  );
  return createClient(config.supabaseUrl, config.supabasePublishableKey);
}

// 3. Reuse one connection per page, allowing a retry if setup fails.
export async function getSupabase() {
  if (!clientPromise) {
    clientPromise = createConfiguredClient().catch((error) => {
      clientPromise = undefined;
      throw error;
    });
  }
  return clientPromise;
}
