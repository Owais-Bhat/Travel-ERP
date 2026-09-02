/**
 * End-to-end smoke test against the running API + real MySQL.
 * Exercises the transactional money and conversion paths.
 */
const BASE = 'http://localhost:5000/api';
let token = '';
let failures = 0;

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

function check(label, ok, detail = '') {
  if (ok) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` :: ${JSON.stringify(detail).slice(0, 240)}` : ''}`);
  }
}

const login = async (email, password) => {
  const r = await call('POST', '/auth/login', { email, password });
  return r.json.token;
};

console.log('\n=== auth ===');
token = await login('admin@greenvalley.test', 'SchoolAdmin@123');
check('institution admin logs in', Boolean(token));

{
  const bad = await call('POST', '/auth/login', { email: 'admin@greenvalley.test', password: 'wrong-password' });
  check('wrong password is rejected with a generic message',
    bad.status === 401 && /invalid email or password/i.test(bad.json.error || ''), bad.json);

  const unknown = await call('POST', '/auth/login', { email: 'nobody@nowhere.test', password: 'whatever1' });
  check('unknown account gives the same response (no enumeration)',
    unknown.status === 401 && unknown.json.error === bad.json.error, unknown.json);
}

console.log('\n=== SQL injection regression (the old PUT vulnerability) ===');
{
  const students = await call('GET', '/students?pageSize=1&page=1');
  const student = students.json.data?.[0];
  check('student list returns rows', Boolean(student));

  // A crafted key used to become a raw SQL fragment in the SET clause.
  const evil = await call('PUT', `/students/${student.id}`, {
    "first_name = 'pwned', status": 'x',
    'status": "x': 1,
  });
  check('crafted body keys are refused, not executed',
    evil.status === 400 && /no updatable fields/i.test(evil.json.error || ''), evil.json);

  const after = await call('GET', `/students/${student.id}`);
  check('student row is untouched', after.json.student.first_name === student.first_name);
}

console.log('\n=== privilege escalation regression (settings) ===');
{
  const before = await call('GET', '/institutions/current');
  const planBefore = before.json.subscription_plan;

  const attack = await call('PUT', '/institutions/settings', {
    settings: { modules: { scholarships: true, referrals: true }, suspended: false, timezone: 'Asia/Kolkata' },
  });
  check('platform-owned settings keys are ignored',
    attack.status === 200 && attack.json.ignored.includes('modules') && attack.json.ignored.includes('suspended'),
    attack.json);
  check('tenant-owned keys are still accepted', attack.json.settings.timezone === 'Asia/Kolkata');

  const after = await call('GET', '/institutions/current');
  check('subscription plan unchanged', after.json.subscription_plan === planBefore);
}

console.log('\n=== lead -> admission conversion ===');
let admissionId;
{
  const created = await call('POST', '/leads', {
    name: 'Smoke Test Applicant',
    email: 'smoke@test.local',
    phone: '+919000000001',
    source: 'referral',
    stage: 'new',
    budget: 180000,
  });
  check('lead created', created.status === 201, created.json);
  const leadId = created.json.lead?.id;
  check('lead is scored', Number(created.json.lead?.score) > 0, created.json.lead?.score);

  const staged = await call('POST', `/leads/${leadId}/stage`, { stage: 'qualified' });
  check('lead moves stage', staged.status === 200, staged.json);

  const converted = await call('POST', `/leads/${leadId}/convert`, { intake_year: 2026, intake_term: 'Autumn' });
  check('lead converts to an application', converted.status === 201, converted.json);
  check('application number is issued', /^APP-\d{4}-\d{4}$/.test(converted.json.admission?.application_no || ''),
    converted.json.admission?.application_no);
  admissionId = converted.json.admission?.id;

  const again = await call('POST', `/leads/${leadId}/convert`, {});
  check('double conversion is refused', again.status === 409, again.json);
}

console.log('\n=== admission -> offer -> enrolment ===');
{
  const offer = await call('POST', `/admissions/${admissionId}/offer`, { expires_in_days: 14 });
  check('offer issued', offer.status === 200 && offer.json.status === 'offered', offer.json);

  const accept = await call('POST', `/admissions/${admissionId}/accept-offer`);
  check('offer accepted', accept.status === 200 && accept.json.status === 'approved', accept.json);

  const enrol = await call('POST', `/admissions/${admissionId}/enrol`, { class_name: 'Year 1' });
  check('enrolled into a student record', enrol.status === 201, enrol.json);
  check('student created from the applicant', Boolean(enrol.json.student?.id));
  check('application marked enrolled', enrol.json.admission?.status === 'enrolled');

  const again = await call('POST', `/admissions/${admissionId}/enrol`, {});
  check('double enrolment is refused', again.status === 409, again.json);
}

console.log('\n=== scholarships: eligibility, budget, disbursement ===');
{
  // A disposable scheme of its own, not the seeded 'MERIT-26' one: that
  // scheme has a fixed max_awards, and disbursing an award is permanent
  // (by design — a paid-out scholarship isn't supposed to un-consume its
  // slot). Reusing it would exhaust the seed after ~10 cumulative runs and
  // break the "safe to re-run" guarantee this script otherwise holds.
  const schemeCreated = await call('POST', '/scholarships/schemes', {
    name: `Smoke Scheme ${Date.now()}`,
    code: `SMOKE-${Date.now()}`,
    type: 'merit',
    award_type: 'percentage',
    award_value: 50,
    max_awards: 0, // unlimited
    budget_total: 0, // uncapped
    min_percentage: 75,
    max_family_income: 500000,
    status: 'open',
  });
  check('disposable scholarship scheme created', schemeCreated.status === 201, schemeCreated.json);
  const merit = schemeCreated.json.scheme;

  // min_percentage is 75 on this scheme.
  const ineligible = await call('POST', '/scholarships/applications', {
    scheme_id: merit.id,
    applicant_name: 'Below Cutoff',
    academic_percentage: 60,
    requested_amount: 50000,
  });
  check('below-cutoff applicant scores 0 and is flagged ineligible',
    ineligible.status === 201 && ineligible.json.evaluation.eligible === false,
    ineligible.json.evaluation);

  const reject = await call('POST', `/scholarships/applications/${ineligible.json.application.id}/decision`, {
    status: 'approved',
  });
  check('approving an ineligible applicant is refused', reject.status === 400, reject.json);

  const eligible = await call('POST', '/scholarships/applications', {
    scheme_id: merit.id,
    applicant_name: 'Smoke Scholar',
    email: 'scholar@test.local',
    academic_percentage: 92,
    family_income: 300000,
    requested_amount: 60000,
  });
  check('eligible applicant is accepted', eligible.status === 201 && eligible.json.evaluation.eligible === true);
  check('eligibility score is meaningful', Number(eligible.json.application.eligibility_score) > 50,
    eligible.json.application.eligibility_score);

  const appId = eligible.json.application.id;

  // Assert deltas, not absolutes: this script is meant to be re-runnable
  // against a database that already has data in it.
  const baseline = await call('GET', `/scholarships/schemes/${merit.id}`);
  const committedBefore = Number(baseline.json.scheme.budget_committed);
  const grantedBefore = Number(baseline.json.scheme.awards_granted);

  const approve = await call('POST', `/scholarships/applications/${appId}/decision`, {
    status: 'approved',
    awarded_amount: 45000,
  });
  check('approved with an award', approve.status === 200 && Number(approve.json.application.awarded_amount) === 45000,
    approve.json);

  const schemeAfter = await call('GET', `/scholarships/schemes/${merit.id}`);
  check('scheme budget was committed',
    Number(schemeAfter.json.scheme.budget_committed) - committedBefore === 45000,
    { before: committedBefore, after: schemeAfter.json.scheme.budget_committed });
  check('an award slot was consumed',
    Number(schemeAfter.json.scheme.awards_granted) - grantedBefore === 1,
    { before: grantedBefore, after: schemeAfter.json.scheme.awards_granted });

  // Reverting should release both.
  await call('POST', `/scholarships/applications/${appId}/decision`, { status: 'under_review' });
  const released = await call('GET', `/scholarships/schemes/${merit.id}`);
  check('reverting releases the budget',
    Number(released.json.scheme.budget_committed) === committedBefore,
    { expected: committedBefore, got: released.json.scheme.budget_committed });
  check('reverting releases the award slot',
    Number(released.json.scheme.awards_granted) === grantedBefore,
    { expected: grantedBefore, got: released.json.scheme.awards_granted });

  // Re-approve and disburse.
  await call('POST', `/scholarships/applications/${appId}/decision`, { status: 'approved', awarded_amount: 45000 });
  const disburse = await call('POST', `/scholarships/applications/${appId}/disburse`, {
    payout_method: 'fee_adjustment',
    reference_no: 'SMOKE-TXN-1',
  });
  check('disbursed', disburse.status === 201 && Number(disburse.json.transaction.amount) === 45000, disburse.json);

  const locked = await call('POST', `/scholarships/applications/${appId}/decision`, { status: 'rejected' });
  check('a disbursed application can no longer be changed', locked.status === 409, locked.json);
}

console.log('\n=== referrals: commission accrual -> invoice -> paid ===');
{
  const partner = await call('POST', '/referrals/partners', {
    name: 'Smoke Partner',
    type: 'agent',
    commission_type: 'percentage',
    commission_rate: 10,
  });
  check('partner created with a referral code', partner.status === 201 && Boolean(partner.json.partner.referral_code),
    partner.json);
  const partnerId = partner.json.partner.id;

  const programs = await call('GET', '/programs?pageSize=50');
  const program = programs.json.data.find((p) => Number(p.tuition_fee) === 180000);

  const referral = await call('POST', '/referrals', {
    partner_id: partnerId,
    referee_name: 'Smoke Referee',
    referee_email: 'referee@test.local',
    program_id: program.id,
  });
  check('referral logged', referral.status === 201, referral.json);

  const convert = await call('POST', `/referrals/${referral.json.referral.id}/status`, { status: 'converted' });
  check('conversion accrues a commission', convert.status === 200 && Boolean(convert.json.commission), convert.json);
  // 10% of the program's 180000 tuition.
  check('commission is 10% of the program tuition',
    Number(convert.json.commission?.amount) === 18000, convert.json.commission?.amount);

  const commissionId = convert.json.commission.id;
  const approve = await call('POST', `/referrals/commissions/${commissionId}/approve`, { approved: true });
  check('commission approved', approve.status === 200 && approve.json.commission.status === 'approved', approve.json);

  const invoice = await call('POST', '/referrals/invoices', { partner_id: partnerId, tax_rate: 18 });
  check('invoice created from approved commissions', invoice.status === 201, invoice.json);
  check('invoice totals include tax',
    Number(invoice.json.invoice.subtotal) === 18000 && Number(invoice.json.invoice.total) === 21240,
    { subtotal: invoice.json.invoice?.subtotal, total: invoice.json.invoice?.total });

  const empty = await call('POST', '/referrals/invoices', { partner_id: partnerId, tax_rate: 18 });
  check('invoicing with nothing left to bill is refused', empty.status === 400, empty.json);

  const paid = await call('POST', `/referrals/invoices/${invoice.json.invoice.id}/status`, { status: 'paid' });
  check('invoice marked paid', paid.status === 200 && paid.json.invoice.status === 'paid', paid.json);

  const partnerAfter = await call('GET', `/referrals/partners/${partnerId}`);
  check('partner ledger shows the payout', Number(partnerAfter.json.ledger.paid) === 18000,
    partnerAfter.json.ledger);
}

console.log('\n=== certifications: issue and public verification ===');
{
  const issued = await call('POST', '/certifications', {
    title: 'Smoke Certificate',
    grade: 'A',
  });
  check('certificate issued', issued.status === 201, issued.json);
  const code = issued.json.certification.verification_code;
  check('verification code generated', /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code || ''), code);

  const savedToken = token;
  token = ''; // verification must work with no session at all
  const verify = await call('GET', `/certifications/verify/${code}`);
  check('anyone can verify without signing in', verify.status === 200 && verify.json.valid === true, verify.json);

  const bogus = await call('GET', '/certifications/verify/AAAA-BBBB-CCCC');
  check('an unknown code returns not-valid', bogus.status === 404 && bogus.json.valid === false, bogus.json);
  token = savedToken;

  await call('POST', `/certifications/${issued.json.certification.id}/revoke`, { reason: 'smoke test' });
  const afterRevoke = await call('GET', `/certifications/verify/${code}`);
  check('a revoked certificate verifies as invalid', afterRevoke.json.valid === false, afterRevoke.json);
}

console.log('\n=== role enforcement ===');
{
  const teacherToken = await login('teacher@greenvalley.test', 'Teacher@123');
  const saved = token;
  token = teacherToken;

  const approve = await call('POST', '/scholarships/applications/00000000-0000-4000-8000-000000000000/decision', {
    status: 'approved',
  });
  check('a teacher cannot approve scholarships', approve.status === 403, approve.json);

  const users = await call('GET', '/users');
  check('a teacher cannot list tenant users', users.status === 403, users.json);

  const attendance = await call('GET', '/attendance?date=2026-09-01');
  check('a teacher can still read attendance', attendance.status === 200, attendance.json);
  token = saved;
}

console.log('\n=== tenant isolation ===');
{
  const superToken = await login('superadmin@cybermilo.test', 'CyberMilo@123');
  const saved = token;
  token = superToken;
  const noTenant = await call('GET', '/students');
  check('super admin without a tenant must name one', noTenant.status === 400, noTenant.json);
  token = saved;
}

console.log('\n=== per-role feature restriction (server-enforced) ===');
{
  // Baseline: a teacher can read attendance with no restriction set.
  const teacherToken = await login('teacher@greenvalley.test', 'Teacher@123');
  const savedAdmin = token;
  token = teacherToken;
  const before = await call('GET', '/attendance?date=2026-09-01');
  check('unrestricted teacher can read attendance', before.status === 200, before.json);
  token = savedAdmin;

  // Admin restricts teachers to a set that excludes attendance.
  const saved = await call('PUT', '/institutions/role-features', {
    roleFeatures: { teacher: ['students', 'exams'] },
  });
  check('admin can save a role restriction', saved.status === 200, saved.json);
  check('the restriction excludes attendance', !saved.json.roleFeatures.teacher.includes('attendance'),
    saved.json.roleFeatures);

  token = teacherToken;
  const after = await call('GET', '/attendance?date=2026-09-01');
  check('restricted teacher is blocked from attendance by the API, not just the UI',
    after.status === 403 && after.json.code === 'feature_restricted', after.json);

  const stillAllowed = await call('GET', '/students?pageSize=1');
  check('restricted teacher can still use a feature that stayed on the list',
    stillAllowed.status === 200, stillAllowed.json);
  token = savedAdmin;

  // Institution admin is never affected by a restriction meant for teachers.
  const adminCheck = await call('GET', '/attendance?date=2026-09-01');
  check('institution admin is unaffected by the teacher restriction', adminCheck.status === 200, adminCheck.json);

  // Clean up so re-running this script starts from "unrestricted" again.
  const reset = await call('PUT', '/institutions/role-features', { roleFeatures: {} });
  check('restriction can be cleared back to full access', reset.status === 200 && !reset.json.roleFeatures.teacher,
    reset.json);

  token = teacherToken;
  const restored = await call('GET', '/attendance?date=2026-09-01');
  check('teacher regains access once the restriction is cleared', restored.status === 200, restored.json);
  token = savedAdmin;
}

console.log('\n=== plan seat limit (hard block on invite) ===');
{
  // The seeded tenant is on a plan with a large seat count (hundreds), and
  // actually filling every seat to reach the boundary would mean hundreds
  // of invite requests — slow, and it trips the API's own rate limiter.
  // Drop to the 'free' plan (5 seats) for this check, then restore.
  const institution = await call('GET', '/institutions/current');
  const institutionId = institution.json.id;
  const originalPlan = institution.json.subscription_plan;

  const superToken = await login('superadmin@cybermilo.test', 'CyberMilo@123');
  const savedAdmin = token;
  token = superToken;
  const switched = await call('POST', '/admin/change-plan', { institutionId, plan: 'free' });
  check('super admin can drop the tenant to the free plan for this check', switched.status === 200, switched.json);
  token = savedAdmin;

  // Self-healing: if an earlier run of this section died mid-way (rate
  // limited, killed, etc.) it can leave active "smoke-*" accounts behind,
  // which would eat the free plan's 5 seats before this run even starts.
  // Clear any of those out first so the section works from a known state
  // regardless of how the last run ended.
  const preExisting = await call('GET', '/users');
  const leftover = preExisting.json.users.filter((u) => u.is_active && u.email?.startsWith('smoke-'));
  for (const user of leftover) {
    await call('PATCH', `/users/${user.id}`, { isActive: false });
  }
  if (leftover.length > 0) console.log(`  (cleared ${leftover.length} leftover smoke account(s) from a previous run)`);

  const limit = 5; // PLAN_LIMITS.free.users
  const created = [];
  try {
    const usersRes = await call('GET', '/users');
    const remaining = Math.max(0, limit - usersRes.json.users.filter((u) => u.is_active).length);

    for (let i = 0; i < remaining; i += 1) {
      const invite = await call('POST', '/users/invite', {
        email: `smoke-seat-${Date.now()}-${i}@test.local`,
        role: 'teacher',
        firstName: 'Seat',
        lastName: `Filler${i}`,
      });
      if (invite.status !== 201) {
        check(`seat-filling invite #${i} succeeds`, false, invite.json);
        break;
      }
      created.push(invite.json.profile.id);
    }

    const overLimit = await call('POST', '/users/invite', {
      email: `smoke-over-limit-${Date.now()}@test.local`,
      role: 'teacher',
      firstName: 'Over',
      lastName: 'Limit',
    });
    check('invite past the plan seat limit is hard-blocked',
      overLimit.status === 409 && overLimit.json.code === 'plan_user_limit', overLimit.json);

    // Freeing a seat should immediately unblock the next invite. Only
    // meaningful if this run actually filled a seat itself — with the
    // self-heal above, `created` is empty only when the tenant was already
    // at exactly the limit from real (non-smoke) accounts, which the free
    // plan check above already exercised.
    if (created.length > 0) {
      await call('PATCH', `/users/${created.pop()}`, { isActive: false });
      const afterFree = await call('POST', '/users/invite', {
        email: `smoke-after-free-${Date.now()}@test.local`,
        role: 'teacher',
        firstName: 'After',
        lastName: 'Free',
      });
      check('invite succeeds again once a seat is freed', afterFree.status === 201, afterFree.json);
      if (afterFree.json.profile?.id) created.push(afterFree.json.profile.id);
    } else {
      console.log('  SKIP  no seat created by this run to free (tenant was already at the limit)');
    }
  } finally {
    // Deactivate every seat this run consumed, then restore the plan —
    // this section leaves no lasting change behind either way.
    for (const id of created) {
      await call('PATCH', `/users/${id}`, { isActive: false });
    }
    token = superToken;
    await call('POST', '/admin/change-plan', { institutionId, plan: originalPlan });
    token = savedAdmin;
  }
}

console.log('\n=== reports + CSV export ===');
{
  const overview = await call('GET', '/reports/overview');
  check('overview aggregates across modules',
    overview.status === 200 && Number(overview.json.students.total) > 0, overview.json);

  const res = await fetch(`${BASE}/reports/students?format=csv`, { headers: { Authorization: `Bearer ${token}` } });
  const csv = await res.text();
  check('CSV export returns a real file',
    res.headers.get('content-type')?.includes('text/csv') && csv.split('\n').length > 2,
    csv.slice(0, 80));
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
