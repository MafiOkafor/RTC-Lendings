// Shared display helpers. Customer values are always inserted as text.
export const $ = (selector) => document.querySelector(selector);
export const money = (value) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(Number(value || 0));
export const label = (value) => String(value || '').replaceAll('_', ' ');
export const today = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

// Create safe text elements and links without interpolating HTML.
export function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
export function link(text, href) {
  const node = element('a', text);
  node.href = href;
  return node;
}
export function table(target, headings, rows) {
  const root = typeof target === 'string' ? $(target) : target;
  root.replaceChildren();
  if (!rows.length) { root.append(element('p', 'No records yet.')); return; }
  const table = element('table');
  const head = element('thead');
  const titles = element('tr');
  headings.forEach(text => {
    const cell = element('th', text); cell.scope = 'col'; titles.append(cell);
  });
  head.append(titles);
  const body = element('tbody');
  rows.forEach(row => {
    const tr = element('tr');
    row.forEach(value => {
      const cell = element('td');
      value instanceof Node ? cell.append(value) : cell.textContent = value ?? '—';
      tr.append(cell);
    });
    body.append(tr);
  });
  table.append(head, body);
  root.append(table);
}

// Explain unavailable database setup and keep errors visible.
export function report(error) {
  const setup = ['42P01', 'PGRST202', 'PGRST205'].includes(error?.code);
  if (error?.code === '23505') {
    $('[data-status]').textContent = 'This record already exists. Check for an open application or a payment with the same reference.';
    return;
  }
  $('[data-status]').textContent = setup
    ? 'The lending database is not installed yet. The owner needs to complete the Supabase setup in SETUP.md.'
    : error?.message || 'The request failed. Please try again.';
}
export function showPage() {
  $('[data-content]').hidden = false;
  $('[data-status]').textContent = '';
}

// Prevent duplicate submissions while a form is saving.
export function bindForm(selector, action) {
  const form = $(selector);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const buttons = [...form.querySelectorAll('button')];
    buttons.forEach(button => button.disabled = true);
    $('[data-status]').textContent = 'Saving…';
    try { await action(new FormData(form), form); }
    catch (error) { report(error); }
    finally { buttons.forEach(button => button.disabled = false); }
  });
}
