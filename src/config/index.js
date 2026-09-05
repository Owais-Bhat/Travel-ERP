// API Configuration
export const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY || '';
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
export const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:5000';

// Feature Flags
export const FEATURES = {
  AI_ENABLED: true,
  LMS_ENABLED: true,
  TRANSPORT_TRACKING: true,
  REAL_TIME_NOTIFICATIONS: true,
};

// Institution Types
export const INSTITUTION_TYPES = [
  { id: 'school', label: 'School', icon: 'school' },
  { id: 'college', label: 'College', icon: 'university' },
  { id: 'university', label: 'University', icon: 'graduation-cap' },
  { id: 'coaching', label: 'Coaching Center', icon: 'book' },
];

// User Roles
export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  INSTITUTION_ADMIN: 'institution_admin',
  PRINCIPAL: 'principal',
  TEACHER: 'teacher',
  STUDENT: 'student',
  PARENT: 'parent',
  STAFF: 'staff',
  ADMIN: 'admin',
};

// Accent palette. Surface colours live in src/styles/neumorphism.css.
export const COLORS = {
  primary: '#0066FF',
  light_blue: '#E0F2FE',
  sky_blue: '#87CEEB',
  deep_navy: '#0F172A',
  neon_cyan: '#00F0FF',
  violet: '#7C3AED',
  emerald: '#10B981',
  amber: '#F59E0B',
  red: '#EF4444',
  dark_bg: 'rgba(15, 23, 42, 0.9)',
  glass_light: 'rgba(224, 242, 254, 0.6)',
  glass_dark: 'rgba(255, 255, 255, 0.08)',
};

// Pagination
export const PAGINATION = {
  PAGE_SIZE: 20,
  MAX_RESULTS: 1000,
};

// Date Formats
export const DATE_FORMATS = {
  DISPLAY: 'MMM d, yyyy',
  INPUT: 'yyyy-MM-dd',
  FULL: 'EEEE, MMMM d, yyyy',
  TIME: 'HH:mm',
  DATETIME: 'MMM d, yyyy HH:mm',
};

// Status Badges
export const STATUS_COLORS = {
  active: 'emerald',
  pending: 'amber',
  inactive: 'gray',
  failed: 'red',
  success: 'emerald',
  warning: 'amber',
  error: 'red',
  info: 'blue',
};

// Menu Items for different roles (icon names mapped in Sidebar component)
// Menu Items for different roles (icon names mapped in Sidebar component)
const TENANT_ADMIN_MENU = [
  {
    key: 'dashboard', iconName: 'MdDashboard', label: 'Dashboard', path: '/dashboard',
  },
  {
    key: 'academics',
    iconName: 'MdMenuBook',
    label: 'Academics',
    subItems: [
      { key: 'programs', label: 'Programs & Courses', path: '/programs' },
      { key: 'students', label: 'Students', path: '/students' },
      { key: 'attendance', label: 'Attendance', path: '/attendance' },
      { key: 'timetable', label: 'Timetable', path: '/timetable' },
      { key: 'homework', label: 'Homework', path: '/homework' },
      { key: 'exams', label: 'Exams', path: '/exams' },
      { key: 'report-cards', label: 'Report Cards', path: '/report-cards' },
      { key: 'quizzes', label: 'Online Quizzes', path: '/quizzes' },
      { key: 'lms', label: 'Learning', path: '/lms' },
      { key: 'certifications', label: 'Certifications', path: '/certifications' },
      { key: 'discipline', label: 'Discipline', path: '/discipline' },
      { key: 'substitutes', label: 'Substitute Teachers', path: '/substitutes' },
      { key: 'early-warning', label: 'Early-Warning Alerts', path: '/early-warning' },
    ],
  },
  { key: 'calendar', iconName: 'MdCalendarMonth', label: 'Calendar', path: '/calendar' },
  { key: 'ptm', iconName: 'MdEventNote', label: 'PTM Scheduler', path: '/ptm' },
  {
    key: 'growth',
    iconName: 'MdTrendingUp',
    label: 'Growth',
    subItems: [
      { key: 'leads', label: 'Lead CRM', path: '/leads' },
      { key: 'admissions', label: 'Admissions', path: '/admissions' },
      { key: 'referrals', label: 'Referrals', path: '/referrals' },
      { key: 'alumni', label: 'Alumni Network', path: '/alumni' },
      { key: 'surveys', label: 'Feedback & Surveys', path: '/surveys' },
    ],
  },
  {
    key: 'finance',
    iconName: 'MdAccountBalance',
    label: 'Finance',
    subItems: [
      { key: 'fees', label: 'Fees', path: '/fees' },
      { key: 'scholarships', label: 'Scholarships', path: '/scholarships' },
    ],
  },
  {
    key: 'operations',
    iconName: 'MdBusiness',
    label: 'Operations',
    subItems: [
      { key: 'documents', label: 'Documents', path: '/documents' },
      { key: 'transport', label: 'Transport', path: '/transport' },
      { key: 'hostel', label: 'Hostel', path: '/hostel' },
      { key: 'library', label: 'Library', path: '/library' },
      { key: 'inventory', label: 'Inventory', path: '/inventory' },
      { key: 'video-classes', label: 'Video Classes', path: '/video-classes' },
      { key: 'biometric-attendance', label: 'Biometric Attendance', path: '/biometric-attendance' },
      { key: 'id-cards', label: 'ID Cards', path: '/id-cards' },
      { key: 'visitors', label: 'Visitor & Gate Pass', path: '/visitors' },
      { key: 'facilities', label: 'Facility Booking', path: '/facilities' },
      { key: 'gps-tracking', label: 'GPS Bus Tracking', path: '/gps-tracking' },
      { key: 'wallet', label: 'Canteen & Wallet', path: '/wallet' },
      { key: 'health-records', label: 'Health Records', path: '/health-records' },
      { key: 'communication', label: 'Communication', path: '/communication' },
    ],
  },
  {
    key: 'hr',
    iconName: 'MdBadge',
    label: 'HR',
    subItems: [
      { key: 'payroll', label: 'Payroll', path: '/payroll' },
      { key: 'leave', label: 'Leave Management', path: '/leave' },
    ],
  },
  {
    key: 'reports',
    iconName: 'MdAssessment',
    label: 'Reports',
    subItems: [
      { key: 'reports', label: 'Reports & Analytics', path: '/reports' },
      { key: 'reports-builder', label: 'Custom Report Builder', path: '/reports-builder' },
    ],
  },
  {
    key: 'ai',
    iconName: 'MdLightbulb',
    label: 'AI Tools',
    subItems: [
      { key: 'ai-tutor', label: 'AI Tutor', path: '/ai-tutor' },
      { key: 'career-path', label: 'Career Path', path: '/career-path' },
      { key: 'performance', label: 'Performance', path: '/performance-analysis' },
      { key: 'fee-recovery', label: 'Fee Recovery', path: '/fee-recovery' },
    ],
  },
  { key: 'branches', iconName: 'MdSchool', label: 'Branches', path: '/branches' },
  { key: 'settings', iconName: 'MdSettings', label: 'Settings', path: '/settings' },
];

export const MENU_ITEMS = {
  super_admin: [
    {
      key: 'admin',
      iconName: 'MdAdminPanelSettings',
      label: 'HQ Console',
      subItems: [
        { key: 'overview', label: 'Overview', path: '/admin' },
        { key: 'institutions', label: 'Institutions', path: '/admin/institutions' },
        { key: 'create', label: 'Create Institution', path: '/admin/create' },
        { key: 'verification', label: 'Verification Queue', path: '/admin/verification' },
        { key: 'features', label: 'Feature Control', path: '/admin/features' },
        { key: 'plans', label: 'Plan & Pricing', path: '/admin/plans' },
        { key: 'users', label: 'Tenant Users', path: '/admin/users' },
        { key: 'usage', label: 'Feature Usage', path: '/admin/usage' },
        { key: 'announcements', label: 'Announcements', path: '/admin/announcements' },
        { key: 'team', label: 'Super Admin Team', path: '/admin/team' },
        { key: 'audit', label: 'Audit Log', path: '/admin/audit' },
      ],
    },
  ],

  institution_admin: TENANT_ADMIN_MENU,
  principal: TENANT_ADMIN_MENU,

  teacher: [
    { key: 'dashboard', iconName: 'MdDashboard', label: 'Dashboard', path: '/dashboard' },
    { key: 'my-classes', iconName: 'MdPeople', label: 'Students', path: '/students' },
    { key: 'attendance', iconName: 'MdAccessTime', label: 'Attendance', path: '/attendance' },
    { key: 'timetable', iconName: 'MdCalendarMonth', label: 'Timetable', path: '/timetable' },
    { key: 'homework', iconName: 'MdMenuBook', label: 'Homework', path: '/homework' },
    { key: 'lessons', iconName: 'MdMenuBook', label: 'Learning', path: '/lms' },
    { key: 'programs', iconName: 'MdBook', label: 'Programs', path: '/programs' },
    { key: 'exams', iconName: 'MdGrade', label: 'Exams', path: '/exams' },
    { key: 'report-cards', iconName: 'MdAssessment', label: 'Report Cards', path: '/report-cards' },
    { key: 'quizzes', iconName: 'MdQuiz', label: 'Online Quizzes', path: '/quizzes' },
    { key: 'discipline', iconName: 'MdGavel', label: 'Discipline', path: '/discipline' },
    { key: 'certifications', iconName: 'MdWorkspacePremium', label: 'Certifications', path: '/certifications' },
    { key: 'leave', iconName: 'MdEventBusy', label: 'Leave', path: '/leave' },
    { key: 'facilities', iconName: 'MdMeetingRoom', label: 'Facility Booking', path: '/facilities' },
    { key: 'ptm', iconName: 'MdEventNote', label: 'PTM Scheduler', path: '/ptm' },
    { key: 'early-warning', iconName: 'MdWarning', label: 'Early-Warning', path: '/early-warning' },
    { key: 'ai-tutor', iconName: 'MdLightbulb', label: 'AI Tutor', path: '/ai-tutor' },
    { key: 'communication', iconName: 'MdChat', label: 'Communication', path: '/communication' },
  ],

  student: [
    { key: 'dashboard', iconName: 'MdDashboard', label: 'Dashboard', path: '/dashboard' },
    { key: 'lms', iconName: 'MdMenuBook', label: 'Courses', path: '/lms' },
    { key: 'programs', iconName: 'MdBook', label: 'Programs', path: '/programs' },
    { key: 'attendance', iconName: 'MdAccessTime', label: 'Attendance', path: '/attendance' },
    { key: 'timetable', iconName: 'MdCalendarMonth', label: 'Timetable', path: '/timetable' },
    { key: 'homework', iconName: 'MdMenuBook', label: 'Homework', path: '/homework' },
    { key: 'exams', iconName: 'MdGrade', label: 'Exams', path: '/exams' },
    { key: 'report-cards', iconName: 'MdAssessment', label: 'Report Card', path: '/report-cards' },
    { key: 'quizzes', iconName: 'MdQuiz', label: 'Online Quizzes', path: '/quizzes' },
    { key: 'scholarships', iconName: 'MdCardGiftcard', label: 'Scholarships', path: '/scholarships' },
    { key: 'certifications', iconName: 'MdWorkspacePremium', label: 'Certificates', path: '/certifications' },
    { key: 'documents', iconName: 'MdFolderShared', label: 'My Documents', path: '/documents' },
    { key: 'ai-tutor', iconName: 'MdLightbulb', label: 'AI Tutor', path: '/ai-tutor' },
    { key: 'career-path', iconName: 'MdTrendingUp', label: 'Career Path', path: '/career-path' },
    { key: 'communication', iconName: 'MdChat', label: 'Messages', path: '/communication' },
  ],

  parent: [
    { key: 'dashboard', iconName: 'MdDashboard', label: 'Dashboard', path: '/dashboard' },
    { key: 'child', iconName: 'MdPerson', label: 'Profile', path: '/profile' },
    { key: 'attendance', iconName: 'MdAccessTime', label: 'Attendance', path: '/attendance' },
    { key: 'timetable', iconName: 'MdCalendarMonth', label: 'Timetable', path: '/timetable' },
    { key: 'homework', iconName: 'MdMenuBook', label: 'Homework', path: '/homework' },
    { key: 'exams', iconName: 'MdGrade', label: 'Exams', path: '/exams' },
    { key: 'report-cards', iconName: 'MdAssessment', label: 'Report Card', path: '/report-cards' },
    { key: 'ptm', iconName: 'MdEventNote', label: 'PTM Scheduler', path: '/ptm' },
    { key: 'performance-analysis', iconName: 'MdBarChart', label: 'Performance', path: '/performance-analysis' },
    { key: 'fees', iconName: 'MdAccountBalance', label: 'Fees', path: '/fees' },
    { key: 'scholarships', iconName: 'MdCardGiftcard', label: 'Scholarships', path: '/scholarships' },
    { key: 'certifications', iconName: 'MdWorkspacePremium', label: 'Certificates', path: '/certifications' },
    { key: 'communication', iconName: 'MdChat', label: 'Messages', path: '/communication' },
  ],

  staff: [
    { key: 'dashboard', iconName: 'MdDashboard', label: 'Dashboard', path: '/dashboard' },
    { key: 'leads', iconName: 'MdContactPhone', label: 'Lead CRM', path: '/leads' },
    { key: 'admissions', iconName: 'MdBusiness', label: 'Admissions', path: '/admissions' },
    { key: 'students', iconName: 'MdPeople', label: 'Students', path: '/students' },
    { key: 'discipline', iconName: 'MdGavel', label: 'Discipline', path: '/discipline' },
    { key: 'documents', iconName: 'MdFolderShared', label: 'Documents', path: '/documents' },
    { key: 'scholarships', iconName: 'MdCardGiftcard', label: 'Scholarships', path: '/scholarships' },
    { key: 'referrals', iconName: 'MdHandshake', label: 'Referrals', path: '/referrals' },
    { key: 'alumni', iconName: 'MdSchool', label: 'Alumni', path: '/alumni' },
    { key: 'fees', iconName: 'MdAccountBalance', label: 'Fees', path: '/fees' },
    { key: 'transport', iconName: 'MdDirectionsBus', label: 'Transport', path: '/transport' },
    { key: 'visitors', iconName: 'MdBadge', label: 'Visitors', path: '/visitors' },
    { key: 'facilities', iconName: 'MdMeetingRoom', label: 'Facility Booking', path: '/facilities' },
    { key: 'leave', iconName: 'MdEventBusy', label: 'Leave', path: '/leave' },
    { key: 'ptm', iconName: 'MdEventNote', label: 'PTM Scheduler', path: '/ptm' },
    { key: 'surveys', iconName: 'MdPoll', label: 'Surveys', path: '/surveys' },
    { key: 'gps-tracking', iconName: 'MdDirectionsBus', label: 'GPS Bus Tracking', path: '/gps-tracking' },
    { key: 'wallet', iconName: 'MdAccountBalance', label: 'Canteen & Wallet', path: '/wallet' },
    { key: 'health-records', iconName: 'MdPerson', label: 'Health Records', path: '/health-records' },
    { key: 'substitutes', iconName: 'MdGavel', label: 'Substitute Teachers', path: '/substitutes' },
    { key: 'early-warning', iconName: 'MdWarning', label: 'Early-Warning', path: '/early-warning' },
    { key: 'reports', iconName: 'MdAssessment', label: 'Reports', path: '/reports' },
    { key: 'communication', iconName: 'MdChat', label: 'Communication', path: '/communication' },
  ],
};

export default {
  API_BASE_URL,
  WS_URL,
  OPENROUTER_API_KEY,
  FEATURES,
  INSTITUTION_TYPES,
  ROLES,
  COLORS,
  PAGINATION,
  DATE_FORMATS,
  STATUS_COLORS,
  MENU_ITEMS,
};
