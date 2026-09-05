/**
 * AI Early-Warning / At-Risk Student Alerts.
 *
 * Deliberately rule-based rather than LLM-based: a risk score computed
 * from three existing signals (attendance rate, average exam score, overdue
 * fees) is deterministic, free, and instant — an LLM call would add cost
 * and latency for a decision three SQL aggregates already answer reliably.
 * Score is out of 100; a tenant's threshold (default 40) marks "at risk".
 */
import express from 'express';
import db from '../lib/db.js';
import { requireAuthenticatedProfile } from '../middleware/auth.js';
import { requireInstitution } from '../middleware/tenant.js';
import { requireFeature } from '../middleware/feature.js';
import { requirePermission } from '../auth/permissions.js';
import { asyncHandler } from '../lib/errors.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('early_warning'));

router.get(
  '/',
  requirePermission('students.read'),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      `SELECT
         s.id, s.first_name, s.last_name, s.admission_no, s.class_name, s.section,
         COALESCE(att.total, 0) AS attendance_days,
         COALESCE(att.present_rate, 100) AS attendance_rate,
         COALESCE(ex.avg_pct, NULL) AS exam_avg_pct,
         COALESCE(fee.overdue_count, 0) AS overdue_fee_count
       FROM students s
       LEFT JOIN (
         SELECT student_id,
                COUNT(*) AS total,
                ROUND(100 * SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) / COUNT(*), 1) AS present_rate
           FROM attendance
          WHERE institution_id = ? AND date >= (CURDATE() - INTERVAL 60 DAY)
          GROUP BY student_id
       ) att ON att.student_id = s.id
       LEFT JOIN (
         SELECT r.student_id, ROUND(100 * AVG(r.marks_obtained / NULLIF(e.total_marks, 0)), 1) AS avg_pct
           FROM exam_results r JOIN exams e ON e.id = r.exam_id
          WHERE e.institution_id = ?
          GROUP BY r.student_id
       ) ex ON ex.student_id = s.id
       LEFT JOIN (
         SELECT student_id, COUNT(*) AS overdue_count
           FROM fee_payments
          WHERE institution_id = ? AND status != 'paid' AND due_date < CURDATE()
          GROUP BY student_id
       ) fee ON fee.student_id = s.id
      WHERE s.institution_id = ? AND s.status = 'active'`,
      [req.institutionId, req.institutionId, req.institutionId, req.institutionId]
    );

    const withScores = rows.map((row) => {
      let score = 0;
      const reasons = [];

      const attendanceRate = Number(row.attendance_rate);
      if (row.attendance_days > 0) {
        if (attendanceRate < 75) { score += 40; reasons.push(`Attendance ${attendanceRate}% (last 60 days)`); }
        else if (attendanceRate < 85) { score += 20; reasons.push(`Attendance ${attendanceRate}% (last 60 days)`); }
      }

      if (row.exam_avg_pct !== null) {
        const examAvg = Number(row.exam_avg_pct);
        if (examAvg < 40) { score += 40; reasons.push(`Exam average ${examAvg}%`); }
        else if (examAvg < 50) { score += 20; reasons.push(`Exam average ${examAvg}%`); }
      }

      if (row.overdue_fee_count > 0) {
        score += 20;
        reasons.push(`${row.overdue_fee_count} overdue fee payment(s)`);
      }

      return {
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
        admission_no: row.admission_no,
        class_name: row.class_name,
        section: row.section,
        attendance_rate: row.attendance_days > 0 ? attendanceRate : null,
        exam_avg_pct: row.exam_avg_pct !== null ? Number(row.exam_avg_pct) : null,
        overdue_fee_count: row.overdue_fee_count,
        risk_score: Math.min(score, 100),
        reasons,
      };
    });

    const atRisk = withScores.filter((s) => s.risk_score >= 40).sort((a, b) => b.risk_score - a.risk_score);
    res.json({ at_risk: atRisk, total_students: withScores.length });
  })
);

export default router;
