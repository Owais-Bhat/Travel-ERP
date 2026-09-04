/**
 * Route visibility per role.
 *
 * This is a UX layer only — it decides what a role can see and navigate to.
 * The API enforces the real thing in `backend/src/auth/permissions.js`;
 * keep the two in step when you add a module.
 */
const TENANT_ADMIN_ROUTES = [
  '/dashboard',
  '/students',
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
  '/communication',
  '/fees',
  '/reports',
  '/ai-tutor',
  '/career-path',
  '/performance-analysis',
  '/fee-recovery',
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
    '/exams',
    '/lms',
    '/programs',
    '/certifications',
    '/communication',
    '/ai-tutor',
    '/performance-analysis',
    '/profile',
  ],

  student: [
    '/dashboard',
    '/attendance',
    '/exams',
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
    '/exams',
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
    '/documents',
    '/programs',
    '/transport',
    '/hostel',
    '/library',
    '/inventory',
    '/video-classes',
    '/communication',
    '/fees',
    '/reports',
    '/profile',
  ],
};

export function getRolePermissions(role = 'student') {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.student;
}

export function canAccessPath(role, pathname) {
  const permissions = getRolePermissions(role);
  return permissions.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function canManageTenantUsers(role) {
  return ['super_admin', 'institution_admin', 'principal'].includes(role);
}
