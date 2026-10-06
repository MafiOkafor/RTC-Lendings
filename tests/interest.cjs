// Isolated PostgreSQL tests: settings permissions, immutable terms and daily balances.
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');

(async () => {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
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
  if (process.argv[2] && process.argv[2] !== '--upgrade') {
    await db.exec(fs.readFileSync(process.argv[2],'utf8'));
  } else {
    const sources = fs.readdirSync(sqlRoot).filter(name => name.endsWith('.sql') &&
      (process.argv[2] !== '--upgrade' || Number(name.slice(0,3)) <= 7)).sort();
    for (const name of sources) await db.exec(fs.readFileSync(path.join(sqlRoot,name),'utf8'));
    if (process.argv[2] === '--upgrade') await db.exec(fs.readFileSync(process.argv[3],'utf8'));
  }
  const ids = { owner: randomUUID(), employee: randomUUID(), customer: randomUUID(), stranger: randomUUID() };
  for (const [name,id] of Object.entries(ids)) await db.query('insert into auth.users values($1,$2,now())',[id,name + '@example.test']);
  await db.query("insert into public.staff_members(user_id,email,role,can_approve) values($1,'owner@example.test','owner',true),($2,'employee@example.test','employee',true)",[ids.owner,ids.employee]);
  await db.query("insert into public.customer_profiles values($1,'Example Customer','customer@example.test','0123456789','10 Example Road','employed',10000,2000,1000,now())",[ids.customer]);
  let checks = 0;
  const eq = (actual, expected) => { assert.deepEqual(actual,expected); checks++; };
  const denied = async (action, pattern) => { await assert.rejects(action,pattern); checks++; };
  async function as(name) {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[name] || '']);
    if (name) await db.exec('set role authenticated');
  }
  async function call(name,args=[]) {
    return (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args)).rows[0].value;
  }
  const today = (await db.query("select (now() at time zone 'Africa/Johannesburg')::date::text d")).rows[0].d;
  const date = async offset => (await db.query('select ($1::date + $2::integer)::text d',[today,offset])).rows[0].d;
  const defaultPolicy = { regular: 0, enabled: true, rate: 1, period: 'daily', basis: 'overdue_instalments', method: 'simple', grace: 0, cap: 500, percent: 100 };
  const args = p => [p.regular,p.enabled,p.rate,p.period,p.basis,p.method,p.grace,p.cap,p.percent];
  async function policy(options={}) {
    await as('owner');
    const id = await call('save_interest_policy',args({ ...defaultPolicy,...options }));
    return (await db.query('select to_jsonb(p) p from public.interest_policies p where id=$1',[id])).rows[0].p;
  }
  async function loan(options={}) {
    const rules = options.legacy ? null : await policy(options);
    await as();
    // Fixture loans isolate calculation behavior from the separately tested workflow.
    await db.query("update public.loan_applications set status='completed' where customer_id=$1",[ids.customer]);
    const id = randomUUID();
    const total = options.total || 1000;
    await db.query(`insert into public.loan_applications(id,customer_id,requested_amount,requested_months,purpose,
      profile_snapshot,privacy_snapshot,status,principal,contractual_interest,total_fees,total_repayable,
      repayment_count,first_due_date,disbursed_at,interest_policy)
      values($1,$2,1000,2,'Calculation test','{}','Test privacy','disbursed',1000,$3,0,$4,2,
        $5::date-3,($5::date-20)::timestamptz,$6)`,[id,ids.customer,total-1000,total,today,rules]);
    const first = options.first || total;
    await db.query('insert into public.repayment_schedule(application_id,sequence,due_date,amount) values($1,1,$2::date-3,$3)',[id,today,first]);
    if (first < total) await db.query('insert into public.repayment_schedule(application_id,sequence,due_date,amount) values($1,2,$2::date+20,$3)',[id,today,total-first]);
    await as('customer');
    return id;
  }
  const statement = id => call('loan_statement',[id]);

  // Rates cannot be changed by employees or customers, and no rates are invented.
  await as('employee');
  await denied(()=>call('quote_loan',[1000,3,0]),/owner must save/);
  await denied(()=>call('save_interest_policy',args(defaultPolicy)),/Only the owner/);
  await as('customer');
  await denied(()=>call('save_interest_policy',args(defaultPolicy)),/Only the owner/);
  await denied(()=>call('quote_loan',[1000,3,0]),/permission/);
  await as('owner');
  for (const override of [{rate:-1},{rate:'NaN'},{cap:0},{percent:0},{percent:101},{grace:-1},{method:'unknown'}]) {
    await denied(()=>call('save_interest_policy',args({...defaultPolicy,...override})),/constraint|finite/);
  }

  // Completed days, simple/compound, rate conversion, bases, grace and dual caps.
  let id = await loan();
  let value = await statement(id);
  eq(value.late_interest,20); eq(value.late_interest_today_estimate,10);
  eq(value.outstanding,1020); eq(value.interest_charges.length,2);
  eq((await statement(id)).late_interest,20); // Reading twice never charges twice.
  id = await loan({method:'compound'}); value = await statement(id);
  eq(value.late_interest,20.1); eq(value.late_interest_today_estimate,10.2);
  id = await loan({grace:1}); eq((await statement(id)).late_interest,10);
  id = await loan({grace:3}); eq((await statement(id)).late_interest,0);
  id = await loan({period:'annual',rate:36.5}); eq((await statement(id)).late_interest,2);
  id = await loan({period:'monthly',rate:3}); eq((await statement(id)).late_interest,2);
  id = await loan({total:1100,first:550,basis:'overdue_instalments'}); eq((await statement(id)).late_interest,11);
  id = await loan({total:1100,first:550,basis:'overdue_principal'}); eq((await statement(id)).late_interest,10);
  id = await loan({total:1100,first:550,basis:'outstanding_principal'}); eq((await statement(id)).late_interest,20);
  id = await loan({cap:15}); value = await statement(id);
  eq(value.late_interest,15); eq(value.late_interest_today_estimate,0); eq(value.late_interest_cap_remaining,0);
  id = await loan({percent:1}); eq((await statement(id)).late_interest,10);
  id = await loan({enabled:false}); eq((await statement(id)).late_interest,0);
  id = await loan({legacy:true}); eq((await statement(id)).late_interest,0);

  // Partial and backdated payments are applied before that day's accrual.
  id = await loan();
  await as('employee');
  await call('record_payment',[id,400,await date(-1),'PARTIAL']);
  value = await statement(id); eq(value.late_interest,16); eq(value.outstanding,616);
  await denied(async()=>call('record_payment',[id,400,await date(-1),'PARTIAL']),/duplicate key/);
  eq((await statement(id)).paid,400);
  id = await loan({method:'compound'});
  await as('employee');
  await call('record_payment',[id,400,await date(-1),'PARTIAL']);
  eq((await statement(id)).late_interest,16.1);
  id = await loan();
  await as('employee');
  const yesterday = await date(-1);
  await denied(()=>call('record_payment',[id,1020,yesterday,'BACKDATE']),/exceeds the balance/);
  eq((await statement(id)).paid,0);
  await call('record_payment',[id,1000,today,'PRINCIPAL']);
  value = await statement(id); eq(value.outstanding,20); eq(value.late_interest_today_estimate,0);
  eq((await db.query('select status from public.loan_applications where id=$1',[id])).rows[0].status,'disbursed');
  await call('record_payment',[id,20,today,'LATE-INTEREST']);
  value = await statement(id); eq(value.outstanding,0); eq(value.late_interest_paid,20);
  eq((await db.query('select status from public.loan_applications where id=$1',[id])).rows[0].status,'completed');

  // Existing loan snapshots survive later changes, including disabling future charges.
  id = await loan();
  const original = (await statement(id)).interest_policy.id;
  await policy({rate:2,enabled:false});
  eq((await statement(id)).late_interest,20); eq((await statement(id)).interest_policy.id,original);
  await as('owner');
  await denied(()=>db.query('update public.interest_policies set late_rate=99'),/permission denied/);

  // The old free-entry approval function is no longer callable by any app account.
  await denied(async()=>call('approve_application',[id,1000,999,0,3,await date(20),'Long enough agreement '.repeat(10)]),/permission denied/);

  // New approvals calculate interest from the owner rate and freeze the policy.
  const rules = await policy({regular:2,rate:0.5});
  await as();
  await db.query("update public.loan_applications set status='review',disbursed_at=null,interest_policy=null where id=$1",[id]);
  await db.query('delete from public.repayment_schedule where application_id=$1',[id]);
  await db.query("insert into public.affordability_assessments values($1,10000,2000,1000,true,'Verified test evidence',$2,now())",[id,ids.employee]);
  await as('employee');
  const quote = await call('quote_loan',[1000,3,20]); eq(quote.interest,60); eq(quote.total,1080);
  const future = await date(20); const agreement = 'Reviewed test agreement. '.repeat(10);
  await denied(()=>call('approve_loan_with_policy',[id,1000,20,3,future,agreement,rules.id-1]),/settings changed/);
  await call('approve_loan_with_policy',[id,1000,20,3,future,agreement,rules.id]);
  const approved = (await db.query('select * from public.loan_applications where id=$1',[id])).rows[0];
  eq(approved.contractual_interest,'60.00'); eq(approved.interest_policy.id,rules.id);
  assert.match(approved.agreement_text,/INTEREST TERMS/); checks++;
  await as('customer'); await call('accept_agreement',[id,true]);
  await as('owner'); await call('record_disbursement',[id,'NEW-POLICY-DISBURSE']);
  eq((await statement(id)).outstanding,1080); eq((await statement(id)).late_interest,0);

  // Private replay cannot be called directly and unrelated accounts cannot read a loan.
  await as('stranger');
  await denied(()=>call('loan_statement',[id]),/not available/);
  await denied(()=>db.query('select rtc_private.calculate_account($1,$2)',[id,today]),/permission denied/);
  eq((await db.query('select * from public.interest_policies')).rows.length,0);
  await db.exec('reset role; set role anon');
  await denied(()=>call('save_interest_policy',args(defaultPolicy)),/permission denied/);
  console.log(`PASS: ${checks} interest permission, policy, calculation, payment and approval checks.`);
  await db.close();
})().catch(error=>{ console.error(error); process.exitCode=1; });
