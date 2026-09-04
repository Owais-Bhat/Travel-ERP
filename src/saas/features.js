export const FEATURE_CATEGORIES = {
  core: 'Core Operations',
  academics: 'Academic Depth',
  engagement: 'Engagement',
  ai: 'AI & Automation',
  extensions: 'Institution Extensions',
  platform: 'Platform Controls',
};

export const FEATURE_CATALOG = [
  { key: 'dashboard', label: 'Dashboard', category: 'core', route: '/dashboard', status: 'live' },
  { key: 'students', label: 'Students', category: 'core', route: '/students', status: 'live' },
  { key: 'admissions', label: 'Admissions CRM', category: 'core', route: '/admissions', status: 'live' },
  { key: 'attendance', label: 'Attendance', category: 'core', route: '/attendance', status: 'live' },
  { key: 'fees', label: 'Fees & Invoices', category: 'core', route: '/fees', status: 'live' },
  { key: 'communication', label: 'Communication Center', category: 'engagement', route: '/communication', status: 'live' },
  { key: 'exams', label: 'Exams & Results', category: 'academics', route: '/exams', status: 'live' },
  { key: 'lms', label: 'Learning Management', category: 'academics', route: '/lms', status: 'live' },
  { key: 'transport', label: 'Transport', category: 'extensions', route: '/transport', status: 'live' },
  { key: 'ai_tutor', label: 'AI Tutor', category: 'ai', route: '/ai-tutor', status: 'live' },
  { key: 'career_path', label: 'Career Path AI', category: 'ai', route: '/career-path', status: 'live' },
  { key: 'performance_analysis', label: 'Performance AI', category: 'ai', route: '/performance-analysis', status: 'live' },
  { key: 'fee_recovery', label: 'Fee Recovery AI', category: 'ai', route: '/fee-recovery', status: 'live' },
  { key: 'programs', label: 'Programs & Courses', category: 'academics', route: '/programs', status: 'live' },
  { key: 'certifications', label: 'Certifications', category: 'academics', route: '/certifications', status: 'live' },
  { key: 'scholarships', label: 'Scholarships & Cashback', category: 'core', route: '/scholarships', status: 'live' },
  { key: 'referrals', label: 'Referrals & Commissions', category: 'core', route: '/referrals', status: 'live' },
  { key: 'leads', label: 'Lead CRM', category: 'core', route: '/leads', status: 'live' },
  { key: 'documents', label: 'Document Vault', category: 'core', route: '/documents', status: 'live' },
  { key: 'reports', label: 'Reports & Analytics', category: 'platform', route: '/reports', status: 'live' },
  { key: 'reports_builder', label: 'Custom Report Builder', category: 'platform', route: '/reports-builder', status: 'live' },
  { key: 'payments', label: 'Payment Gateway', category: 'platform', route: null, status: 'planned' },
  { key: 'whatsapp_sms', label: 'WhatsApp & SMS', category: 'engagement', route: null, status: 'planned' },
  { key: 'hostel', label: 'Hostel', category: 'extensions', route: '/hostel', status: 'live' },
  { key: 'library', label: 'Library', category: 'extensions', route: '/library', status: 'live' },
  { key: 'inventory', label: 'Inventory', category: 'extensions', route: '/inventory', status: 'live' },
  { key: 'payroll', label: 'HR & Payroll', category: 'extensions', route: '/payroll', status: 'live' },
  { key: 'video_classes', label: 'Video Classes', category: 'engagement', route: '/video-classes', status: 'live' },
  // Duplicate of `certifications` above (issuing a certificate to a
  // student is the same workflow) — kept as a planned alias, not a
  // separate module.
  { key: 'certificates', label: 'Certificates', category: 'academics', route: null, status: 'planned' },
  { key: 'api_access', label: 'API Access', category: 'platform', route: null, status: 'planned' },
  { key: 'custom_branding', label: 'Custom Branding', category: 'platform', route: null, status: 'live' },
  { key: 'biometric_attendance', label: 'Biometric Attendance', category: 'extensions', route: '/biometric-attendance', status: 'live' },
];

export const PLAN_DEFINITIONS = {
  free: {
    label: 'Free',
    monthlyPrice: 0,
    features: ['dashboard', 'students', 'attendance'],
    limits: { users: 5, students: 100, aiCredits: 0 },
  },
  starter: {
    label: 'Starter',
    monthlyPrice: 1999,
    features: ['dashboard', 'students', 'admissions', 'attendance', 'fees', 'exams', 'communication', 'documents', 'leads'],
    limits: { users: 25, students: 500, aiCredits: 100 },
  },
  growth: {
    label: 'Growth',
    monthlyPrice: 4999,
    features: ['dashboard', 'students', 'admissions', 'attendance', 'fees', 'communication', 'exams', 'lms', 'transport', 'hostel', 'library', 'inventory', 'video_classes', 'custom_branding', 'biometric_attendance', 'ai_tutor', 'performance_analysis', 'documents', 'leads', 'programs', 'certifications', 'reports', 'reports_builder'],
    limits: { users: 100, students: 2000, aiCredits: 1000 },
  },
  pro: {
    label: 'Pro',
    monthlyPrice: 9999,
    features: ['dashboard', 'students', 'admissions', 'attendance', 'fees', 'communication', 'exams', 'lms', 'transport', 'hostel', 'library', 'inventory', 'payroll', 'video_classes', 'custom_branding', 'biometric_attendance', 'ai_tutor', 'career_path', 'performance_analysis', 'fee_recovery', 'whatsapp_sms', 'reports_builder', 'payments', 'documents', 'leads', 'programs', 'certifications', 'reports', 'scholarships', 'referrals'],
    limits: { users: 300, students: 10000, aiCredits: 5000 },
  },
  enterprise: {
    label: 'Enterprise',
    monthlyPrice: null,
    features: FEATURE_CATALOG.map(feature => feature.key),
    limits: { users: 'Unlimited', students: 'Unlimited', aiCredits: 'Custom' },
  },
};

export function getPlanFeatureMap(plan = 'free', overrides = {}) {
  const base = PLAN_DEFINITIONS[plan]?.features || PLAN_DEFINITIONS.free.features;
  const map = Object.fromEntries(FEATURE_CATALOG.map(feature => [feature.key, base.includes(feature.key)]));
  return { ...map, ...(overrides || {}) };
}

export function isFeatureEnabled(institution, featureKey) {
  if (!featureKey) return true;
  const plan = institution?.subscription_plan || 'free';
  const overrides = institution?.settings?.modules || {};
  return Boolean(getPlanFeatureMap(plan, overrides)[featureKey]);
}

/**
 * Roles a tenant admin can restrict. institution_admin/principal are
 * excluded — they set the restrictions, so letting them lock themselves
 * out would be a self-inflicted support ticket. Keep in sync with
 * backend/src/saas/features.js.
 */
export const RESTRICTABLE_ROLES = ['teacher', 'student', 'parent', 'staff'];

/**
 * What a specific role can actually see: the plan's features narrowed by
 * whatever the tenant admin restricted that role to (`settings.role_features`).
 * A role with no override gets everything the plan enables — restrictions
 * are opt-in, so a tenant that has never touched the setting is unaffected.
 */
export function isFeatureEnabledForRole(institution, role, featureKey) {
  if (!featureKey) return true;
  if (!isFeatureEnabled(institution, featureKey)) return false;
  if (!RESTRICTABLE_ROLES.includes(role)) return true;

  const override = institution?.settings?.role_features?.[role];
  if (!Array.isArray(override)) return true;
  return override.includes(featureKey);
}

export function getFeatureByRoute(pathname) {
  return FEATURE_CATALOG.find(feature => feature.route && pathname.startsWith(feature.route));
}

export function getPlanLimits(plan = 'free') {
  return PLAN_DEFINITIONS[plan]?.limits || PLAN_DEFINITIONS.free.limits;
}

export function getBillingState(institution) {
  const status = institution?.subscription_status || 'trialing';
  const now = Date.now();
  const trialEndsAt = institution?.trial_ends_at ? new Date(institution.trial_ends_at).getTime() : null;
  const periodEndsAt = institution?.current_period_ends_at ? new Date(institution.current_period_ends_at).getTime() : null;

  if (institution?.settings?.suspended === true || status === 'suspended') return 'suspended';
  if (status === 'trialing' && trialEndsAt && trialEndsAt < now) return 'trial_expired';
  if (status === 'active' && periodEndsAt && periodEndsAt < now) return 'past_due';
  return status;
}

export function isBillingBlocked(institution) {
  return ['suspended', 'trial_expired', 'past_due', 'cancelled'].includes(getBillingState(institution));
}
