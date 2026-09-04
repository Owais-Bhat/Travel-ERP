/**
 * Shared punch-processing logic used by both the live webhook
 * (biometricWebhook.js) and CSV import (biometric.js) — one event in, one
 * punch logged, and (if the biometric_uid is enrolled) same-day attendance
 * derived for a student or staff member. Kept in one place so the two
 * ingestion paths can never quietly drift apart.
 */
import { v4 as uuidv4 } from 'uuid';

/**
 * @param {import('mysql2/promise').Pool} db
 * @param {string} institutionId
 * @param {string} deviceId
 * @param {{ biometric_uid: string, timestamp: string|Date, type?: string }} event
 * @returns {Promise<boolean>} whether the punch matched an enrollment
 */
export async function processPunchEvent(db, institutionId, deviceId, event) {
  const [enrollmentRows] = await db.execute(
    'SELECT * FROM biometric_enrollments WHERE institution_id = ? AND biometric_uid = ?',
    [institutionId, event.biometric_uid]
  );
  const enrollment = enrollmentRows[0];
  const punchedAt = event.timestamp instanceof Date ? event.timestamp : new Date(event.timestamp);

  await db.execute(
    `INSERT INTO biometric_punches
       (id, institution_id, device_id, biometric_uid, punched_at, event_type, person_type, person_id, matched)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuidv4(), institutionId, deviceId, event.biometric_uid,
      punchedAt, event.type || 'unknown',
      enrollment?.person_type || null, enrollment?.person_id || null,
      enrollment ? 1 : 0,
    ]
  );

  if (!enrollment) return false;
  const punchDate = punchedAt.toISOString().slice(0, 10);

  if (enrollment.person_type === 'student') {
    const [[student]] = await db.execute(
      'SELECT class_name FROM students WHERE id = ? AND institution_id = ?',
      [enrollment.person_id, institutionId]
    );
    if (student) {
      await db.execute(
        `INSERT INTO attendance (id, institution_id, student_id, class_name, date, status)
         VALUES (?, ?, ?, ?, ?, 'present')
         ON DUPLICATE KEY UPDATE status = 'present'`,
        [uuidv4(), institutionId, enrollment.person_id, student.class_name, punchDate]
      );
    }
  } else if (enrollment.person_type === 'teacher') {
    await db.execute(
      `INSERT INTO staff_attendance (id, institution_id, teacher_id, date, status, first_punch_at, last_punch_at, source)
       VALUES (?, ?, ?, ?, 'present', ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         last_punch_at = GREATEST(COALESCE(last_punch_at, VALUES(last_punch_at)), VALUES(last_punch_at)),
         first_punch_at = LEAST(COALESCE(first_punch_at, VALUES(first_punch_at)), VALUES(first_punch_at))`,
      [uuidv4(), institutionId, enrollment.person_id, punchDate, punchedAt, punchedAt, event.source || 'biometric']
    );
  }

  return true;
}

/**
 * Minimal dependency-free CSV parser: handles quoted fields (with embedded
 * commas/quotes) and both \n and \r\n line endings. Good enough for the
 * flat exports biometric attendance software produces — not a general CSV
 * library, so anything exotic (embedded newlines inside a quoted field)
 * isn't handled.
 */
export function parseCsv(text) {
  const lines = text.split(/\r\n|\n/).filter((line) => line.trim().length > 0);
  return lines.map((line) => {
    const cells = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (inQuotes) {
        if (char === '"' && line[i + 1] === '"') { current += '"'; i += 1; }
        else if (char === '"') { inQuotes = false; }
        else { current += char; }
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        cells.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current);
    return cells.map((cell) => cell.trim());
  });
}

const ID_HEADERS = ['enroll no', 'enrollment no', 'enrollment id', 'user id', 'userid', 'emp code', 'employee id', 'pin', 'id'];
const DATETIME_HEADERS = ['datetime', 'date time', 'punch time', 'timestamp', 'time stamp'];
const DATE_HEADERS = ['date'];
const TIME_HEADERS = ['time'];

/**
 * Turns a parsed CSV (rows of cells, first row = header) into punch events,
 * tolerant of the header-name variation between biometric attendance
 * software exports (Realtime, eSSL, ZKTeco all name these columns
 * slightly differently).
 */
export function csvRowsToEvents(rows) {
  if (rows.length < 2) return { events: [], error: 'CSV has no data rows.' };

  const header = rows[0].map((h) => h.toLowerCase().trim());
  const findCol = (candidates) => header.findIndex((h) => candidates.includes(h));

  const idCol = findCol(ID_HEADERS);
  if (idCol === -1) {
    return { events: [], error: `Could not find an ID column. Expected one of: ${ID_HEADERS.join(', ')}.` };
  }

  const datetimeCol = findCol(DATETIME_HEADERS);
  const dateCol = findCol(DATE_HEADERS);
  const timeCol = findCol(TIME_HEADERS);
  if (datetimeCol === -1 && (dateCol === -1 || timeCol === -1)) {
    return { events: [], error: 'Could not find a date/time column (either one combined column, or separate Date and Time columns).' };
  }

  const events = [];
  for (const row of rows.slice(1)) {
    const biometric_uid = row[idCol];
    if (!biometric_uid) continue;

    let timestamp;
    if (datetimeCol !== -1) {
      timestamp = row[datetimeCol];
    } else {
      timestamp = `${row[dateCol]} ${row[timeCol]}`;
    }
    if (!timestamp || Number.isNaN(new Date(timestamp).getTime())) continue;

    events.push({ biometric_uid, timestamp, type: 'unknown' });
  }

  return { events, error: null };
}
