import express from 'express';
import db from '../lib/db.js';
import { requireAuthenticatedProfile } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);

// Get Dashboard Stats
router.get('/stats', async (req, res) => {
  try {
    const institutionId = req.auth.profile.institution_id;
    if (!institutionId) return res.status(400).json({ error: 'No institution' });

    const today = new Date().toISOString().split('T')[0];

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

    // Exam statuses are upcoming/ongoing/completed/cancelled/published — the
    // previous query looked for 'active', which never matches, so this tile
    // always read zero.
    const [examsResult] = await db.execute(
      "SELECT COUNT(*) as count FROM exams WHERE institution_id = ? AND status IN ('upcoming', 'ongoing')",
      [institutionId]
    );
    const activeExams = examsResult[0].count;

    res.json({
      totalStudents,
      presentToday,
      attendancePercentage,
      totalFeesCollected,
      totalFeesDue,
      activeExams,
      todayDate: today
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
    
    const [logRows] = await db.execute(
      'SELECT * FROM activity_log WHERE institution_id = ? ORDER BY created_at DESC LIMIT 10', 
      [institutionId]
    );

    const [announcements] = await db.execute(
      'SELECT COUNT(*) as count FROM announcements WHERE institution_id = ?',
      [institutionId]
    );

    res.json({
      log: logRows,
      hasAnnouncement: announcements[0].count > 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Attendance Trend
router.get('/attendance-trend', async (req, res) => {
  try {
    const institutionId = req.auth.profile.institution_id;
    
    const dates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split('T')[0];
    });

    const sevenDaysAgo = dates[0];

    const [rows] = await db.execute(
      'SELECT date, COUNT(*) as present FROM attendance WHERE institution_id = ? AND status = "present" AND date >= ? GROUP BY date',
      [institutionId, sevenDaysAgo]
    );

    const countByDate = {};
    for (const row of rows) {
      // row.date comes back as a Date object from mysql2
      const d = new Date(row.date);
      // Format as YYYY-MM-DD
      const dateStr = d.toISOString().split('T')[0];
      countByDate[dateStr] = row.present;
    }

    const formatted = dates.map(date => ({
      date: date.slice(5),
      present: countByDate[date] || 0
    }));

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
