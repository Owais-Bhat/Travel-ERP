/**
 * Resolves what a teacher/student/parent login is allowed to see on their
 * own dashboard, given the schema links added in migration 014
 * (teachers.user_id, students.user_id, students.parent_user_id).
 *
 * institution_admin/principal/staff/super_admin get no scope — callers
 * should treat a null return as "no restriction, use the institution-wide
 * query". An account whose role needs scoping but has no link row yet
 * (not migrated) resolves to an empty scope, which callers should render
 * as zeroed stats rather than an error.
 */
import db from './db.js';

const UNSCOPED_ROLES = new Set(['institution_admin', 'principal', 'staff', 'super_admin']);

export async function resolveRoleScope(req) {
  const { role, id: profileId, institution_id: institutionId } = req.auth.profile;
  if (UNSCOPED_ROLES.has(role)) return null;

  if (role === 'teacher') {
    const [teacherRows] = await db.execute('SELECT id FROM teachers WHERE user_id = ? AND institution_id = ?', [profileId, institutionId]);
    const teacherRowId = teacherRows[0]?.id || null;
    if (!teacherRowId) return { studentIds: [], classNames: [], teacherRowId: null };

    const [classRows] = await db.execute('SELECT DISTINCT name FROM classes WHERE teacher_id = ? AND institution_id = ?', [teacherRowId, institutionId]);
    return { studentIds: [], classNames: classRows.map((r) => r.name), teacherRowId };
  }

  if (role === 'student') {
    const [rows] = await db.execute('SELECT id, class_name FROM students WHERE user_id = ? AND institution_id = ?', [profileId, institutionId]);
    return {
      studentIds: rows.map((r) => r.id),
      classNames: [...new Set(rows.map((r) => r.class_name).filter(Boolean))],
      teacherRowId: null,
    };
  }

  if (role === 'parent') {
    const [rows] = await db.execute('SELECT id, class_name FROM students WHERE parent_user_id = ? AND institution_id = ?', [profileId, institutionId]);
    return {
      studentIds: rows.map((r) => r.id),
      classNames: [...new Set(rows.map((r) => r.class_name).filter(Boolean))],
      teacherRowId: null,
    };
  }

  // Unknown role — safest default is "see nothing" rather than "see everything".
  return { studentIds: [], classNames: [], teacherRowId: null };
}

export default resolveRoleScope;
