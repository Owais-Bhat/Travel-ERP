/**
 * Learning management — courses and their lessons.
 *
 * The LMS page talked to Supabase directly and was inert against MySQL;
 * this is that port. Courses also carry the EIMS program link so a course
 * can belong to a degree track.
 */
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../lib/db.js';
import { requireAuthenticatedProfile } from '../middleware/auth.js';
import { requireInstitution } from '../middleware/tenant.js';
import { requireFeature } from '../middleware/feature.js';
import { requirePermission } from '../auth/permissions.js';
import { asyncHandler, ApiError } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { buildWhere, findOwnedOrFail, buildUpdate } from '../lib/query.js';
import {
  z, optionalText, longText, listQuery, idParam, optionalUuid, partialUpdate,
} from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('lms'));

const COURSE_UPDATABLE = [
  'title', 'description', 'subject', 'class_name', 'teacher_id',
  'thumbnail_url', 'is_published', 'program_id', 'code', 'credits', 'semester',
];
const LESSON_UPDATABLE = ['title', 'content', 'video_url', 'file_url', 'lesson_order'];

const courseSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: longText,
  subject: optionalText(100),
  class_name: optionalText(50),
  teacher_id: optionalUuid,
  thumbnail_url: optionalText(500),
  is_published: z.boolean().default(false),
  program_id: optionalUuid,
  code: optionalText(60),
  credits: z.coerce.number().min(0).max(100).default(0),
  semester: z.coerce.number().int().min(1).max(20).nullable().optional(),
});

const lessonSchema = z.object({
  title: z.string().trim().min(1).max(255),
  content: longText,
  video_url: optionalText(500),
  file_url: optionalText(500),
  lesson_order: z.coerce.number().int().min(0).max(10000).optional(),
});

// ------------------------------------------------------------- courses
router.get(
  '/courses',
  requirePermission('programs.read'),
  validate({
    query: listQuery.extend({
      programId: z.string().uuid().optional(),
      published: z.coerce.boolean().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const equals = { institution_id: req.institutionId, program_id: req.query.programId };
    // Students only ever see published material.
    if (req.auth.profile.role === 'student' || req.auth.profile.role === 'parent') {
      equals.is_published = 1;
    } else if (req.query.published !== undefined) {
      equals.is_published = req.query.published ? 1 : 0;
    }

    const { clause, params } = buildWhere({
      alias: 'c',
      equals,
      search: req.query.search,
      searchColumns: ['title', 'subject', 'code'],
    });

    const [rows] = await db.query(
      `SELECT c.*, CONCAT_WS(' ', t.first_name, t.last_name) AS teacher_name,
              p.name AS program_name,
              (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lesson_count
         FROM courses c
         LEFT JOIN teachers t ON t.id = c.teacher_id
         LEFT JOIN programs p ON p.id = c.program_id
         ${clause}
        ORDER BY c.created_at DESC
        LIMIT 200`,
      params
    );

    res.json(rows);
  })
);

router.get(
  '/courses/:id',
  requirePermission('programs.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const course = await findOwnedOrFail(db, 'courses', req.params.id, req.institutionId);
    if (!course.is_published && ['student', 'parent'].includes(req.auth.profile.role)) {
      throw ApiError.notFound('Course not found');
    }

    const [lessons] = await db.execute(
      'SELECT * FROM lessons WHERE course_id = ? ORDER BY lesson_order, created_at',
      [req.params.id]
    );
    res.json({ course, lessons });
  })
);

router.post(
  '/courses',
  requirePermission('programs.write'),
  validate({ body: courseSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body;
    const id = uuidv4();

    await db.execute(
      `INSERT INTO courses
         (id, institution_id, title, description, subject, class_name, teacher_id,
          thumbnail_url, is_published, program_id, code, credits, semester)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, req.institutionId, body.title, body.description, body.subject,
        body.class_name, body.teacher_id || null, body.thumbnail_url,
        body.is_published ? 1 : 0, body.program_id || null, body.code,
        body.credits, body.semester ?? null,
      ]
    );

    const course = await findOwnedOrFail(db, 'courses', id, req.institutionId);
    res.status(201).json(course);
  })
);

router.put(
  '/courses/:id',
  requirePermission('programs.write'),
  validate({ params: idParam, body: partialUpdate(courseSchema) }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'courses', req.params.id, req.institutionId);

    const payload = { ...req.body };
    if (payload.is_published !== undefined) payload.is_published = payload.is_published ? 1 : 0;

    const update = buildUpdate(payload, COURSE_UPDATABLE);
    if (!update) throw ApiError.badRequest('No updatable fields provided');

    await db.execute(
      `UPDATE courses SET ${update.sql} WHERE id = ? AND institution_id = ?`,
      [...update.params, req.params.id, req.institutionId]
    );

    const course = await findOwnedOrFail(db, 'courses', req.params.id, req.institutionId);
    res.json(course);
  })
);

router.delete(
  '/courses/:id',
  requirePermission('programs.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'courses', req.params.id, req.institutionId);
    await db.execute('DELETE FROM courses WHERE id = ? AND institution_id = ?', [
      req.params.id, req.institutionId,
    ]);
    res.json({ success: true });
  })
);

// ------------------------------------------------------------- lessons
/** Confirm a lesson's course belongs to this tenant before touching it. */
async function findLessonOrFail(lessonId, institutionId) {
  const [rows] = await db.execute(
    `SELECT l.* FROM lessons l
       JOIN courses c ON c.id = l.course_id
      WHERE l.id = ? AND c.institution_id = ?`,
    [lessonId, institutionId]
  );
  if (!rows[0]) throw ApiError.notFound('Lesson not found');
  return rows[0];
}

router.get(
  '/courses/:id/lessons',
  requirePermission('programs.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'courses', req.params.id, req.institutionId);
    const [rows] = await db.execute(
      'SELECT * FROM lessons WHERE course_id = ? ORDER BY lesson_order, created_at',
      [req.params.id]
    );
    res.json(rows);
  })
);

router.post(
  '/courses/:id/lessons',
  requirePermission('programs.write'),
  validate({ params: idParam, body: lessonSchema }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'courses', req.params.id, req.institutionId);

    // Default to the end of the list rather than colliding at position 0.
    let order = req.body.lesson_order;
    if (order === undefined) {
      const [[last]] = await db.execute(
        'SELECT COALESCE(MAX(lesson_order), -1) AS max_order FROM lessons WHERE course_id = ?',
        [req.params.id]
      );
      order = Number(last.max_order) + 1;
    }

    const id = uuidv4();
    await db.execute(
      `INSERT INTO lessons (id, course_id, title, content, video_url, file_url, lesson_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, req.params.id, req.body.title, req.body.content, req.body.video_url, req.body.file_url, order]
    );

    const [rows] = await db.execute('SELECT * FROM lessons WHERE id = ?', [id]);
    res.status(201).json(rows[0]);
  })
);

router.put(
  '/lessons/:id',
  requirePermission('programs.write'),
  validate({ params: idParam, body: partialUpdate(lessonSchema) }),
  asyncHandler(async (req, res) => {
    await findLessonOrFail(req.params.id, req.institutionId);

    const update = buildUpdate(req.body, LESSON_UPDATABLE);
    if (!update) throw ApiError.badRequest('No updatable fields provided');

    await db.execute(`UPDATE lessons SET ${update.sql} WHERE id = ?`, [...update.params, req.params.id]);
    const [rows] = await db.execute('SELECT * FROM lessons WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  })
);

router.delete(
  '/lessons/:id',
  requirePermission('programs.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await findLessonOrFail(req.params.id, req.institutionId);
    await db.execute('DELETE FROM lessons WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  })
);

export default router;
