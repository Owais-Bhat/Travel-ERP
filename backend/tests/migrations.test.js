/**
 * Migration checks.
 *
 * There is no MySQL server in CI, so the DDL is parsed with a MySQL grammar
 * instead of executed. That catches syntax slips, and the structural
 * assertions below catch the more likely mistake: a table or column the
 * application code references that the schema never creates.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// node-sql-parser is CommonJS, so it has no named ESM exports.
import sqlParser from 'node-sql-parser';

const { Parser } = sqlParser;

import { splitStatements } from '../scripts/migrate.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '../../migrations');

const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort();
const allSql = files.map((file) => fs.readFileSync(path.join(migrationsDir, file), 'utf8')).join('\n');

test('there is at least one migration', () => {
  assert.ok(files.length > 0, 'expected .sql files in /migrations');
});

test('migrations are numbered so they apply in a deterministic order', () => {
  for (const file of files) {
    assert.match(file, /^\d{3}_[a-z0-9_]+\.sql$/, `${file} should be NNN_name.sql`);
  }
  const numbers = files.map((file) => file.slice(0, 3));
  assert.equal(new Set(numbers).size, numbers.length, 'migration numbers must be unique');
});

test('every CREATE TABLE and ALTER parses as MySQL', () => {
  const parser = new Parser();
  let checked = 0;

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    for (const statement of splitStatements(sql)) {
      // Stored routines and CALL/PREPARE are outside this parser's grammar;
      // they are covered by the splitter tests instead.
      if (/^(CREATE\s+PROCEDURE|DROP\s+PROCEDURE|CALL|SET|PREPARE|EXECUTE|DEALLOCATE)\b/i.test(statement)) {
        continue;
      }

      try {
        parser.astify(statement, { database: 'mysql' });
        checked += 1;
      } catch (error) {
        assert.fail(`${file}: ${error.message}\n--- statement ---\n${statement.slice(0, 400)}`);
      }
    }
  }

  assert.ok(checked > 0, 'expected to have parsed some DDL');
});

test('every table the EIMS modules query is created', () => {
  const required = [
    'programs',
    'certifications',
    'student_documents',
    'institution_documents',
    'admission_status_history',
    'scholarship_schemes',
    'scholarship_applications',
    'cashback_transactions',
    'referral_partners',
    'referrals',
    'commissions',
    'commission_invoices',
    'leads',
    'lead_activities',
    'password_reset_tokens',
  ];

  for (const table of required) {
    assert.match(
      allSql,
      new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, 'i'),
      `migration for table "${table}" is missing`
    );
  }
});

test('foreign keys are declared after the table they reference', () => {
  // MySQL rejects a FK to a table that does not exist yet, and the runner
  // applies statements in file order.
  const created = new Set();
  const createRe = /CREATE TABLE IF NOT EXISTS (\w+)/gi;
  const fkRe = /REFERENCES (\w+)\s*\(/gi;

  // Tables that already exist from the base schema.
  const preexisting = new Set([
    'users', 'institutions', 'user_profiles', 'students', 'teachers', 'classes',
    'courses', 'lessons', 'attendance', 'exams', 'exam_results', 'fee_structures',
    'fee_payments', 'admissions', 'announcements', 'messages', 'notifications',
    'activity_log', 'feature_usage_events', 'transport_routes', 'student_routes',
  ]);

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    for (const statement of splitStatements(sql)) {
      const createMatch = /CREATE TABLE IF NOT EXISTS (\w+)/i.exec(statement);
      const target = createMatch?.[1];

      for (const [, referenced] of statement.matchAll(fkRe)) {
        const known = preexisting.has(referenced)
          || created.has(referenced)
          || referenced === target;
        assert.ok(known, `${file}: "${target || 'ALTER'}" references "${referenced}" before it exists`);
      }

      if (target) created.add(target);
    }
  }

  createRe.lastIndex = 0;
});

test('tenant-scoped tables carry an institution_id', () => {
  const tenantTables = [
    'programs', 'certifications', 'student_documents', 'scholarship_schemes',
    'scholarship_applications', 'cashback_transactions', 'referral_partners',
    'referrals', 'commissions', 'commission_invoices', 'leads', 'lead_activities',
  ];

  for (const table of tenantTables) {
    const block = new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b[\\s\\S]*?ENGINE=InnoDB`, 'i')
      .exec(allSql);
    assert.ok(block, `could not find the definition of ${table}`);
    assert.match(
      block[0],
      /institution_id\s+CHAR\(36\)/i,
      `${table} must be tenant-scoped by institution_id`
    );
  }
});

test('money columns use DECIMAL, never FLOAT', () => {
  // Floating point money silently loses paise; every amount is DECIMAL.
  assert.doesNotMatch(allSql, /\b(FLOAT|DOUBLE)\b/i, 'found a floating-point column in the schema');

  for (const column of ['amount', 'awarded_amount', 'tuition_fee', 'total', 'subtotal']) {
    const match = new RegExp(`\\b${column}\\s+(\\w+)`, 'i').exec(allSql);
    if (match) {
      assert.match(match[1], /DECIMAL/i, `${column} should be DECIMAL, found ${match[1]}`);
    }
  }
});
