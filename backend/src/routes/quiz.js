/**
 * Online Quiz/Test Module — a teacher builds an MCQ quiz, a student takes
 * it once (enforced by a unique index on quiz_id+student_id, same
 * one-shot pattern as homework submissions), server grades it server-side
 * so the answer key never reaches the student's browser.
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
import { findOwnedOrFail } from '../lib/query.js';
import { z, optionalText, idParam } from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('online_quiz'));

const AUTHOR_ROLES = ['super_admin', 'admin', 'institution_admin', 'principal', 'teacher'];

const questionSchema = z.object({
  question_text: z.string().trim().min(1).max(2000),
  options: z.array(z.string().trim().min(1).max(500)).min(2).max(8),
  correct_index: z.coerce.number().int().min(0),
  points: z.coerce.number().int().min(1).max(100).default(1),
});

const quizSchema = z.object({
  title: z.string().trim().min(1).max(255),
  subject: optionalText(100),
  class_name: optionalText(50),
  time_limit_minutes: z.coerce.number().int().min(1).max(300).default(30),
  questions: z.array(questionSchema).min(1).max(100),
});

function isAuthor(role) {
  return AUTHOR_ROLES.includes(role);
}

function withQuestionCount(row) {
  return { ...row, question_count: Number(row.question_count || 0) };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const role = req.auth.profile.role;
    const [rows] = await db.execute(
      isAuthor(role)
        ? `SELECT q.*, (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS question_count,
                  (SELECT COUNT(*) FROM quiz_attempts qa WHERE qa.quiz_id = q.id) AS attempt_count
             FROM quizzes q WHERE q.institution_id = ? ORDER BY q.created_at DESC`
        : `SELECT q.*, (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS question_count
             FROM quizzes q WHERE q.institution_id = ? AND q.status = 'published' ORDER BY q.created_at DESC`,
      [req.institutionId]
    );
    res.json(rows.map(withQuestionCount));
  })
);

router.post(
  '/',
  requirePermission('exams.write'),
  validate({ body: quizSchema }),
  asyncHandler(async (req, res) => {
    if (!isAuthor(req.auth.profile.role)) throw ApiError.forbidden('Only teachers or admins can create quizzes.');

    const body = req.body;
    const quizId = uuidv4();
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `INSERT INTO quizzes (id, institution_id, title, subject, class_name, teacher_id, time_limit_minutes, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')`,
        [quizId, req.institutionId, body.title, body.subject, body.class_name, null, body.time_limit_minutes]
      );
      for (let i = 0; i < body.questions.length; i += 1) {
        const q = body.questions[i];
        if (q.correct_index >= q.options.length) throw ApiError.badRequest(`Question ${i + 1}: correct_index out of range`);
        await connection.execute(
          `INSERT INTO quiz_questions (id, quiz_id, question_text, options, correct_index, points, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), quizId, q.question_text, JSON.stringify(q.options), q.correct_index, q.points, i]
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const created = await findOwnedOrFail(db, 'quizzes', quizId, req.institutionId);
    res.status(201).json(created);
  })
);

router.patch(
  '/:id/publish',
  requirePermission('exams.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'quizzes', req.params.id, req.institutionId);
    await db.execute(`UPDATE quizzes SET status = 'published' WHERE id = ? AND institution_id = ?`, [req.params.id, req.institutionId]);
    res.json({ success: true });
  })
);

router.get(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const quiz = await findOwnedOrFail(db, 'quizzes', req.params.id, req.institutionId);
    const role = req.auth.profile.role;
    const includeAnswers = isAuthor(role);

    const [questions] = await db.execute(
      `SELECT id, question_text, options${includeAnswers ? ', correct_index' : ''}, points, sort_order
         FROM quiz_questions WHERE quiz_id = ? ORDER BY sort_order`,
      [quiz.id]
    );
    res.json({ quiz, questions: questions.map((q) => ({ ...q, options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options })) });
  })
);

router.post(
  '/:id/attempt',
  validate({
    params: idParam,
    body: z.object({ answers: z.array(z.coerce.number().int().min(0)).min(1), student_id: z.string().uuid() }),
  }),
  asyncHandler(async (req, res) => {
    const quiz = await findOwnedOrFail(db, 'quizzes', req.params.id, req.institutionId);
    if (quiz.status !== 'published') throw ApiError.badRequest('This quiz is not open for attempts.');

    await findOwnedOrFail(db, 'students', req.body.student_id, req.institutionId);
    const studentId = req.body.student_id;

    const [questions] = await db.execute(
      'SELECT correct_index, points FROM quiz_questions WHERE quiz_id = ? ORDER BY sort_order',
      [quiz.id]
    );
    if (req.body.answers.length !== questions.length) {
      throw ApiError.badRequest(`Expected ${questions.length} answers, got ${req.body.answers.length}`);
    }

    let score = 0;
    let maxScore = 0;
    questions.forEach((q, i) => {
      maxScore += q.points;
      if (req.body.answers[i] === q.correct_index) score += q.points;
    });

    const [existing] = await db.execute('SELECT id FROM quiz_attempts WHERE quiz_id = ? AND student_id = ?', [quiz.id, studentId]);
    if (existing.length > 0) throw ApiError.conflict('You have already attempted this quiz.');

    const id = uuidv4();
    await db.execute(
      `INSERT INTO quiz_attempts (id, quiz_id, student_id, answers, score, max_score)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, quiz.id, studentId, JSON.stringify(req.body.answers), score, maxScore]
    );

    res.status(201).json({ id, score, max_score: maxScore });
  })
);

router.get(
  '/:id/attempts',
  requirePermission('exams.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'quizzes', req.params.id, req.institutionId);
    const [rows] = await db.execute(
      `SELECT a.*, s.first_name, s.last_name, s.admission_no
         FROM quiz_attempts a JOIN students s ON s.id = a.student_id
        WHERE a.quiz_id = ? ORDER BY a.submitted_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  })
);

router.delete(
  '/:id',
  requirePermission('exams.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'quizzes', req.params.id, req.institutionId);
    await db.execute('DELETE FROM quizzes WHERE id = ? AND institution_id = ?', [req.params.id, req.institutionId]);
    res.json({ success: true });
  })
);

export default router;
