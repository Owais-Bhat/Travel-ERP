/**
 * Public Admission Form — unauthenticated intake endpoint.
 *
 * No user session exists here (a prospective parent filling this out has no
 * account), so it authenticates the *tenant* by institution id in the URL
 * instead of a JWT — same shape as biometricWebhook.js authenticating a
 * device by its own credentials rather than a profile's. The institution id
 * is a UUID, which per this project's threat model is treated as
 * unguessable, so exposing it in a public link is fine.
 *
 * Every submission lands in the existing `admissions` table as a normal
 * pending application (source='website') — reviewed the same way as any
 * other lead in AdmissionsPage.
 */
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../lib/db.js';
import { getPlanFeatureMap } from '../saas/features.js';
import { asyncHandler, ApiError } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { nextSequenceNo, findOwnedOrFail } from '../lib/query.js';
import {
  z, optionalText, longText, isoDate, email, phone,
} from '../validation/common.js';

const router = express.Router();

const publicApplicationSchema = z.object({
  applicant_name: z.string().trim().min(1).max(200),
  email,
  phone,
  dob: isoDate,
  class_applying: optionalText(50),
  parent_name: optionalText(200),
  parent_phone: phone,
  address: longText,
  remarks: longText,
});

router.post(
  '/:institutionId',
  validate({
    params: z.object({ institutionId: z.string().uuid() }),
    body: publicApplicationSchema,
  }),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      'SELECT id, subscription_plan, subscription_status, settings FROM institutions WHERE id = ? LIMIT 1',
      [req.params.institutionId]
    );
    const institution = rows[0];
    if (!institution) throw ApiError.notFound('Application link not found.');
    if (institution.subscription_status === 'suspended') {
      throw ApiError.forbidden('This institution is not currently accepting applications.');
    }

    const settings = typeof institution.settings === 'string' ? JSON.parse(institution.settings) : institution.settings;
    const featureMap = getPlanFeatureMap(institution.subscription_plan, settings?.modules || {});
    if (!featureMap.admissions) {
      throw ApiError.forbidden('This institution is not currently accepting applications.');
    }

    const body = req.body;
    const id = uuidv4();
    const applicationNo = await nextSequenceNo(db, {
      table: 'admissions', column: 'application_no', institutionId: institution.id, prefix: 'APP',
    });

    await db.execute(
      `INSERT INTO admissions
         (id, institution_id, application_no, applicant_name, email, phone, dob,
          class_applying, parent_name, parent_phone, address, status, remarks, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 'website')`,
      [
        id, institution.id, applicationNo, body.applicant_name, body.email, body.phone,
        body.dob, body.class_applying, body.parent_name, body.parent_phone, body.address,
        body.remarks,
      ]
    );

    const created = await findOwnedOrFail(db, 'admissions', id, institution.id);
    res.status(201).json({ application_no: created.application_no, status: created.status });
  })
);

export default router;
