// Owner-only employee access and per-employee loan approval permission.
import { session } from '../../js/session.js';
import { result, rpc } from '../../js/data.js';
import { $, showPage, report, bindForm, element } from '../../js/ui.js';

async function initialize() {
  const context = await session('owner');
  if (!context) return;
  const { client } = context;

  // The template keeps employee controls readable in employees.html.
  async function refresh() {
    const employees = await result(client.from('staff_members').select('*').eq('role', 'employee')
      .is('removed_at', null).order('created_at'));
    const list = $('[data-employees]');
    list.replaceChildren();
    if (!employees.length) list.append(element('p', 'No employees added yet.'));
    employees.forEach(employee => {
      const card = $('[data-employee-template]').content.firstElementChild.cloneNode(true);
      card.querySelector('[data-email]').textContent = employee.email;
      card.querySelector('[name=active]').checked = employee.active;
      card.querySelector('[name=approve]').checked = employee.can_approve;

      // Saving or removing staff access is checked again by the database.
      card.addEventListener('submit', async event => {
        event.preventDefault();
        const remove = event.submitter?.value === 'remove';
        if (remove && !window.confirm(`Remove ${employee.email} from the staff list? Their financial audit history will remain.`)) return;
        const buttons = [...card.querySelectorAll('button')];
        buttons.forEach(button => button.disabled = true);
        try {
          await rpc(client, 'update_employee', {
            p_user_id: employee.user_id, p_active: card.querySelector('[name=active]').checked,
            p_can_approve: card.querySelector('[name=approve]').checked, p_remove: remove,
          });
          await refresh();
          $('[data-status]').textContent = remove ? 'Employee removed from staff access.' : 'Employee permissions saved.';
        } catch (error) { report(error); }
        finally { buttons.forEach(button => button.disabled = false); }
      });
      list.append(card);
    });
  }
  await refresh();
  showPage();

  // Employee accounts must first register and confirm their own email address.
  bindForm('[data-add-employee]', async (fields, form) => {
    await rpc(client, 'add_employee', { p_email: fields.get('email'), p_can_approve: fields.get('approve') === 'on' });
    form.reset();
    await refresh();
    $('[data-status]').textContent = 'Employee added.';
  });
}
initialize().catch(report);
