/**
 * Attendance.
 *
 * Bulk marking now runs as one multi-row upsert inside a transaction
 * instead of a query per student — a class of 40 was 40 round trips, and a
 * failure halfway left the register half-written.
 */
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db, { withTransaction } from '../lib/db.js';
import { requireAuthenticatedProfile } from '../middleware/auth.js';
import { requireInstitution } from '../middleware/tenant.js';
import { requireFeature } from '../middleware/feature.js';
import { requirePermission } from '../auth/permissions.js';
import { recordAuditEvent } from '../lib/audit.js';
import { asyncHandler, ApiError } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { z, optionalText } from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('attendance'));

const STATUSES = ['present', 'absent', 'late', 'excused', 'half_day'];
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

router.get(
  '/',
  requirePermission('attendance.read'),
  validate({ query: z.object({ date: dateString, class_name: z.string().max(50).optional() }).passthrough() }),
  asyncHandler(async (req, res) => {
    const conditions = ['a.institution_id = ?', 'a.date = ?'];
    const params = [req.institutionId, req.query.date];

    if (req.query.class_name) {
      conditions.push('a.class_name = ?');
      params.push(req.query.class_name);
    }

    const [rows] = await db.execute(
      `SELECT a.*, s.first_name, s.last_name, s.admission_no
         FROM attendance a
         JOIN students s ON s.id = a.student_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY s.first_name, s.last_name`,
      params
    );
    res.json(rows);
  })
);

router.get(
  '/range',
  requirePermission('attendance.read'),
  validate({ query: z.object({ from: dateString, to: dateString }).passthrough() }),
  asyncHandler(async (req, res) => {
    if (req.query.from > req.query.to) throw ApiError.badRequest('"from" must not be after "to".');

    const [rows] = await db.execute(
      `SELECT date, status, COUNT(*) AS total
         FROM attendance
        WHERE institution_id = ? AND date BETWEEN ? AND ?
        GROUP BY date, status
        ORDER BY date`,
      [req.institutionId, req.query.from, req.query.to]
    );
    res.json(rows);
  })
);

router.get(
  '/summary',
  requirePermission('attendance.read'),
  validate({ query: z.object({ from: dateString.optional(), to: dateString.optional() }).passthrough() }),
  asyncHandler(async (req, res) => {
    const to = req.query.to || new Date().toISOString().slice(0, 10);
    const from = req.query.from
      || new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [[totals]] = await db.execute(
      `SELECT COUNT(*) AS records,
              SUM(status = 'present') AS present,
              SUM(status = 'absent')  AS absent,
              SUM(status = 'late')    AS late
         FROM attendance
        WHERE institution_id = ? AND date BETWEEN ? AND ?`,
      [req.institutionId, from, to]
    );

    const records = Number(totals.records) || 0;
    res.json({
      range: { from, to },
      ...totals,
      attendance_rate: records > 0
        ? Number(((Number(totals.present) / records) * 100).toFixed(1))
        : 0,
    });
  })
);

const markSchema = z.object({
  records: z.array(z.object({
    student_id: z.string().uuid(),
    class_name: optionalText(50),
    date: dateString,
    status: z.enum(STATUSES),
  })).min(1, 'At least one record is required').max(500, 'Mark at most 500 students at a time'),
});

router.post(
  '/mark',
  requirePermission('attendance.write'),
  validate({ body: markSchema }),
  asyncHandler(async (req, res) => {
    const { records } = req.body;
    const markedBy = req.auth.profile.id;

    // Every student must belong to this tenant — otherwise a crafted payload
    // could write attendance rows against another institution's students.
    const studentIds = [...new Set(records.map((record) => record.student_id))];
    const [owned] = await db.query(
      'SELECT id FROM students WHERE institution_id = ? AND id IN (?)',
      [req.institutionId, studentIds]
    );
    if (owned.length !== studentIds.length) {
      throw ApiError.badRequest('One or more students do not belong to this institution.');
    }

    const values = records.map((record) => [
      uuidv4(), req.institutionId, record.student_id,
      record.class_name || null, record.date, record.status, markedBy,
    ]);

    await withTransaction(async (connection) => {
      await connection.query(
        `INSERT INTO attendance
           (id, institution_id, student_id, class_name, date, status, marked_by)
         VALUES ?
         ON DUPLICATE KEY UPDATE
           status     = VALUES(status),
           class_name = VALUES(class_name),
           marked_by  = VALUES(marked_by)`,
        [values]
      );
    });

    await recordAuditEvent(req, {
      institutionId: req.institutionId,
      action: 'attendance.marked',
      description: `Marked attendance for ${records.length} student(s) on ${records[0].date}`,
      entityType: 'attendance',
      metadata: { count: records.length, date: records[0].date },
    });

    res.json({ success: true, count: records.length });
  })
);

export default router;
