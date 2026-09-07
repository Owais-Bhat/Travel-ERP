/**
 * Fee clearance check — a student is "cleared" when they have no
 * fee_payments row with a status other than 'paid'. Used to gate exam
 * result entry and hall ticket generation.
 */
export async function getFeeClearance(db, institutionId, studentId) {
  const [rows] = await db.execute(
    `SELECT COUNT(*) AS pending_count, COALESCE(SUM(total_amount - paid_amount), 0) AS pending_amount
       FROM fee_payments
      WHERE institution_id = ? AND student_id = ? AND status != 'paid'`,
    [institutionId, studentId]
  );
  const pendingCount = Number(rows[0]?.pending_count || 0);
  return {
    cleared: pendingCount === 0,
    pending_count: pendingCount,
    pending_amount: Number(rows[0]?.pending_amount || 0),
  };
}

/** Batch version for a whole class roster — one query instead of N. */
export async function getFeeClearanceMap(db, institutionId, studentIds) {
  if (studentIds.length === 0) return {};
  const placeholders = studentIds.map(() => '?').join(',');
  const [rows] = await db.execute(
    `SELECT student_id, COUNT(*) AS pending_count, COALESCE(SUM(total_amount - paid_amount), 0) AS pending_amount
       FROM fee_payments
      WHERE institution_id = ? AND status != 'paid' AND student_id IN (${placeholders})
      GROUP BY student_id`,
    [institutionId, ...studentIds]
  );
  const map = Object.fromEntries(studentIds.map((id) => [id, { cleared: true, pending_count: 0, pending_amount: 0 }]));
  for (const row of rows) {
    map[row.student_id] = {
      cleared: false,
      pending_count: Number(row.pending_count),
      pending_amount: Number(row.pending_amount),
    };
  }
  return map;
}
