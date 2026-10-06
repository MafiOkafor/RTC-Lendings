// Run legacy compatibility and current interest-policy checks in isolated databases.
const { execFileSync } = require('node:child_process');
const path = require('node:path');
for (const file of ['database.cjs','interest.cjs']) {
  execFileSync(process.execPath,[path.join(__dirname,file)],{stdio:'inherit'});
}
