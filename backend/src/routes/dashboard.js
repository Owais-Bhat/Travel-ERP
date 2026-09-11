import express from 'express';
import db from '../lib/db.js';
import { requireAuthenticatedProfile } from '../middleware/auth.js';
import { resolveRoleScope, inClause } from '../lib/roleScope.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);

// Get Dashboard Stats
router.get('/stats', async (req, res) => {
  try {
    const institutionId = req.auth.profile.institution_id;
    if (!institutionId) return res.status(400).json({ error: 'No institution' });

    const today = new Date().toISOString().split('T')[0];
    const scope = await resolveRoleScope(req);

    if (scope && scope.teacherRowId === null && req.auth.profile.role === 'teacher') {
      return res.json({
        totalStudents: 0, presentToday: 0, attendancePercentage: 0,
        totalFeesCollected: 0, totalFeesDue: 0, activeExams: 0, todayDate: today,
      });
    }

    // ── institution-wide (admin/principal/staff/super_admin) ──
    if (!scope) {
      const [studentsResult] = await db.execute('SELECT COUNT(*) as count FROM students WHERE institution_id = ?', [institutionId]);
      const totalStudents = studentsResult[0].count;

      const [attendanceResult] = await db.execute('SELECT status, COUNT(*) as count FROM attendance WHERE institution_id = ? AND date = ? GROUP BY status', [institutionId, today]);
      let presentToday = 0;
      let totalAttendance = 0;
      for (const row of attendanceResult) {
        if (row.status === 'present') presentToday = row.count;
        totalAttendance += row.count;
      }
      const attendancePercentage = totalAttendance > 0 ? Math.round((presentToday / totalAttendance) * 100) : 0;

      const [feesResult] = await db.execute('SELECT SUM(paid_amount) as collected, SUM(total_amount) as total FROM fee_payments WHERE institution_id = ?', [institutionId]);
      const totalFeesCollected = Number(feesResult[0]?.collected || 0);
      const totalFeesDue = Number(feesResult[0]?.total || 0) - totalFeesCollected;

      const [examsResult] = await db.execute(
        "SELECT COUNT(*) as count FROM exams WHERE institution_id = ? AND status IN ('upcoming', 'ongoing')",
        [institutionId]
      );
      const activeExams = examsResult[0].count;

      return res.json({
        totalStudents, presentToday, attendancePercentage,
        totalFeesCollected, totalFeesDue, activeExams, todayDate: today,
      });
    }

    // ── teacher: scoped to own classes ──
    if (req.auth.profile.role === 'teacher') {
      const classClause = inClause('class_name', scope.classNames);

      const [studentsResult] = await db.execute(
        `SELECT COUNT(*) as count FROM students WHERE institution_id = ? AND ${classClause.sql}`,
        [institutionId, ...classClause.params]
      );
      const totalStudents = studentsResult[0].count;

      const [attendanceResult] = await db.execute(
        `SELECT status, COUNT(*) as count FROM attendance WHERE institution_id = ? AND date = ? AND ${classClause.sql} GROUP BY status`,
        [institutionId, today, ...classClause.params]
      );
      let presentToday = 0;
      let totalAttendance = 0;
      for (const row of attendanceResult) {
        if (row.status === 'present') presentToday = row.count;
        totalAttendance += row.count;
      }
      const attendancePercentage = totalAttendance > 0 ? Math.round((presentToday / totalAttendance) * 100) : 0;

      const [examsResult] = await db.execute(
        `SELECT COUNT(*) as count FROM exams WHERE institution_id = ? AND status IN ('upcoming', 'ongoing') AND ${classClause.sql}`,
        [institutionId, ...classClause.params]
      );
      const activeExams = examsResult[0].count;

      return res.json({
        totalStudents, presentToday, attendancePercentage,
        totalFeesCollected: 0, totalFeesDue: 0, activeExams, todayDate: today,
      });
    }

    // ── student / parent: scoped to own/children's records ──
    const studentClause = inClause('student_id', scope.studentIds);
    const classClause = inClause('class_name', scope.classNames);

    const [attendanceResult] = await db.execute(
      `SELECT status, COUNT(*) as count FROM attendance WHERE institution_id = ? AND date = ? AND ${studentClause.sql} GROUP BY status`,
      [institutionId, today, ...studentClause.params]
    );
    let presentToday = 0;
    let totalAttendance = 0;
    for (const row of attendanceResult) {
      if (row.status === 'present') presentToday = row.count;
      totalAttendance += row.count;
    }
    const attendancePercentage = totalAttendance > 0 ? Math.round((presentToday / totalAttendance) * 100) : 0;

    const [feesResult] = await db.execute(
      `SELECT SUM(paid_amount) as collected, SUM(total_amount) as total FROM fee_payments WHERE institution_id = ? AND ${studentClause.sql}`,
      [institutionId, ...studentClause.params]
    );
    const totalFeesCollected = Number(feesResult[0]?.collected || 0);
    const totalFeesDue = Number(feesResult[0]?.total || 0) - totalFeesCollected;

    const [examsResult] = await db.execute(
      `SELECT COUNT(*) as count FROM exams WHERE institution_id = ? AND status IN ('upcoming', 'ongoing') AND ${classClause.sql}`,
      [institutionId, ...classClause.params]
    );
    const activeExams = examsResult[0].count;

    res.json({
      totalStudents: scope.studentIds.length, presentToday, attendancePercentage,
      totalFeesCollected, totalFeesDue, activeExams, todayDate: today,
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get Recent Activity
router.get('/activity', async (req, res) => {
  try {
    const institutionId = req.auth.profile.institution_id;
    const scope = await resolveRoleScope(req);

    // activity_log has no clean join to a specific student/class, so a
    // scoped account only sees its own actions rather than the full feed.
    const [logRows] = scope
      ? await db.execute(
          'SELECT * FROM activity_log WHERE institution_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 10',
          [institutionId, req.auth.profile.id]
        )
      : await db.execute(
          'SELECT * FROM activity_log WHERE institution_id = ? ORDER BY created_at DESC LIMIT 10',
          [institutionId]
        );

    const [announcements] = await db.execute(
      'SELECT COUNT(*) as count FROM announcements WHERE institution_id = ?',
      [institutionId]
    );

    res.json({
      log: logRows,
      hasAnnouncement: announcements[0].count > 0,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Attendance Trend
router.get('/attendance-trend', async (req, res) => {
  try {
    const institutionId = req.auth.profile.institution_id;
    const scope = await resolveRoleScope(req);

    const dates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split('T')[0];
    });
    const sevenDaysAgo = dates[0];

    let rows;
    if (!scope) {
      [rows] = await db.execute(
        'SELECT date, COUNT(*) as present FROM attendance WHERE institution_id = ? AND status = "present" AND date >= ? GROUP BY date',
        [institutionId, sevenDaysAgo]
      );
    } else if (req.auth.profile.role === 'teacher') {
      const classClause = inClause('class_name', scope.classNames);
      [rows] = await db.execute(
        `SELECT date, COUNT(*) as present FROM attendance WHERE institution_id = ? AND status = "present" AND date >= ? AND ${classClause.sql} GROUP BY date`,
        [institutionId, sevenDaysAgo, ...classClause.params]
      );
    } else {
      const studentClause = inClause('student_id', scope.studentIds);
      [rows] = await db.execute(
        `SELECT date, COUNT(*) as present FROM attendance WHERE institution_id = ? AND status = "present" AND date >= ? AND ${studentClause.sql} GROUP BY date`,
        [institutionId, sevenDaysAgo, ...studentClause.params]
      );
    }

    const countByDate = {};
    for (const row of rows) {
      const d = new Date(row.date);
      const dateStr = d.toISOString().split('T')[0];
      countByDate[dateStr] = row.present;
    }

    const formatted = dates.map((date) => ({
      date: date.slice(5),
      present: countByDate[date] || 0,
    }));

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Monthly attendance percentage for the caller's own student(s) — powers
// the personal performance report on the Reports page for student/parent.
// Not meaningful institution-wide, so unlike /attendance-trend this only
// serves self-service roles.
router.get('/performance-trend', async (req, res) => {
  try {
    const institutionId = req.auth.profile.institution_id;
    const role = req.auth.profile.role;
    if (!['student', 'parent'].includes(role)) {
      return res.status(403).json({ error: 'This report is only available to student and parent accounts.' });
    }

    const scope = await resolveRoleScope(req);
    const studentId = req.query.studentId && scope.studentIds.includes(req.query.studentId)
      ? req.query.studentId
      : scope.studentIds[0];
    if (!studentId) return res.json({ months: [] });

    const monthsAgo = new Date();
    monthsAgo.setMonth(monthsAgo.getMonth() - 5);
    const from = monthsAgo.toISOString().split('T')[0];

    const [rows] = await db.execute(
      `SELECT DATE_FORMAT(date, '%Y-%m') AS month,
              SUM(status = 'present') AS present,
              COUNT(*) AS total
         FROM attendance
        WHERE institution_id = ? AND student_id = ? AND date >= ?
        GROUP BY month
        ORDER BY month`,
      [institutionId, studentId, from]
    );

    const months = rows.map((row) => ({
      month: row.month,
      percentage: row.total > 0 ? Math.round((row.present / row.total) * 100) : 0,
    }));

    res.json({ months });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
