export const formatCurrency = (value, currency = '₹') => {
  if (!value) return '₹0';
  return `${currency}${value.toLocaleString('en-IN')}`;
};

/**
 * Uploaded files (student/teacher/visitor photos, documents) are served
 * relative to the API host, not the SPA host — the two are on different
 * subdomains in production (erp-api. vs erp.). A bare `photo_url` from the
 * database resolves against the wrong origin unless prefixed here.
 */
export const fileHref = (url) => {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  return `${apiBase.replace(/\/api\/?$/, '')}${url}`;
};

export const formatDate = (date) => {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-IN');
};

export const formatTime = (time) => {
  if (!time) return '';
  const [hours, minutes] = time.split(':');
  return `${hours}:${minutes}`;
};

export const calculateAttendancePercentage = (present, total) => {
  if (total === 0) return 0;
  return Math.round((present / total) * 100);
};

export const getInitials = (name) => {
  if (!name) return '';
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase();
};

export const getStatusColor = (status) => {
  const colors = {
    active: 'emerald',
    inactive: 'gray',
    pending: 'amber',
    success: 'emerald',
    failed: 'red',
    warning: 'amber',
    error: 'red',
  };
  return colors[status] || 'gray';
};

/**
 * Map a status string onto a neumorphic badge tone.
 *
 * `color` is a `neu-badge-*` modifier, not a Tailwind class — the badge
 * carries its tone through the text and dot colour, since a low-contrast
 * material cannot also carry a coloured fill.
 */
const STATUS_TONES = {
  // generic
  active: ['Active', 'success'],
  inactive: ['Inactive', 'neutral'],
  pending: ['Pending', 'warning'],
  success: ['Success', 'success'],
  failed: ['Failed', 'danger'],
  draft: ['Draft', 'neutral'],
  archived: ['Archived', 'neutral'],
  cancelled: ['Cancelled', 'danger'],

  // review workflows
  submitted: ['Submitted', 'info'],
  under_review: ['Under review', 'info'],
  approved: ['Approved', 'success'],
  rejected: ['Rejected', 'danger'],
  verified: ['Verified', 'success'],
  withdrawn: ['Withdrawn', 'neutral'],

  // admissions + CRM
  new: ['New', 'info'],
  contacted: ['Contacted', 'info'],
  qualified: ['Qualified', 'violet'],
  proposal: ['Proposal', 'violet'],
  won: ['Won', 'success'],
  lost: ['Lost', 'danger'],
  converted: ['Converted', 'success'],
  expired: ['Expired', 'neutral'],

  // money
  invoiced: ['Invoiced', 'info'],
  issued: ['Issued', 'info'],
  paid: ['Paid', 'success'],
  disbursed: ['Disbursed', 'success'],
  overdue: ['Overdue', 'danger'],
  past_due: ['Past due', 'danger'],
  void: ['Void', 'neutral'],
  revoked: ['Revoked', 'danger'],

  // subscriptions
  trialing: ['Trial', 'info'],
  suspended: ['Suspended', 'danger'],
  open: ['Open', 'success'],
  closed: ['Closed', 'neutral'],
  paused: ['Paused', 'warning'],
  blocked: ['Blocked', 'danger'],
};

const TONE_CLASS = {
  success: 'neu-badge-success',
  warning: 'neu-badge-warning',
  danger: 'neu-badge-danger',
  info: 'neu-badge-info',
  violet: 'neu-badge-violet',
  neutral: '',
};

export const getStatusBadge = (status) => {
  const key = String(status ?? '').toLowerCase();
  const [label, tone] = STATUS_TONES[key] || [
    // "under_review" -> "Under review"
    key ? key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : 'Unknown',
    'neutral',
  ];
  return { label, tone, color: TONE_CLASS[tone] ?? '' };
};

export const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

export const validatePhone = (phone) => {
  const re = /^[0-9]{10}$/;
  return re.test(phone.replace(/\D/g, ''));
};

export const truncateText = (text, length = 50) => {
  if (!text) return '';
  return text.length > length ? `${text.substring(0, length)}...` : text;
};

export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const downloadJSON = (data, filename = 'data.json') => {
  const element = document.createElement('a');
  element.setAttribute('href', `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`);
  element.setAttribute('download', filename);
  element.style.display = 'none';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
};

export const generateColor = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 60%)`;
};

export const rgbToHex = (r, g, b) => {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
};

export const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};
