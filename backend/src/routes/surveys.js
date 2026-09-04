/**
 * Feedback & Survey Builder — admin/staff build a survey, any role it
 * targets can respond once (one response per survey per profile,
 * enforced in application code rather than a unique index since a
 * response's `respondent_profile_id` can be null for future anonymous
 * surveys).
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
import { z, longText, idParam } from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('feedback_survey'));

const TARGET_ROLES = ['all', 'student', 'parent', 'teacher', 'staff'];
const AUTHOR_ROLES = ['super_admin', 'admin', 'institution_admin', 'principal', 'staff'];

const questionSchema = z.object({
  question_text: z.string().trim().min(1).max(1000),
  question_type: z.enum(['text', 'rating', 'choice']).default('text'),
  options: z.array(z.string().trim().min(1).max(255)).max(10).optional(),
});

const surveySchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: longText,
  target_role: z.enum(TARGET_ROLES).default('all'),
  questions: z.array(questionSchema).min(1).max(50),
});

function isAuthor(role) {
  return AUTHOR_ROLES.includes(role);
}

function targetsRole(surveyTargetRole, role) {
  return surveyTargetRole === 'all' || surveyTargetRole === role;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const role = req.auth.profile.role;
    if (isAuthor(role)) {
      const [rows] = await db.execute(
        `SELECT s.*, (SELECT COUNT(*) FROM survey_responses r WHERE r.survey_id = s.id) AS response_count
           FROM surveys s WHERE s.institution_id = ? ORDER BY s.created_at DESC`,
        [req.institutionId]
      );
      return res.json(rows);
    }

    const [rows] = await db.execute(
      `SELECT * FROM surveys WHERE institution_id = ? AND status = 'open' ORDER BY created_at DESC`,
      [req.institutionId]
    );
    res.json(rows.filter((s) => targetsRole(s.target_role, role)));
  })
);

router.post(
  '/',
  requirePermission('communication.write'),
  validate({ body: surveySchema }),
  asyncHandler(async (req, res) => {
    if (!isAuthor(req.auth.profile.role)) throw ApiError.forbidden('Only institution admins or staff can build surveys.');

    const body = req.body;
    const surveyId = uuidv4();
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `INSERT INTO surveys (id, institution_id, title, description, target_role, status, created_by)
         VALUES (?, ?, ?, ?, ?, 'open', ?)`,
        [surveyId, req.institutionId, body.title, body.description, body.target_role, req.auth.profile.id]
      );
      for (let i = 0; i < body.questions.length; i += 1) {
        const q = body.questions[i];
        await connection.execute(
          `INSERT INTO survey_questions (id, survey_id, question_text, question_type, options, sort_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [uuidv4(), surveyId, q.question_text, q.question_type, q.options ? JSON.stringify(q.options) : null, i]
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const created = await findOwnedOrFail(db, 'surveys', surveyId, req.institutionId);
    res.status(201).json(created);
  })
);

router.get(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const survey = await findOwnedOrFail(db, 'surveys', req.params.id, req.institutionId);
    const [questions] = await db.execute(
      'SELECT * FROM survey_questions WHERE survey_id = ? ORDER BY sort_order',
      [survey.id]
    );
    res.json({
      survey,
      questions: questions.map((q) => ({
        ...q,
        options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
      })),
    });
  })
);

router.post(
  '/:id/respond',
  validate({ params: idParam, body: z.object({ answers: z.array(z.string().trim().max(2000)).min(1) }) }),
  asyncHandler(async (req, res) => {
    const survey = await findOwnedOrFail(db, 'surveys', req.params.id, req.institutionId);
    if (survey.status !== 'open') throw ApiError.badRequest('This survey is closed.');

    const [existing] = await db.execute(
      'SELECT id FROM survey_responses WHERE survey_id = ? AND respondent_profile_id = ?',
      [survey.id, req.auth.profile.id]
    );
    if (existing.length > 0) throw ApiError.conflict('You have already responded to this survey.');

    const id = uuidv4();
    await db.execute(
      `INSERT INTO survey_responses (id, survey_id, respondent_profile_id, answers)
       VALUES (?, ?, ?, ?)`,
      [id, survey.id, req.auth.profile.id, JSON.stringify(req.body.answers)]
    );
    res.status(201).json({ success: true });
  })
);

router.get(
  '/:id/responses',
  requirePermission('communication.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    if (!isAuthor(req.auth.profile.role)) throw ApiError.forbidden('Only institution admins or staff can view responses.');
    await findOwnedOrFail(db, 'surveys', req.params.id, req.institutionId);
    const [rows] = await db.execute(
      `SELECT r.*, p.first_name, p.last_name, p.role
         FROM survey_responses r LEFT JOIN user_profiles p ON p.id = r.respondent_profile_id
        WHERE r.survey_id = ? ORDER BY r.submitted_at DESC`,
      [req.params.id]
    );
    res.json(rows.map((r) => ({ ...r, answers: typeof r.answers === 'string' ? JSON.parse(r.answers) : r.answers })));
  })
);

router.patch(
  '/:id/close',
  requirePermission('communication.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'surveys', req.params.id, req.institutionId);
    await db.execute(`UPDATE surveys SET status = 'closed' WHERE id = ? AND institution_id = ?`, [req.params.id, req.institutionId]);
    res.json({ success: true });
  })
);

router.delete(
  '/:id',
  requirePermission('communication.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'surveys', req.params.id, req.institutionId);
    await db.execute('DELETE FROM surveys WHERE id = ? AND institution_id = ?', [req.params.id, req.institutionId]);
    res.json({ success: true });
  })
);

export default router;
