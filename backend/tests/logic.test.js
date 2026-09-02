/**
 * Unit tests for the money and scoring logic.
 *
 * These are the parts where a quiet mistake costs someone real money — an
 * over-awarded scholarship, a mis-computed commission — so they are tested
 * directly rather than only through the API.
 *
 *   npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { scoreEligibility, computeAward } from '../src/routes/scholarships.js';
import { computeCommission } from '../src/routes/referrals.js';
import { scoreLead } from '../src/routes/leads.js';
import { splitStatements } from '../scripts/migrate.js';
import { buildWhere, buildUpdate, parsePagination, parseSort } from '../src/lib/query.js';
import { permissionsForRole, roleHasPermission, ROLE_PERMISSIONS, PERMISSIONS } from '../src/auth/permissions.js';

// ──────────────────────────────── scholarships ────────────────────────────

test('scoreEligibility rejects an applicant below the academic minimum', () => {
  const result = scoreEligibility(
    { academic_percentage: 55 },
    { min_percentage: 60, max_family_income: null }
  );
  assert.equal(result.eligible, false);
  assert.equal(result.score, 0);
  assert.match(result.reasons[0], /60%/);
});

test('scoreEligibility rejects an applicant over the income cap', () => {
  const result = scoreEligibility(
    { academic_percentage: 90, family_income: 900000 },
    { min_percentage: null, max_family_income: 500000 }
  );
  assert.equal(result.eligible, false);
  assert.match(result.reasons[0], /income/i);
});

test('scoreEligibility rewards academics most heavily', () => {
  const scheme = { min_percentage: null, max_family_income: null };
  const strong = scoreEligibility({ academic_percentage: 95 }, scheme);
  const weak = scoreEligibility({ academic_percentage: 45 }, scheme);
  assert.ok(strong.score > weak.score, 'higher marks should score higher');
  assert.ok(strong.score <= 100, 'score is capped at 100');
});

test('scoreEligibility gives a lower income a higher need score', () => {
  const scheme = { min_percentage: null, max_family_income: 1000000 };
  const poorer = scoreEligibility({ academic_percentage: 70, family_income: 100000 }, scheme);
  const richer = scoreEligibility({ academic_percentage: 70, family_income: 900000 }, scheme);
  assert.ok(poorer.score > richer.score, 'lower income should score higher on need');
});

test('scoreEligibility never exceeds 100 on a perfect application', () => {
  const result = scoreEligibility(
    {
      academic_percentage: 100,
      family_income: 0,
      email: 'a@b.com',
      phone: '9999999999',
      statement: 'x',
      category: 'general',
    },
    { min_percentage: null, max_family_income: 1000000 }
  );
  assert.ok(result.score <= 100);
});

test('computeAward handles fixed and percentage schemes', () => {
  assert.equal(computeAward({ award_type: 'fixed', award_value: 25000 }), 25000);
  assert.equal(
    computeAward({ award_type: 'percentage', award_value: 50 }, { tuitionFee: 80000 }),
    40000
  );
  // Falls back to the requested amount when no tuition is known.
  assert.equal(
    computeAward({ award_type: 'percentage', award_value: 25 }, { requestedAmount: 40000 }),
    10000
  );
});

// ──────────────────────────────── commissions ─────────────────────────────

test('computeCommission applies a percentage rate to the base', () => {
  const result = computeCommission({ commission_type: 'percentage', commission_rate: 10 }, 50000);
  assert.equal(result.amount, 5000);
  assert.equal(result.base, 50000);
});

test('computeCommission ignores the base for a fixed rate', () => {
  const result = computeCommission({ commission_type: 'fixed', commission_rate: 3000 }, 50000);
  assert.equal(result.amount, 3000);
});

test('computeCommission rounds to two decimals', () => {
  // 33333 * 7.5% = 2499.975 — the stored amount must fit DECIMAL(14,2).
  const result = computeCommission({ commission_type: 'percentage', commission_rate: 7.5 }, 33333);
  const decimals = String(result.amount).split('.')[1] || '';
  assert.ok(decimals.length <= 2, `expected at most 2 decimals, got ${result.amount}`);
  assert.ok(Math.abs(result.amount - 2499.975) < 0.01);
});

test('computeCommission treats a missing base as zero rather than NaN', () => {
  const result = computeCommission({ commission_type: 'percentage', commission_rate: 10 }, undefined);
  assert.equal(result.amount, 0);
  assert.ok(Number.isFinite(result.amount));
});

// ──────────────────────────────── lead scoring ────────────────────────────

test('scoreLead rewards contactable, qualified leads', () => {
  const bare = scoreLead({ source: 'other', stage: 'new' });
  const rich = scoreLead({
    email: 'a@b.com',
    phone: '9999999999',
    city: 'Pune',
    program_id: 'x',
    budget: 50000,
    source: 'referral',
    stage: 'proposal',
  });
  assert.ok(rich > bare);
  assert.ok(rich <= 100 && bare >= 0);
});

test('scoreLead stays within 0-100 for unknown values', () => {
  const score = scoreLead({ source: 'unknown-source', stage: 'unknown-stage' });
  assert.ok(score >= 0 && score <= 100);
});

// ──────────────────────────────── query helpers ───────────────────────────

test('buildWhere skips empty filters and parameterises the rest', () => {
  const { clause, params } = buildWhere({
    equals: { institution_id: 'abc', status: '', level: null, mode: 'full_time' },
  });
  assert.equal(clause, 'WHERE `institution_id` = ? AND `mode` = ?');
  assert.deepEqual(params, ['abc', 'full_time']);
});

test('buildWhere prefixes columns with the table alias', () => {
  const { clause } = buildWhere({ alias: 'p', equals: { institution_id: 'abc' } });
  assert.equal(clause, 'WHERE p.`institution_id` = ?');
});

test('buildWhere builds an OR group for search columns', () => {
  const { clause, params } = buildWhere({
    equals: {},
    search: 'ali',
    searchColumns: ['first_name', 'last_name'],
  });
  assert.equal(clause, 'WHERE (`first_name` LIKE ? OR `last_name` LIKE ?)');
  assert.deepEqual(params, ['%ali%', '%ali%']);
});

test('buildUpdate only accepts allow-listed columns', () => {
  // The vulnerability this replaced: a request key became a raw SQL fragment.
  const update = buildUpdate(
    { first_name: 'Ada', "status = 'x', institution_id": 'evil', unknown: 1 },
    ['first_name', 'status']
  );
  assert.equal(update.sql, '`first_name` = ?');
  assert.deepEqual(update.params, ['Ada']);
});

test('buildUpdate returns null when nothing updatable was sent', () => {
  assert.equal(buildUpdate({ nope: 1 }, ['first_name']), null);
});

test('buildUpdate converts empty strings to NULL', () => {
  const update = buildUpdate({ first_name: '' }, ['first_name']);
  assert.deepEqual(update.params, [null]);
});

test('parsePagination clamps to sane bounds', () => {
  assert.deepEqual(parsePagination({}), { page: 1, pageSize: 20, offset: 0 });
  assert.equal(parsePagination({ pageSize: 5000 }).pageSize, 200);
  assert.equal(parsePagination({ page: -3 }).page, 1);
  assert.equal(parsePagination({ page: 3, pageSize: 10 }).offset, 20);
});

test('parseSort refuses a column that is not allow-listed', () => {
  // Column names cannot be parameterised, so anything unknown must fall back.
  const sort = parseSort({ sort: 'name); DROP TABLE students;--' }, ['name', 'created_at'], 'created_at');
  assert.equal(sort.column, 'created_at');
  assert.equal(sort.sql, '`created_at` DESC');
});

test('parseSort honours an allowed column and direction', () => {
  const sort = parseSort({ sort: 'name', order: 'asc' }, ['name'], 'created_at');
  assert.equal(sort.sql, '`name` ASC');
});

// ──────────────────────────────── migrations ──────────────────────────────

test('splitStatements respects DELIMITER blocks', () => {
  const sql = [
    'SELECT 1;',
    'DELIMITER //',
    'CREATE PROCEDURE p() BEGIN SELECT 1; SELECT 2; END //',
    'DELIMITER ;',
    'SELECT 2;',
  ].join('\n');

  const statements = splitStatements(sql);
  assert.equal(statements.length, 3);
  assert.ok(statements[1].startsWith('CREATE PROCEDURE'));
  assert.ok(statements[1].includes('SELECT 2'), 'the procedure body survives intact');
});

test('splitStatements ignores semicolons inside string literals', () => {
  const statements = splitStatements("INSERT INTO t VALUES ('a;b'); SELECT 1;");
  assert.equal(statements.length, 2);
  assert.ok(statements[0].includes("'a;b'"));
});

test('splitStatements strips comments', () => {
  const statements = splitStatements('-- a comment\nSELECT 1;\n/* block */\nSELECT 2;');
  assert.equal(statements.length, 2);
});

test('splitStatements handles doubled quotes as escapes', () => {
  const statements = splitStatements("CALL p('DEFAULT ''pending'''); SELECT 1;");
  assert.equal(statements.length, 2);
  assert.ok(statements[0].includes("''pending''"));
});

// ──────────────────────────────── permissions ─────────────────────────────

test('every role permission is a defined permission', () => {
  const known = new Set(Object.keys(PERMISSIONS));
  for (const [role, granted] of Object.entries(ROLE_PERMISSIONS)) {
    for (const permission of granted) {
      assert.ok(known.has(permission), `${role} references unknown permission "${permission}"`);
    }
  }
});

test('students and parents cannot approve money', () => {
  for (const role of ['student', 'parent']) {
    assert.equal(roleHasPermission(role, 'scholarships.approve'), false);
    assert.equal(roleHasPermission(role, 'commissions.approve'), false);
    assert.equal(roleHasPermission(role, 'users.manage'), false);
  }
});

test('teachers cannot delete students or manage the institution', () => {
  assert.equal(roleHasPermission('teacher', 'students.delete'), false);
  assert.equal(roleHasPermission('teacher', 'institution.manage'), false);
  assert.equal(roleHasPermission('teacher', 'attendance.write'), true);
});

test('only the platform can verify institutions', () => {
  assert.equal(roleHasPermission('super_admin', 'institutions.verify'), true);
  assert.equal(roleHasPermission('institution_admin', 'institutions.verify'), false);
});

test('an unknown role gets no permissions at all', () => {
  assert.deepEqual(permissionsForRole('not-a-role'), []);
});
