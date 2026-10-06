const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const db = new PGlite();
  // Minimal Supabase-compatible Auth and Storage schemas for isolated SQL tests.
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
    $$;
    grant usage on schema public,auth,storage to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to authenticated;
  `);
  const sqlRoot = path.join(__dirname, '../supabase');
  if (process.argv[2]) {
    await db.exec(fs.readFileSync(process.argv[2], 'utf8'));
    console.log('Installed combined setup artifact.');
  } else {
    for (const name of fs.readdirSync(sqlRoot).filter(name => name.endsWith('.sql') && Number(name.slice(0,3)) <= 7).sort()) {
      await db.exec(fs.readFileSync(path.join(sqlRoot, name), 'utf8'));
      console.log('Installed ' + name);
    }
  }
  const ids = {
    owner: '00000000-0000-4000-8000-000000000001',
    employee: '00000000-0000-4000-8000-000000000002',
    customer: '00000000-0000-4000-8000-000000000003',
    stranger: '00000000-0000-4000-8000-000000000004',
  };
  for (const [name, id] of Object.entries(ids)) {
    await db.query('insert into auth.users values($1,$2,now())', [id, `${name}@example.test`]);
  }
  const ownerSetup = fs.readFileSync(path.join(sqlRoot, '008_set_owner.sql.example'), 'utf8').replaceAll('OWNER_EMAIL_HERE', 'owner@example.test');
  await db.exec(ownerSetup);
  await assert.rejects(() => db.exec(ownerSetup), /owner already exists/);
  async function as(name) {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids[name] || '']);
    await db.exec('set role authenticated');
  }
  const call = async (name, values = []) => {
    const args = values.map((_, i) => '$' + (i + 1)).join(',');
    const output = await db.query(`select public.${name}(${args}) as value`, values);
    return output.rows[0]?.value;
  };
  let checks = 0;
  async function denied(action, pattern) {
    await assert.rejects(action, pattern); checks++;
  }
  const today = (await db.query("select (now() at time zone 'Africa/Johannesburg')::date::text as d")).rows[0].d;
  const future = (await db.query("select ((now() at time zone 'Africa/Johannesburg')::date + 10)::text as d")).rows[0].d;
  const agreement = 'TEST AGREEMENT ONLY. Principal, costs and repayments are disclosed for database validation. This is not a real agreement. '.repeat(2);

  // Owner settings and restricted employee administration.
  await as('owner');
  await call('save_business_profile', ['RTC Test','REG','NCR-test','owner@example.test','0123456789','Test address', 'Test privacy notice. '.repeat(10), true]);
  await call('add_employee', ['employee@example.test', false]);
  await as('employee');
  await denied(() => call('add_employee', ['stranger@example.test', true]), /Owner access/);
  await denied(() => db.query("update public.staff_members set can_approve=true"), /permission denied/);
  await denied(() => call('save_business_profile', ['Hijack','','','','','','',false]), /Owner access/);

  // Profiles and one active application per customer.
  await as('customer');
  await call('save_customer_profile', ['Example Customer','0123456789','10 Example Road','employed',10000,2000,1000]);
  const application = await call('submit_application', [1000,3,'Test purpose',true]);
  await denied(() => call('submit_application', [1000,3,'Test purpose',true]), /duplicate key/);
  await denied(() => call('approve_application', [application,1000,100,0,3,future,agreement]), /permission/);
  await denied(() => db.query("update public.loan_applications set status='approved'"), /permission denied/);
  await as('stranger');
  assert.equal((await db.query('select * from public.customer_profiles')).rows.length, 0); checks++;
  assert.equal((await db.query('select * from public.loan_applications')).rows.length, 0); checks++;
  await denied(() => call('loan_statement', [application]), /not available/);
  await denied(() => call('accept_agreement', [application,true]), /not available/);

  // Workflow ordering, manual affordability and document gates.
  await as('employee');
  await denied(() => call('assess_affordability', [application,10000,2000,1000,true,'Verified test evidence']), /Start/);
  await call('start_assessment', [application]);
  await denied(() => call('assess_affordability', [application,1000,2000,1000,true,'Verified test evidence']), /positive/);
  await call('assess_affordability', [application,10000,2000,1000,true,'Verified test evidence']);
  await denied(() => call('finish_document_review', [application]), /Verify identity/);

  // Actual Storage policies are exercised with owner, unrelated customer and staff.
  const documents = [];
  for (const kind of ['identity','income','bank_statement']) {
    const storagePath = `${ids.customer}/${application}/${kind}.pdf`;
    await as('stranger');
    await denied(() => db.query("insert into storage.objects(bucket_id,name) values('loan-documents',$1)", [storagePath]), /row-level security/);
    await as('customer');
    await db.query("insert into storage.objects(bucket_id,name) values('loan-documents',$1)", [storagePath]);
    await call('attach_document', [application,kind,storagePath,kind + '.pdf']);
  }
  await as('stranger');
  assert.equal((await db.query('select * from storage.objects')).rows.length, 0); checks++;
  await as('employee');
  assert.equal((await db.query('select * from storage.objects')).rows.length, 3); checks++;
  for (const row of (await db.query('select id from public.application_documents')).rows) {
    documents.push(row.id);
    await call('review_document', [row.id,true,'Verified test document']);
  }
  await call('finish_document_review', [application]);
  await denied(() => call('approve_application', [application,1000,100,0,3,future,agreement]), /permission/);

  // Approval can be delegated, and only the borrower can accept.
  await as('owner');
  await call('update_employee', [ids.employee,true,true,false]);
  await as('employee');
  await denied(() => call('approve_application', [application,1000,99999,0,3,future,agreement]), /exceeds verified/);
  await as('owner');
  await call('add_employee', ['customer@example.test',true]);
  await as('customer');
  await denied(() => call('approve_application', [application,1000,100,0,3,future,agreement]), /different authorised/);
  await as('owner');
  await call('update_employee', [ids.customer,false,false,true]);
  await as('employee');
  await call('approve_application', [application,1000,100,0,3,future,agreement]);
  await denied(() => call('accept_agreement', [application,true]), /not available/);
  await as('owner');
  await denied(() => call('record_disbursement', [application,'TRANSFER-001']), /accept the agreement/);
  await as('customer');
  await call('accept_agreement', [application,true]);
  await as('employee');
  await denied(() => call('record_disbursement', [application,'TRANSFER-001']), /Owner access/);
  await as('owner');
  await call('record_disbursement', [application,'TRANSFER-001']);
  const schedule = (await db.query('select amount from public.repayment_schedule order by sequence')).rows;
  assert.deepEqual(schedule.map(row => row.amount), ['366.67','366.67','366.66']); checks++;
  await denied(() => call('record_disbursement', [application,'TRANSFER-002']), /accept the agreement/);

  // Payments are auditable, exact, cannot overpay and cannot be duplicated.
  await as('employee');
  await call('record_payment', [application,100,today,'PAY-001']);
  await denied(() => call('record_payment', [application,100,today,'pay-001']), /duplicate key/);
  await denied(() => call('record_payment', [application,1000.01,today,'PAY-002']), /exceeds/);
  await denied(() => call('record_payment', [application,-1,today,'PAY-002']), /valid payment/);
  await denied(() => call('record_payment', [application,'NaN',today,'PAY-002']), /valid payment/);
  await denied(() => call('record_payment', [application,1,future,'PAY-002']), /valid payment/);
  let statement = await call('loan_statement', [application]);
  assert.equal(statement.outstanding,1000); assert.equal(statement.late_interest,0); checks += 2;
  assert.equal(statement.schedule[0].remaining,266.67); checks++;

  // Changing a staff row revokes the next query/action even with an existing session.
  await as('owner');
  await call('update_employee', [ids.employee,false,true,false]);
  await as('employee');
  await denied(() => call('record_payment', [application,1,today,'PAY-002']), /Staff access/);
  assert.equal((await db.query('select * from public.customer_profiles')).rows.length,0); checks++;
  assert.equal((await db.query('select * from storage.objects')).rows.length,0); checks++;
  await as('owner');
  await denied(() => call('update_employee', [ids.owner,false,false,true]), /not available/);
  await call('update_employee', [ids.employee,true,false,false]);

  // Simulate overdue dates in this isolated database to test FIFO and days late.
  await db.exec('reset role');
  await db.exec("update public.repayment_schedule set due_date=(now() at time zone 'Africa/Johannesburg')::date - 10 where sequence=1");
  await as('customer');
  statement = await call('loan_statement', [application]);
  assert.equal(statement.overdue,266.67); assert.equal(statement.days_late,10); checks += 2;
  await as('employee');
  await call('record_payment', [application,1000,today,'PAY-002']);
  assert.equal((await db.query('select status from public.loan_applications')).rows[0].status, 'completed'); checks++;
  assert.equal((await call('loan_statement',[application])).outstanding,0); checks++;
  await as('owner');
  await call('update_employee', [ids.employee,false,false,true]);
  await as('employee');
  assert.equal(await call('is_staff'),false); checks++;

  // Anonymous users cannot call mutations or read any customer records.
  await db.exec('reset role; set role anon');
  await denied(() => db.query('select * from public.loan_applications'), /permission denied/);
  await denied(() => call('record_payment', [application,1,today,'ANON']), /permission denied/);
  const publicDetails = await call('public_business_details');
  assert.equal(publicDetails.name,'RTC Test');
  assert.equal(publicDetails.privacy_notice,undefined); checks += 2;
  console.log(`PASS: ${checks} permission, privacy, workflow, storage, amount and ledger checks.`);
  await db.close();
})().catch(error => { console.error(error); process.exitCode = 1; });
