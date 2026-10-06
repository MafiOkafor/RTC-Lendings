// Plain-language summaries shared by settings, approval previews and statements.
import { money } from './ui.js';
const bases = {
  overdue_instalments: 'unpaid instalments past the grace period',
  overdue_principal: 'the principal portion of instalments past the grace period',
  outstanding_principal: 'all unpaid principal while an instalment is past the grace period',
};
export function policySummary(policy) {
  if (!policy) return 'This loan uses its original agreement. No automatic late-interest policy was attached.';
  const regular = `Policy ${policy.id}: regular interest ${policy.regular_monthly_rate}% per month, simple on original principal.`;
  if (!policy.late_enabled) return `${regular} Automatic late interest is disabled.`;
  return `${regular} Late interest: ${policy.late_rate}% ${policy.rate_period}, ${policy.interest_method}, on ${bases[policy.calculation_basis]}. `
    + `Grace: ${policy.grace_days} calendar days per instalment. Lifetime late-interest cap: the lower of ${money(policy.cap_amount)} and ${policy.cap_percent}% of original principal. `
    + 'Monthly rates divide by 30 and annual rates by 365. Charges are rounded daily and added for completed days only.';
}
