export const FEATURE_CATALOG = [
  { key: 'dashboard', label: 'Dashboard', status: 'live' },
  { key: 'students', label: 'Students', status: 'live' },
  { key: 'admissions', label: 'Admissions CRM', status: 'live' },
  { key: 'attendance', label: 'Attendance', status: 'live' },
  { key: 'fees', label: 'Fees & Invoices', status: 'live' },
  { key: 'communication', label: 'Communication Center', status: 'live' },
  { key: 'exams', label: 'Exams & Results', status: 'live' },
  { key: 'lms', label: 'Learning Management', status: 'live' },
  { key: 'transport', label: 'Transport', status: 'live' },
  { key: 'ai_tutor', label: 'AI Tutor', status: 'live' },
  { key: 'career_path', label: 'Career Path AI', status: 'live' },
  { key: 'performance_analysis', label: 'Performance AI', status: 'live' },
  { key: 'fee_recovery', label: 'Fee Recovery AI', status: 'live' },
  { key: 'programs', label: 'Programs & Courses', status: 'live' },
  { key: 'certifications', label: 'Certifications', status: 'live' },
  { key: 'scholarships', label: 'Scholarships & Cashback', status: 'live' },
  { key: 'referrals', label: 'Referrals & Commissions', status: 'live' },
  { key: 'leads', label: 'Lead CRM', status: 'live' },
  { key: 'documents', label: 'Document Vault', status: 'live' },
  { key: 'reports', label: 'Reports & Analytics', status: 'live' },
  { key: 'reports_builder', label: 'Custom Report Builder', status: 'live' },
  { key: 'payments', label: 'Payment Gateway', status: 'planned' },
  { key: 'whatsapp_sms', label: 'WhatsApp & SMS', status: 'planned' },
  { key: 'hostel', label: 'Hostel', status: 'live' },
  { key: 'library', label: 'Library', status: 'live' },
  { key: 'inventory', label: 'Inventory', status: 'live' },
  { key: 'payroll', label: 'HR & Payroll', status: 'live' },
  { key: 'video_classes', label: 'Video Classes', status: 'live' },
  // Duplicate of `certifications` above (same concept: issue a certificate
  // to a student) — kept as a planned alias so old tenant settings that
  // reference it don't break, but it's not a separate module to build.
  { key: 'certificates', label: 'Certificates', status: 'planned' },
  { key: 'api_access', label: 'API Access', status: 'planned' },
  { key: 'custom_branding', label: 'Custom Branding', status: 'live' },
  { key: 'biometric_attendance', label: 'Biometric Attendance', status: 'live' },
  { key: 'timetable', label: 'Timetable Builder', status: 'live' },
  { key: 'homework', label: 'Homework & Assignments', status: 'live' },
  { key: 'calendar', label: 'School Calendar', status: 'live' },
  { key: 'id_cards', label: 'ID Card Generator', status: 'live' },
  { key: 'staff_leave', label: 'Staff Leave Management', status: 'live' },
  { key: 'admission_form', label: 'Public Admission Form', status: 'live' },
  { key: 'discipline', label: 'Discipline Tracking', status: 'live' },
  { key: 'report_cards', label: 'Report Card Generator', status: 'live' },
  { key: 'visitor_management', label: 'Visitor & Gate Pass', status: 'live' },
  { key: 'facility_booking', label: 'Facility Booking', status: 'live' },
  { key: 'alumni', label: 'Alumni Network', status: 'live' },
  { key: 'ptm_scheduler', label: 'Parent-Teacher Meeting Scheduler', status: 'live' },
  { key: 'online_quiz', label: 'Online Quiz/Test Module', status: 'live' },
  { key: 'feedback_survey', label: 'Feedback & Survey Builder', status: 'live' },
  { key: 'multi_branch', label: 'Multi-Branch/Campus Management', status: 'live' },
];

export const PLAN_DEFINITIONS = {
  free: ['dashboard', 'students', 'attendance'],
  starter: ['dashboard', 'students', 'admissions', 'attendance', 'fees', 'exams', 'communication', 'documents', 'leads'],
  growth: ['dashboard', 'students', 'admissions', 'attendance', 'fees', 'communication', 'exams', 'lms', 'transport', 'hostel', 'library', 'inventory', 'video_classes', 'custom_branding', 'biometric_attendance', 'timetable', 'homework', 'calendar', 'id_cards', 'ai_tutor', 'performance_analysis', 'documents', 'leads', 'programs', 'certifications', 'reports', 'reports_builder', 'staff_leave', 'admission_form', 'discipline', 'report_cards', 'visitor_management', 'facility_booking', 'alumni', 'ptm_scheduler', 'online_quiz', 'feedback_survey', 'multi_branch'],
  pro: ['dashboard', 'students', 'admissions', 'attendance', 'fees', 'communication', 'exams', 'lms', 'transport', 'hostel', 'library', 'inventory', 'payroll', 'video_classes', 'custom_branding', 'biometric_attendance', 'timetable', 'homework', 'calendar', 'id_cards', 'ai_tutor', 'career_path', 'performance_analysis', 'fee_recovery', 'whatsapp_sms', 'reports_builder', 'payments', 'documents', 'leads', 'programs', 'certifications', 'reports', 'scholarships', 'referrals', 'staff_leave', 'admission_form', 'discipline', 'report_cards', 'visitor_management', 'facility_booking', 'alumni', 'ptm_scheduler', 'online_quiz', 'feedback_survey', 'multi_branch'],
  enterprise: FEATURE_CATALOG.map(feature => feature.key),
};

export function getPlanFeatureMap(plan = 'free', overrides = {}) {
  const planFeatures = PLAN_DEFINITIONS[plan] || PLAN_DEFINITIONS.free;
  const base = Object.fromEntries(FEATURE_CATALOG.map(feature => [feature.key, planFeatures.includes(feature.key)]));
  return { ...base, ...(overrides || {}) };
}

export const PLAN_LIMITS = {
  free: { users: 5, students: 100, aiCredits: 0 },
  starter: { users: 25, students: 500, aiCredits: 100 },
  growth: { users: 100, students: 2000, aiCredits: 1000 },
  pro: { users: 300, students: 10000, aiCredits: 5000 },
  enterprise: { users: null, students: null, aiCredits: null },
};

export function getPlanLimits(plan = 'free') {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

/**
 * Roles a tenant admin is allowed to restrict.
 *
 * institution_admin/principal are excluded on purpose: they are the ones
 * setting the restrictions, so letting them lock themselves out would be a
 * self-inflicted support ticket. super_admin/admin are platform roles and
 * never tenant-restricted at all.
 */
export const RESTRICTABLE_ROLES = ['teacher', 'student', 'parent', 'staff'];

/** `settings.role_features` narrowed to live features and restrictable roles. */
export function sanitizeRoleFeatures(raw) {
  const clean = {};
  if (!raw || typeof raw !== 'object') return clean;
  const liveKeys = new Set(FEATURE_CATALOG.filter((f) => f.status === 'live').map((f) => f.key));

  for (const role of RESTRICTABLE_ROLES) {
    const value = raw[role];
    if (!Array.isArray(value)) continue;
    clean[role] = [...new Set(value.filter((key) => liveKeys.has(key)))];
  }
  return clean;
}

/**
 * What a specific role can actually see: the plan's features, narrowed
 * further by whatever the tenant admin restricted that role to. A role
 * with no override in `settings.role_features` gets everything the plan
 * enables — restrictions are opt-in, so this stays backward compatible
 * with every tenant that has never touched the setting.
 */
export function getEffectiveFeatureMap(institution, role) {
  const plan = institution?.subscription_plan || 'free';
  const planMap = getPlanFeatureMap(plan, institution?.settings?.modules || {});

  if (!RESTRICTABLE_ROLES.includes(role)) return planMap;

  const override = institution?.settings?.role_features?.[role];
  if (!Array.isArray(override)) return planMap;

  const allowed = new Set(override);
  return Object.fromEntries(
    Object.entries(planMap).map(([key, enabled]) => [key, enabled && allowed.has(key)])
  );
}

export function isFeatureEnabledForRole(institution, role, featureKey) {
  if (!featureKey) return true;
  return Boolean(getEffectiveFeatureMap(institution, role)[featureKey]);
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
