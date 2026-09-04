/**
 * Custom Report Builder — four canned report types over existing tables,
 * each returning `{ columns, rows }` so the frontend can render a table and
 * export CSV without knowing the shape ahead of time.
 *
 * Not a generic query builder: the "custom" part is the filters (class,
 * date range, status) a tenant admin picks per run, not arbitrary SQL.
 */
import express from 'express';
import db from '../lib/db.js';
import { requireAuthenticatedProfile } from '../middleware/auth.js';
import { requireInstitution } from '../middleware/tenant.js';
import { requireFeature } from '../middleware/feature.js';
import { requirePermission } from '../auth/permissions.js';
import { asyncHandler, ApiError } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { z, isoDate } from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('reports_builder'));

const REPORT_TYPES = ['students', 'attendance', 'fees', 'exam_results'];

router.get(
  '/types',
  (req, res) => {
    res.json({
      types: [
        { key: 'students', label: 'Student List', filters: ['class_name', 'status'] },
        { key: 'attendance', label: 'Attendance Summary', filters: ['from', 'to', 'class_name'] },
        { key: 'fees', label: 'Fee Collection', filters: ['from', 'to', 'status'] },
        { key: 'exam_results', label: 'Exam Results', filters: ['exam_id'] },
      ],
    });
  }
);

router.get(
  '/run',
  requirePermission('reports.read'),
  validate({
    query: z.object({
      type: z.enum(REPORT_TYPES),
      class_name: z.string().max(50).optional(),
      status: z.string().max(30).optional(),
      from: isoDate,
      to: isoDate,
      exam_id: z.string().uuid().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { type } = req.query;
    const institutionId = req.institutionId;

    if (type === 'students') {
      const [rows] = await db.execute(
        `SELECT admission_no, first_name, last_name, class_name, section, status, parent_phone
           FROM students
          WHERE institution_id = ?
            AND (? IS NULL OR class_name = ?)
            AND (? IS NULL OR status = ?)
          ORDER BY class_name, first_name`,
        [institutionId, req.query.class_name || null, req.query.class_name || null, req.query.status || null, req.query.status || null]
      );
      return res.json({
        columns: ['Admission #', 'First Name', 'Last Name', 'Class', 'Section', 'Status', 'Parent Phone'],
        rows: rows.map((r) => [r.admission_no, r.first_name, r.last_name, r.class_name, r.section, r.status, r.parent_phone]),
      });
    }

    if (type === 'attendance') {
      const [rows] = await db.execute(
        `SELECT s.first_name, s.last_name, s.class_name,
                SUM(a.status = 'present') AS present_days,
                SUM(a.status = 'absent') AS absent_days,
                SUM(a.status = 'late') AS late_days,
                COUNT(*) AS total_days
           FROM attendance a
           JOIN students s ON s.id = a.student_id
          WHERE a.institution_id = ?
            AND (? IS NULL OR a.date >= ?)
            AND (? IS NULL OR a.date <= ?)
            AND (? IS NULL OR s.class_name = ?)
          GROUP BY s.id, s.first_name, s.last_name, s.class_name
          ORDER BY s.class_name, s.first_name`,
        [
          institutionId,
          req.query.from || null, req.query.from || null,
          req.query.to || null, req.query.to || null,
          req.query.class_name || null, req.query.class_name || null,
        ]
      );
      return res.json({
        columns: ['First Name', 'Last Name', 'Class', 'Present', 'Absent', 'Late', 'Total Days'],
        rows: rows.map((r) => [r.first_name, r.last_name, r.class_name, r.present_days, r.absent_days, r.late_days, r.total_days]),
      });
    }

    if (type === 'fees') {
      const [rows] = await db.execute(
        `SELECT s.first_name, s.last_name, s.class_name, f.total_amount, f.paid_amount, f.status, f.due_date
           FROM fee_payments f
           JOIN students s ON s.id = f.student_id
          WHERE f.institution_id = ?
            AND (? IS NULL OR f.due_date >= ?)
            AND (? IS NULL OR f.due_date <= ?)
            AND (? IS NULL OR f.status = ?)
          ORDER BY f.due_date DESC`,
        [
          institutionId,
          req.query.from || null, req.query.from || null,
          req.query.to || null, req.query.to || null,
          req.query.status || null, req.query.status || null,
        ]
      );
      return res.json({
        columns: ['First Name', 'Last Name', 'Class', 'Total', 'Paid', 'Status', 'Due Date'],
        rows: rows.map((r) => [r.first_name, r.last_name, r.class_name, r.total_amount, r.paid_amount, r.status, r.due_date]),
      });
    }

    // exam_results
    if (!req.query.exam_id) throw ApiError.badRequest('exam_id is required for the Exam Results report.');
    const [rows] = await db.execute(
      `SELECT s.first_name, s.last_name, s.class_name, r.marks_obtained, e.total_marks, r.grade
         FROM exam_results r
         JOIN students s ON s.id = r.student_id
         JOIN exams e ON e.id = r.exam_id
        WHERE e.institution_id = ? AND e.id = ?
        ORDER BY r.marks_obtained DESC`,
      [institutionId, req.query.exam_id]
    );
    return res.json({
      columns: ['First Name', 'Last Name', 'Class', 'Marks', 'Total Marks', 'Grade'],
      rows: rows.map((r) => [r.first_name, r.last_name, r.class_name, r.marks_obtained, r.total_marks, r.grade]),
    });
  })
);

export default router;
