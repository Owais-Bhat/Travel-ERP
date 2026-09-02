/**
 * CyberMilo migration runner.
 *
 * Applies every .sql file in /migrations (lexical order) exactly once and
 * records what ran in `schema_migrations`.
 *
 *   npm run migrate           apply pending migrations
 *   npm run migrate -- --status   list applied / pending without running
 *
 * The splitter understands MySQL `DELIMITER` directives so stored-procedure
 * bodies survive, which also keeps the files importable through phpMyAdmin.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import db from '../src/lib/db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '../../migrations');

/**
 * Split a .sql file into executable statements.
 * Respects: single/double-quoted strings, backtick identifiers, `--` and `#`
 * line comments, block comments, and `DELIMITER x` directives.
 */
export function splitStatements(sql) {
  const statements = [];
  let delimiter = ';';
  let buffer = '';
  let i = 0;

  const isAt = (token) => sql.startsWith(token, i);

  while (i < sql.length) {
    // DELIMITER directive — only valid at the start of a line
    const atLineStart = i === 0 || sql[i - 1] === '\n';
    if (atLineStart && /^delimiter[ \t]/i.test(sql.slice(i, i + 10))) {
      const eol = sql.indexOf('\n', i);
      const line = sql.slice(i, eol === -1 ? sql.length : eol);
      delimiter = line.slice(line.indexOf(' ') + 1).trim();
      i = eol === -1 ? sql.length : eol + 1;
      continue;
    }

    const ch = sql[i];

    // line comments
    if (isAt('--') && (sql[i + 2] === ' ' || sql[i + 2] === '\t' || sql[i + 2] === '\n')) {
      const eol = sql.indexOf('\n', i);
      i = eol === -1 ? sql.length : eol + 1;
      continue;
    }
    if (ch === '#') {
      const eol = sql.indexOf('\n', i);
      i = eol === -1 ? sql.length : eol + 1;
      continue;
    }
    // block comment
    if (isAt('/*')) {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }

    // quoted literals / identifiers — copied verbatim
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      buffer += ch;
      i += 1;
      while (i < sql.length) {
        if (sql[i] === '\\' && quote !== '`') {
          buffer += sql.slice(i, i + 2);
          i += 2;
          continue;
        }
        if (sql[i] === quote) {
          // doubled quote is an escaped quote, not a terminator
          if (sql[i + 1] === quote) {
            buffer += quote + quote;
            i += 2;
            continue;
          }
          buffer += quote;
          i += 1;
          break;
        }
        buffer += sql[i];
        i += 1;
      }
      continue;
    }

    // statement terminator
    if (sql.startsWith(delimiter, i)) {
      const statement = buffer.trim();
      if (statement) statements.push(statement);
      buffer = '';
      i += delimiter.length;
      continue;
    }

    buffer += ch;
    i += 1;
  }

  const tail = buffer.trim();
  if (tail) statements.push(tail);
  return statements;
}

async function ensureMigrationsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        VARCHAR(191) NOT NULL,
      checksum    CHAR(64)     NOT NULL,
      applied_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

function readMigrations() {
  if (!fs.existsSync(migrationsDir)) return [];
  return fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      return {
        name: file,
        sql,
        checksum: crypto.createHash('sha256').update(sql).digest('hex'),
      };
    });
}

async function main() {
  const statusOnly = process.argv.includes('--status');
  await ensureMigrationsTable();

  const [appliedRows] = await db.query('SELECT name, checksum FROM schema_migrations');
  const applied = new Map(appliedRows.map((row) => [row.name, row.checksum]));
  const migrations = readMigrations();

  if (migrations.length === 0) {
    console.log('No migrations found in', migrationsDir);
    return;
  }

  if (statusOnly) {
    for (const migration of migrations) {
      const previous = applied.get(migration.name);
      if (!previous) console.log(`pending   ${migration.name}`);
      else if (previous !== migration.checksum) console.log(`CHANGED   ${migration.name}  (already applied with a different checksum)`);
      else console.log(`applied   ${migration.name}`);
    }
    return;
  }

  let ran = 0;
  for (const migration of migrations) {
    const previous = applied.get(migration.name);
    if (previous) {
      if (previous !== migration.checksum) {
        console.warn(`! ${migration.name} was edited after it ran — skipping. Add a new migration instead.`);
      }
      continue;
    }

    const statements = splitStatements(migration.sql);
    console.log(`> ${migration.name} (${statements.length} statements)`);
    const connection = await db.getConnection();
    try {
      for (const statement of statements) {
        await connection.query(statement);
      }
      await connection.query(
        'INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)',
        [migration.name, migration.checksum]
      );
      ran += 1;
    } catch (error) {
      console.error(`  failed: ${error.message}`);
      throw error;
    } finally {
      connection.release();
    }
  }

  console.log(ran === 0 ? 'Database already up to date.' : `Applied ${ran} migration(s).`);
}

// Only run when invoked directly, so the splitter stays unit-testable.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main()
    .then(() => db.end())
    .catch((error) => {
      console.error(error.message);
      db.end().finally(() => process.exit(1));
    });
}
