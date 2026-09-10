/**
 * Route visibility per role.
 *
 * This is a UX layer only — it decides what a role can see and navigate to.
 * The API enforces the real thing in `backend/src/auth/permissions.js`;
 * keep the two in step when you add a module.
 */
import { FEATURE_CATALOG, isFeatureEnabledForRole } from '../saas/features';

const TENANT_ADMIN_ROUTES = [
  '/dashboard',
  '/students',
  '/teachers',
  '/attendance',
  '/exams',
  '/lms',
  '/programs',
  '/certifications',
  '/admissions',
  '/leads',
  '/scholarships',
  '/referrals',
  '/documents',
  '/transport',
  '/hostel',
  '/library',
  '/inventory',
  '/payroll',
  '/video-classes',
  '/reports-builder',
  '/biometric-attendance',
  '/timetable',
  '/homework',
  '/calendar',
  '/id-cards',
  '/communication',
  '/fees',
  '/reports',
  '/ai-tutor',
  '/career-path',
  '/performance-analysis',
  '/fee-recovery',
  '/leave',
  '/discipline',
  '/report-cards',
  '/visitors',
  '/facilities',
  '/alumni',
  '/ptm',
  '/quizzes',
  '/surveys',
  '/branches',
  '/gps-tracking',
  '/wallet',
  '/substitutes',
  '/health-records',
  '/early-warning',
  '/hall-tickets',
  '/settings',
  '/profile',
];

export const ROLE_PERMISSIONS = {
  super_admin: [
    '/admin',
    '/dashboard',
    '/reports',
    '/settings',
    '/profile',
    '/performance-analysis',
  ],
  institution_admin: TENANT_ADMIN_ROUTES,
  principal: TENANT_ADMIN_ROUTES,

  teacher: [
    '/dashboard',
    '/students',
    '/attendance',
    '/timetable',
    '/homework',
    '/calendar',
    '/exams',
    '/hall-tickets',
    '/report-cards',
    '/discipline',
    '/lms',
    '/programs',
    '/certifications',
    '/leave',
    '/facilities',
    '/ptm',
    '/quizzes',
    '/substitutes',
    '/early-warning',
    '/communication',
    '/ai-tutor',
    '/performance-analysis',
    '/profile',
  ],

  student: [
    '/dashboard',
    '/attendance',
    '/timetable',
    '/homework',
    '/calendar',
    '/exams',
    '/report-cards',
    '/quizzes',
    '/lms',
    '/programs',
    '/certifications',
    '/scholarships',
    '/documents',
    '/communication',
    '/ai-tutor',
    '/career-path',
    '/profile',
  ],

  parent: [
    '/dashboard',
    '/attendance',
    '/timetable',
    '/homework',
    '/calendar',
    '/exams',
    '/report-cards',
    '/ptm',
    '/communication',
    '/fees',
    '/scholarships',
    '/certifications',
    '/performance-analysis',
    '/profile',
  ],

  staff: [
    '/dashboard',
    '/students',
    '/admissions',
    '/leads',
    '/scholarships',
    '/referrals',
    '/alumni',
    '/documents',
    '/programs',
    '/transport',
    '/hostel',
    '/library',
    '/inventory',
    '/video-classes',
    '/biometric-attendance',
    '/discipline',
    '/visitors',
    '/facilities',
    '/leave',
    '/ptm',
    '/surveys',
    '/gps-tracking',
    '/wallet',
    '/health-records',
    '/substitutes',
    '/early-warning',
    '/calendar',
    '/communication',
    '/fees',
    '/reports',
    '/profile',
  ],
};

export function getRolePermissions(role = 'student') {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.student;
}

/**
 * `institution` is optional and, when passed, extends the static list above:
 * a tenant admin's Settings > Role Restrictions can only ever narrow what a
 * role sees among routes already in its baseline list — restricting a role
 * to a *subset* is the only lever `isFeatureEnabledForRole` gives on its
 * own. Granting a restrictable role a module outside that baseline (e.g.
 * turning "Fees" on for students, who don't have /fees above) needs this
 * extra check against the feature catalog's own `route`, or the admin's
 * grant would show in the sidebar (Sidebar.jsx adds it) but 403 here.
 */
export function canAccessPath(role, pathname, institution) {
  const permissions = getRolePermissions(role);
  if (permissions.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return true;
  if (!institution) return false;

  const feature = FEATURE_CATALOG.find((f) => f.route && (pathname === f.route || pathname.startsWith(`${f.route}/`)));
  return Boolean(feature && isFeatureEnabledForRole(institution, role, feature.key));
}

export function canManageTenantUsers(role) {
  return ['super_admin', 'institution_admin', 'principal'].includes(role);
}
