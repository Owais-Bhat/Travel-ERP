/**
 * Role-based permissions for the API.
 *
 * The frontend hides what a role cannot use; this file is what actually
 * enforces it. Permissions are `resource.action` strings so a route can
 * declare intent (`requirePermission('scholarships.approve')`) without
 * knowing which roles happen to hold it today.
 *
 * Keep this in sync with `src/auth/permissions.js` on the frontend.
 */
import { ApiError } from '../lib/errors.js';

export const PERMISSIONS = {
  // platform
  'platform.manage': 'Manage the SaaS platform and all tenants',
  'institutions.verify': 'Approve or reject institution verification',

  // tenant administration
  'institution.manage': 'Edit institution profile and settings',
  'users.manage': 'Invite, edit and deactivate tenant users',
  'audit.read': 'Read the activity log',

  // academics
  'students.read': 'View students',
  'students.write': 'Create and edit students',
  'students.delete': 'Delete students',
  'programs.read': 'View programs and courses',
  'programs.write': 'Create and edit programs and courses',
  'certifications.read': 'View issued certifications',
  'certifications.write': 'Issue and revoke certifications',
  'attendance.read': 'View attendance',
  'attendance.write': 'Mark attendance',
  'exams.read': 'View exams and results',
  'exams.write': 'Create exams and enter results',

  // admissions + CRM
  'admissions.read': 'View applications',
  'admissions.write': 'Create and edit applications',
  'admissions.decide': 'Issue offers, accept or reject applications',
  'leads.read': 'View CRM leads',
  'leads.write': 'Create, assign and progress leads',

  // money
  'fees.read': 'View fee structures and payments',
  'fees.write': 'Record payments and edit fee structures',
  'scholarships.read': 'View scholarship schemes and applications',
  'scholarships.write': 'Create schemes and submit applications',
  'scholarships.approve': 'Approve, reject and disburse scholarships',
  'referrals.read': 'View referral partners and referrals',
  'referrals.write': 'Create and edit partners and referrals',
  'commissions.approve': 'Approve commissions and issue invoices',

  // documents + comms
  'documents.read': 'View uploaded documents',
  'documents.write': 'Upload documents',
  'documents.verify': 'Verify or reject documents',
  'communication.read': 'View announcements and messages',
  'communication.write': 'Send announcements and messages',

  // reporting
  'reports.read': 'View reports and analytics',
};

const READ_ONLY_ACADEMIC = [
  'students.read', 'programs.read', 'attendance.read', 'exams.read',
  'certifications.read', 'communication.read', 'documents.read',
];

const TENANT_ADMIN = [
  'institution.manage', 'users.manage', 'audit.read',
  'students.read', 'students.write', 'students.delete',
  'programs.read', 'programs.write',
  'certifications.read', 'certifications.write',
  'attendance.read', 'attendance.write',
  'exams.read', 'exams.write',
  'admissions.read', 'admissions.write', 'admissions.decide',
  'leads.read', 'leads.write',
  'fees.read', 'fees.write',
  'scholarships.read', 'scholarships.write', 'scholarships.approve',
  'referrals.read', 'referrals.write', 'commissions.approve',
  'documents.read', 'documents.write', 'documents.verify',
  'communication.read', 'communication.write',
  'reports.read',
];

export const ROLE_PERMISSIONS = {
  super_admin: Object.keys(PERMISSIONS),
  admin: Object.keys(PERMISSIONS),
  institution_admin: TENANT_ADMIN,
  principal: TENANT_ADMIN,

  staff: [
    'students.read', 'students.write',
    'programs.read',
    'admissions.read', 'admissions.write',
    'leads.read', 'leads.write',
    'fees.read', 'fees.write',
    'scholarships.read', 'scholarships.write',
    'referrals.read', 'referrals.write',
    'documents.read', 'documents.write', 'documents.verify',
    'communication.read', 'communication.write',
    'certifications.read',
    'reports.read',
  ],

  teacher: [
    ...READ_ONLY_ACADEMIC,
    'students.write',
    'attendance.write',
    'exams.write',
    'communication.write',
  ],

  student: [
    'programs.read', 'attendance.read', 'exams.read', 'certifications.read',
    'communication.read', 'communication.write',
    'documents.read', 'documents.write',
    'scholarships.read', 'scholarships.write',
    'fees.read',
  ],

  parent: [
    'attendance.read', 'exams.read', 'fees.read',
    'communication.read', 'communication.write',
    'documents.read',
    'scholarships.read',
    'certifications.read',
  ],
};

export function permissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || [];
}

export function roleHasPermission(role, permission) {
  return permissionsForRole(role).includes(permission);
}

/**
 * Express middleware. Accepts one permission or a list — the caller needs
 * *any* of them. Must run after `requireAuthenticatedProfile`.
 */
export function requirePermission(...required) {
  const needed = required.flat();
  return (req, res, next) => {
    const role = req.auth?.profile?.role;
    if (!role) return next(ApiError.unauthorized());

    const granted = permissionsForRole(role);
    if (needed.some((permission) => granted.includes(permission))) return next();

    return next(ApiError.forbidden(
      `This action requires: ${needed.join(' or ')}`,
      { code: 'missing_permission', details: { required: needed, role } }
    ));
  };
}
