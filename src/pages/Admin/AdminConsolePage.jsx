import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  MdAdd,
  MdBarChart,
  MdBusiness,
  MdCheckCircle,
  MdClose,
  MdCreditCard,
  MdDashboard,
  MdHistory,
  MdPeople,
  MdPeopleAlt,
  MdTune,
  MdWarning,
} from 'react-icons/md';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Badge from '../../components/Common/Badge';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import {
  changeInstitutionPlan,
  createAdminInstitution,
  fetchAdminAudit,
  fetchAdminInstitutions,
  fetchAdminUsage,
  fetchSystemHealth,
  impersonateInstitution,
  searchAdminDirectory,
  setInstitutionFeature,
  updateInstitutionSubscription,
} from '../../lib/adminApi';
import { setToken, getToken } from '../../lib/api';
import { fetchInstitutionUsers, inviteInstitutionUser, updateInstitutionUser } from '../../lib/usersApi';
import { useNotification } from '../../hooks/useNotification';
import { FEATURE_CATALOG, FEATURE_CATEGORIES, PLAN_DEFINITIONS, getBillingState, getPlanFeatureMap, getPlanLimits } from '../../saas/features';

const ROLE_OPTIONS = ['institution_admin', 'principal', 'teacher', 'student', 'parent', 'staff'];
const DEFAULT_CREATE_FORM = {
  name: '',
  type: 'School',
  email: '',
  phone: '',
  subscription_plan: 'free',
  billingEmail: '',
  trialDays: 14,
  modules: getPlanFeatureMap('free'),
  adminEmail: '',
  adminPassword: '',
  adminFirstName: '',
  adminLastName: '',
};

function calculateTenantHealth(institution, usageForTenant) {
  const billingState = institution.billing_state || getBillingState(institution);
  const enabledFeatureCount = Object.values(
    getPlanFeatureMap(
      institution.subscription_plan || 'free',
      institution.settings?.modules || institution.enabled_modules || {}
    )
  ).filter(Boolean).length;
  const totalEvents = usageForTenant?.total_events || 0;
  const hasRecentActivity = Boolean(usageForTenant?.last_seen_at);
  const overUsers = Boolean(institution.over_limits?.users);
  const overStudents = Boolean(institution.over_limits?.students);
  const billingBlocked = ['past_due', 'trial_expired', 'suspended', 'cancelled'].includes(billingState);

  const checks = [
    { key: 'billing', label: billingBlocked ? 'Billing blocked' : 'Billing ok', ok: !billingBlocked, penalty: 35 },
    { key: 'users', label: institution.user_count > 0 ? 'Admin users added' : 'No users', ok: (institution.user_count || 0) > 0, penalty: 15 },
    { key: 'students', label: institution.student_count > 0 ? 'Students added' : 'No students', ok: (institution.student_count || 0) > 0, penalty: 15 },
    { key: 'usage', label: hasRecentActivity ? 'Recently active' : 'No recent usage', ok: hasRecentActivity, penalty: 15 },
    { key: 'limits', label: overUsers || overStudents ? 'Over plan limits' : 'Within limits', ok: !overUsers && !overStudents, penalty: 15 },
    { key: 'modules', label: enabledFeatureCount > 0 ? 'Modules enabled' : 'No modules', ok: enabledFeatureCount > 0, penalty: 10 },
  ];

  const score = Math.max(0, checks.reduce((value, check) => (
    check.ok ? value : value - check.penalty
  ), 100));
  const risks = checks.filter(check => !check.ok).map(check => check.label);
  const status = score >= 80 ? 'healthy' : score >= 55 ? 'watch' : 'risk';

  return {
    score,
    status,
    risks,
    enabledFeatureCount,
    totalEvents,
    lastSeenAt: usageForTenant?.last_seen_at || null,
  };
}

function Metric({ icon: Icon, label, value, tone = 'teal' }) {
  const tones = {
    teal: 'bg-[#EEF7F6] text-[#0E7C7B]',
    indigo: 'bg-[#EEF4FF] text-[#4059AD]',
    amber: 'bg-amber-50 text-amber-700',
    coral: 'bg-orange-50 text-[#E0644A]',
  };

  return (
    <GlassCard className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500 mb-2">{label}</p>
          <p className="text-3xl font-extrabold text-slate-950 mb-0">{value}</p>
        </div>
        <div className={`rounded-lg p-3 ${tones[tone]}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </GlassCard>
  );
}

const ADMIN_TABS = [
  { key: 'overview', label: 'Overview', icon: MdDashboard },
  { key: 'institutions', label: 'Institutions', icon: MdBusiness },
  { key: 'create', label: 'Create Institution', icon: MdAdd },
  { key: 'features', label: 'Feature Control', icon: MdTune },
  { key: 'users', label: 'Tenant Users', icon: MdPeopleAlt },
  { key: 'usage', label: 'Feature Usage', icon: MdBarChart },
  { key: 'audit', label: 'Audit Log', icon: MdHistory },
];

const ADMIN_TAB_KEYS = ADMIN_TABS.map((tab) => tab.key);

export default function AdminConsolePage() {
  const navigate = useNavigate();
  const notification = useNotification();
  const { tab: tabParam } = useParams();
  const [activeTab, setActiveTabState] = useState(ADMIN_TAB_KEYS.includes(tabParam) ? tabParam : 'overview');

  // Keep the tab in sync with the URL — a sidebar link like /admin/institutions
  // should land on that tab, and switching tabs should update the address bar
  // so it's linkable/bookmarkable and the browser back button works.
  useEffect(() => {
    setActiveTabState(ADMIN_TAB_KEYS.includes(tabParam) ? tabParam : 'overview');
  }, [tabParam]);

  const setActiveTab = (key) => {
    setActiveTabState(key);
    navigate(key === 'overview' ? '/admin' : `/admin/${key}`);
  };

  const [institutions, setInstitutions] = useState([]);
  const [usage, setUsage] = useState(null);
  const [auditEvents, setAuditEvents] = useState([]);
  const [tenantUsers, setTenantUsers] = useState([]);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState('');
  const [tenantDetailOpen, setTenantDetailOpen] = useState(false);
  const [lastProvisioned, setLastProvisioned] = useState(null);
  const [filters, setFilters] = useState({
    search: '',
    health: 'all',
    plan: 'all',
    billing: 'all',
  });
  const [loading, setLoading] = useState(true);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [loadingTenantUsers, setLoadingTenantUsers] = useState(false);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState(DEFAULT_CREATE_FORM);
  const [supportInvite, setSupportInvite] = useState({
    email: '',
    role: 'institution_admin',
    firstName: '',
    lastName: '',
    temporaryPassword: '',
  });

  const loadInstitutions = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAdminInstitutions();
      const usageData = await fetchAdminUsage().catch(() => null);
      const auditData = await fetchAdminAudit({ limit: 40 }).catch(() => null);
      setInstitutions(data.institutions || []);
      setUsage(usageData);
      setAuditEvents(auditData?.events || []);
    } catch (err) {
      setError(err.message || 'Unable to load admin console');
    } finally {
      setLoading(false);
    }
  };

  const [auditInstitutionFilter, setAuditInstitutionFilter] = useState('');

  const loadAudit = async (institutionId = auditInstitutionFilter) => {
    setLoadingAudit(true);
    setError('');
    try {
      const data = await fetchAdminAudit({ limit: 100, ...(institutionId ? { institutionId } : {}) });
      setAuditEvents(data.events || []);
    } catch (err) {
      setError(err.message || 'Unable to load audit feed');
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    loadInstitutions();
  }, []);

  const updateForm = (field, value) => {
    setForm(prev => {
      if (field === 'subscription_plan') {
        return {
          ...prev,
          subscription_plan: value,
          modules: getPlanFeatureMap(value),
        };
      }
      return { ...prev, [field]: value };
    });
  };

  const toggleCreateModule = (featureKey, enabled) => {
    setForm(prev => ({
      ...prev,
      modules: {
        ...prev.modules,
        [featureKey]: enabled,
      },
    }));
  };

  const handleCreateInstitution = async (event) => {
    event.preventDefault();
    setCreating(true);
    setError('');
    try {
      const result = await createAdminInstitution(form);
      setLastProvisioned({
        institution: result.institution,
        adminEmail: form.adminEmail,
        trialDays: form.trialDays,
        enabledModules: Object.values(form.modules || {}).filter(Boolean).length,
      });
      setSelectedInstitutionId(result.institution?.id || '');
      setForm(DEFAULT_CREATE_FORM);
      await loadInstitutions();
    } catch (err) {
      setError(err.message || 'Unable to create institution');
    } finally {
      setCreating(false);
    }
  };

  const activeUsers = institutions.reduce((sum, institution) => sum + (institution.user_count || 0), 0);
  const freePlanCount = institutions.filter(inst => (inst.subscription_plan || 'free') === 'free').length;
  const blockedCount = institutions.filter(inst => ['past_due', 'trial_expired', 'suspended', 'cancelled'].includes(inst.billing_state || getBillingState(inst))).length;
  const overLimitCount = institutions.filter(inst => inst.over_limits?.users || inst.over_limits?.students).length;
  const tenantHealth = Object.fromEntries(institutions.map(inst => [
    inst.id,
    calculateTenantHealth(inst, usage?.institutions?.[inst.id]),
  ]));
  const selectedInstitution = institutions.find(inst => inst.id === selectedInstitutionId) || institutions[0];
  const selectedHealth = selectedInstitution ? tenantHealth[selectedInstitution.id] : null;
  const selectedFeatureMap = selectedInstitution
    ? getPlanFeatureMap(selectedInstitution.subscription_plan || 'free', selectedInstitution.settings?.modules || selectedInstitution.enabled_modules || {})
    : {};
  const liveFeatures = FEATURE_CATALOG.filter(feature => feature.status === 'live');
  const usageByFeature = usage?.features || {};
  const usageForSelectedInstitution = selectedInstitution ? usage?.institutions?.[selectedInstitution.id] : null;
  const auditForSelectedInstitution = selectedInstitution
    ? auditEvents.filter(event => event.institution_id === selectedInstitution.id)
    : [];
  const selectedEnabledFeatures = FEATURE_CATALOG.filter(feature => selectedFeatureMap[feature.key]);
  const selectedUsedFeatures = Object.entries(usageForSelectedInstitution?.features || {})
    .sort(([, a], [, b]) => (b.count || 0) - (a.count || 0))
    .slice(0, 6);
  const usedFeatureCount = Object.keys(usageByFeature).length;
  const unusedLiveFeatureCount = liveFeatures.filter(feature => !usageByFeature[feature.key]).length;
  const normalizedSearch = filters.search.trim().toLowerCase();
  const filteredInstitutions = institutions.filter(inst => {
    const health = tenantHealth[inst.id];
    const billingState = inst.billing_state || getBillingState(inst);
    const matchesSearch = !normalizedSearch
      || inst.name?.toLowerCase().includes(normalizedSearch)
      || inst.email?.toLowerCase().includes(normalizedSearch)
      || inst.type?.toLowerCase().includes(normalizedSearch);
    const matchesHealth = filters.health === 'all' || health?.status === filters.health;
    const matchesPlan = filters.plan === 'all' || (inst.subscription_plan || 'free') === filters.plan;
    const matchesBilling = filters.billing === 'all' || billingState === filters.billing;
    return matchesSearch && matchesHealth && matchesPlan && matchesBilling;
  });
  const healthyCount = Object.values(tenantHealth).filter(item => item.status === 'healthy').length;
  const watchCount = Object.values(tenantHealth).filter(item => item.status === 'watch').length;
  const riskCount = Object.values(tenantHealth).filter(item => item.status === 'risk').length;
  const averageHealthScore = institutions.length
    ? Math.round(Object.values(tenantHealth).reduce((sum, item) => sum + item.score, 0) / institutions.length)
    : 0;
  const healthAttentionList = filteredInstitutions
    .map(inst => ({ institution: inst, health: tenantHealth[inst.id] }))
    .sort((a, b) => a.health.score - b.health.score)
    .slice(0, 5);

  const CHART_COLORS = ['#0E7C7B', '#4059AD', '#F59E0B', '#E0644A', '#7C3AED', '#10B981'];
  const planChartData = Object.entries(PLAN_DEFINITIONS).map(([planKey, plan]) => ({
    name: plan.label,
    value: institutions.filter(inst => (inst.subscription_plan || 'free') === planKey).length,
  })).filter(item => item.value > 0);
  const healthChartData = [
    { name: 'Healthy', value: healthyCount, fill: '#10B981' },
    { name: 'Watch', value: watchCount, fill: '#F59E0B' },
    { name: 'Risk', value: riskCount, fill: '#EF4444' },
  ];
  const topFeatureChartData = Object.entries(usageByFeature)
    .map(([featureKey, item]) => ({
      name: FEATURE_CATALOG.find(feature => feature.key === featureKey)?.label || featureKey,
      events: item.count || 0,
    }))
    .sort((a, b) => b.events - a.events)
    .slice(0, 8);

  const openTenantDetail = (institutionId) => {
    setSelectedInstitutionId(institutionId);
    setTenantDetailOpen(true);
    setActiveTab('institutions');
  };

  const loadTenantUsers = async (institutionId = selectedInstitution?.id) => {
    if (!institutionId) {
      setTenantUsers([]);
      return;
    }

    setLoadingTenantUsers(true);
    try {
      const data = await fetchInstitutionUsers(institutionId);
      setTenantUsers(data.users || []);
    } catch (err) {
      setError(err.message || 'Unable to load tenant users');
    } finally {
      setLoadingTenantUsers(false);
    }
  };

  useEffect(() => {
    if (selectedInstitution?.id) {
      loadTenantUsers(selectedInstitution.id);
    } else {
      setTenantUsers([]);
    }
  }, [selectedInstitution?.id]);

  const refreshInstitution = (updatedInstitution) => {
    setInstitutions(prev => prev.map(inst => (
      inst.id === updatedInstitution.id
        ? { ...inst, ...updatedInstitution }
        : inst
    )));
  };

  const handlePlanChange = async (institutionId, plan) => {
    setUpdating(`plan:${institutionId}`);
    setError('');
    try {
      const { institution } = await changeInstitutionPlan({ institutionId, plan });
      refreshInstitution(institution);
    } catch (err) {
      setError(err.message || 'Unable to change plan');
    } finally {
      setUpdating('');
    }
  };

  const handleFeatureToggle = async (featureKey, enabled) => {
    if (!selectedInstitution) return;
    setUpdating(`feature:${featureKey}`);
    setError('');
    try {
      const { institution } = await setInstitutionFeature({
        institutionId: selectedInstitution.id,
        featureKey,
        enabled,
      });
      refreshInstitution(institution);
    } catch (err) {
      setError(err.message || 'Unable to update feature access');
    } finally {
      setUpdating('');
    }
  };

  const handleSubscriptionChange = async (institutionId, status) => {
    setUpdating(`subscription:${institutionId}`);
    setError('');
    try {
      const { institution } = await updateInstitutionSubscription({ institutionId, status });
      refreshInstitution(institution);
    } catch (err) {
      setError(err.message || 'Unable to update subscription');
    } finally {
      setUpdating('');
    }
  };

  // ── Bulk actions ──────────────────────────────────────────────────────
  const [selectedInstIds, setSelectedInstIds] = useState(() => new Set());
  const [bulkPlan, setBulkPlan] = useState('starter');
  const [bulkBusy, setBulkBusy] = useState(false);

  const toggleSelectInst = (id, event) => {
    event.stopPropagation();
    setSelectedInstIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    setSelectedInstIds(prev => {
      const allSelected = filteredInstitutions.length > 0
        && filteredInstitutions.every(inst => prev.has(inst.id));
      return allSelected ? new Set() : new Set(filteredInstitutions.map(inst => inst.id));
    });
  };

  const runBulkAction = async (label, ids, action) => {
    setBulkBusy(true);
    setError('');
    const results = await Promise.allSettled(ids.map(action));
    setBulkBusy(false);
    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed > 0) {
      setError(`${label}: ${ids.length - failed} succeeded, ${failed} failed.`);
    }
    await loadInstitutions();
    setSelectedInstIds(new Set());
  };

  const handleBulkChangePlan = () => runBulkAction(
    'Bulk plan change',
    Array.from(selectedInstIds),
    (id) => changeInstitutionPlan({ institutionId: id, plan: bulkPlan })
  );

  const handleBulkSuspend = () => runBulkAction(
    'Bulk suspend',
    Array.from(selectedInstIds),
    (id) => updateInstitutionSubscription({ institutionId: id, status: 'suspended' })
  );

  const handleBulkActivate = () => runBulkAction(
    'Bulk activate',
    Array.from(selectedInstIds),
    (id) => updateInstitutionSubscription({ institutionId: id, status: 'active' })
  );

  // ── CSV export ────────────────────────────────────────────────────────
  const downloadCsv = (filename, headers, rows) => {
    const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [headers.join(','), ...rows.map(row => row.map(escape).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportInstitutionsCsv = () => {
    downloadCsv(
      `institutions_${new Date().toISOString().slice(0, 10)}.csv`,
      ['Name', 'Email', 'Type', 'Plan', 'Billing State', 'Health Score', 'Users', 'Students', 'Created'],
      filteredInstitutions.map(inst => [
        inst.name, inst.email || '', inst.type || 'School',
        inst.subscription_plan || 'free', inst.billing_state || getBillingState(inst),
        tenantHealth[inst.id]?.score ?? '', inst.user_count || 0, inst.student_count || 0,
        inst.created_at ? new Date(inst.created_at).toLocaleDateString('en-IN') : '',
      ])
    );
    notification.success('Institutions exported');
  };

  const exportAuditCsv = () => {
    downloadCsv(
      `audit_log_${new Date().toISOString().slice(0, 10)}.csv`,
      ['Date', 'Action', 'Institution', 'Severity', 'Description'],
      auditEvents.map(event => [
        event.created_at ? new Date(event.created_at).toLocaleString('en-IN') : '',
        formatAuditAction(event.action),
        event.institution_name || '',
        event.severity || 'info',
        event.description || '',
      ])
    );
  };

  // ── Impersonate ───────────────────────────────────────────────────────
  const [impersonating, setImpersonating] = useState(false);

  const handleImpersonate = async (institution) => {
    if (!window.confirm(`Sign in as ${institution.name}'s admin? This starts a support session — you can return to Super Admin any time.`)) {
      return;
    }
    setImpersonating(true);
    setError('');
    try {
      const { token } = await impersonateInstitution(institution.id);
      sessionStorage.setItem('cybermilo_impersonation_origin_token', getToken());
      sessionStorage.setItem('cybermilo_impersonation_origin_name', institution.name);
      setToken(token);
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err.message || 'Unable to impersonate this institution');
      setImpersonating(false);
    }
  };

  // ── Global search ────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);

  const runGlobalSearch = async (event) => {
    event.preventDefault();
    if (searchQuery.trim().length < 2) return;
    setSearching(true);
    try {
      const data = await searchAdminDirectory(searchQuery.trim());
      setSearchResults(data);
    } catch (err) {
      setError(err.message || 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  // ── System health ────────────────────────────────────────────────────
  const [systemHealth, setSystemHealth] = useState(null);

  useEffect(() => {
    fetchSystemHealth().then(setSystemHealth).catch(() => {});
  }, []);

  const handleSupportInvite = async (event) => {
    event.preventDefault();
    if (!selectedInstitution) return;

    setUpdating('support-invite');
    setError('');
    try {
      await inviteInstitutionUser({
        institutionId: selectedInstitution.id,
        email: supportInvite.email,
        role: supportInvite.role,
        firstName: supportInvite.firstName,
        lastName: supportInvite.lastName,
        temporaryPassword: supportInvite.temporaryPassword || undefined,
      });
      setSupportInvite({
        email: '',
        role: 'institution_admin',
        firstName: '',
        lastName: '',
        temporaryPassword: '',
      });
      await loadTenantUsers(selectedInstitution.id);
      await loadInstitutions();
    } catch (err) {
      setError(err.message || 'Unable to invite tenant user');
    } finally {
      setUpdating('');
    }
  };

  const handleTenantUserRole = async (profileId, role) => {
    if (!selectedInstitution) return;

    setUpdating(`tenant-role:${profileId}`);
    setError('');
    try {
      await updateInstitutionUser(profileId, {
        institutionId: selectedInstitution.id,
        role,
      });
      await loadTenantUsers(selectedInstitution.id);
    } catch (err) {
      setError(err.message || 'Unable to update user role');
    } finally {
      setUpdating('');
    }
  };

  const handleTenantUserStatus = async (profileId, isActive) => {
    if (!selectedInstitution) return;

    setUpdating(`tenant-status:${profileId}`);
    setError('');
    try {
      await updateInstitutionUser(profileId, {
        institutionId: selectedInstitution.id,
        isActive,
      });
      await loadTenantUsers(selectedInstitution.id);
      await loadInstitutions();
    } catch (err) {
      setError(err.message || 'Unable to update user status');
    } finally {
      setUpdating('');
    }
  };

  const formatLimit = (value) => value === null || value === undefined ? 'Unlimited' : value;
  const severityStatus = (severity) => {
    if (severity === 'success') return 'success';
    if (severity === 'warning') return 'pending';
    if (severity === 'error') return 'failed';
    return 'active';
  };
  const formatAuditAction = (action = '') => action.split('.').map(part => (
    part ? part[0].toUpperCase() + part.slice(1) : part
  )).join(' ');

  return (
    <MainLayout>
      <div className="p-5 sm:p-6 lg:p-8 space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[#0E7C7B] text-xs font-extrabold uppercase tracking-[0.18em] mb-2">
              SaaS Control
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-950 mb-2">Admin Console</h1>
            <p className="text-slate-500 max-w-2xl">
              Manage school accounts, subscription readiness, and tenant health from one place.
            </p>
          </div>
          <Badge status="active">Super Admin</Badge>
        </div>

        {error && (
          <GlassCard className="p-4 border border-amber-300 bg-amber-50">
            <div className="flex items-start gap-3 text-amber-800">
              <MdWarning className="h-5 w-5 shrink-0 mt-0.5" />
              <p className="text-sm mb-0">
                {error}
              </p>
            </div>
          </GlassCard>
        )}

        {activeTab === 'overview' && (
        <>
        <GlassCard className="p-5">
          <p className="text-sm font-semibold text-slate-500 mb-3">Global Search</p>
          <form onSubmit={runGlobalSearch} className="flex flex-wrap gap-3">
            <Input
              wrapperClass="flex-1 min-w-64 mb-0"
              placeholder="Search any institution, user, or student across every tenant..."
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
            />
            <Button type="submit" loading={searching} disabled={searchQuery.trim().length < 2}>
              Search
            </Button>
            {searchResults && (
              <Button type="button" variant="ghost" onClick={() => { setSearchResults(null); setSearchQuery(''); }}>
                Clear
              </Button>
            )}
          </form>

          {searchResults && (
            <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500 mb-2">
                  Institutions ({searchResults.institutions.length})
                </p>
                {searchResults.institutions.length === 0 ? (
                  <p className="text-sm text-slate-400 mb-0">No matches</p>
                ) : searchResults.institutions.map(inst => (
                  <button
                    key={inst.id}
                    type="button"
                    onClick={() => openTenantDetail(inst.id)}
                    className="block w-full text-left rounded-lg px-3 py-2 mb-1 hover:bg-slate-50 border border-slate-100"
                  >
                    <p className="text-sm font-bold text-slate-950 mb-0">{inst.name}</p>
                    <p className="text-xs text-slate-500 mb-0">{inst.email || 'No email'}</p>
                  </button>
                ))}
              </div>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500 mb-2">
                  Users ({searchResults.users.length})
                </p>
                {searchResults.users.length === 0 ? (
                  <p className="text-sm text-slate-400 mb-0">No matches</p>
                ) : searchResults.users.map(user => (
                  <button
                    key={user.profile_id}
                    type="button"
                    onClick={() => user.institution_id && openTenantDetail(user.institution_id)}
                    className="block w-full text-left rounded-lg px-3 py-2 mb-1 hover:bg-slate-50 border border-slate-100"
                  >
                    <p className="text-sm font-bold text-slate-950 mb-0">
                      {[user.first_name, user.last_name].filter(Boolean).join(' ') || user.email}
                    </p>
                    <p className="text-xs text-slate-500 mb-0">{user.email} · {user.institution_name || 'No institution'}</p>
                  </button>
                ))}
              </div>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500 mb-2">
                  Students ({searchResults.students.length})
                </p>
                {searchResults.students.length === 0 ? (
                  <p className="text-sm text-slate-400 mb-0">No matches</p>
                ) : searchResults.students.map(student => (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => student.institution_id && openTenantDetail(student.institution_id)}
                    className="block w-full text-left rounded-lg px-3 py-2 mb-1 hover:bg-slate-50 border border-slate-100"
                  >
                    <p className="text-sm font-bold text-slate-950 mb-0">
                      {[student.first_name, student.last_name].filter(Boolean).join(' ')}
                    </p>
                    <p className="text-xs text-slate-500 mb-0">{student.admission_no || 'No admission no.'} · {student.institution_name || 'No institution'}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </GlassCard>

        {systemHealth && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            <GlassCard className="p-5">
              <p className="text-sm font-semibold text-slate-500 mb-1">API Uptime</p>
              <p className="text-2xl font-extrabold text-slate-950 mb-0">
                {Math.floor(systemHealth.api.uptimeSeconds / 3600)}h {Math.floor((systemHealth.api.uptimeSeconds % 3600) / 60)}m
              </p>
            </GlassCard>
            <GlassCard className="p-5">
              <p className="text-sm font-semibold text-slate-500 mb-1">Memory</p>
              <p className="text-2xl font-extrabold text-slate-950 mb-0">{systemHealth.api.memoryMb} MB</p>
            </GlassCard>
            <GlassCard className="p-5">
              <p className="text-sm font-semibold text-slate-500 mb-1">DB Connections</p>
              <p className="text-2xl font-extrabold text-slate-950 mb-0">
                {systemHealth.database.connected ? systemHealth.database.activeConnections : '—'}
              </p>
            </GlassCard>
            <GlassCard className="p-5">
              <p className="text-sm font-semibold text-slate-500 mb-1">Error Rate (24h)</p>
              <p className={`text-2xl font-extrabold mb-0 ${systemHealth.activity24h.errorRatePercent > 5 ? 'text-red-500' : 'text-slate-950'}`}>
                {systemHealth.activity24h.errorRatePercent}%
              </p>
            </GlassCard>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          <Metric icon={MdBusiness} label="Institutions" value={institutions.length} tone="teal" />
          <Metric icon={MdPeople} label="Active Users" value={activeUsers} tone="indigo" />
          <Metric icon={MdCreditCard} label="Free Plans" value={freePlanCount} tone="amber" />
          <Metric icon={MdCheckCircle} label="Paid Plans" value={Math.max(0, institutions.length - freePlanCount)} tone="coral" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          <Metric icon={MdWarning} label="Blocked Billing" value={blockedCount} tone="amber" />
          <Metric icon={MdWarning} label="Over Limits" value={overLimitCount} tone="coral" />
          <Metric icon={MdCreditCard} label="Trial Accounts" value={institutions.filter(inst => (inst.billing_state || getBillingState(inst)) === 'trialing').length} tone="indigo" />
          <Metric icon={MdCheckCircle} label="Active Billing" value={institutions.filter(inst => (inst.billing_state || getBillingState(inst)) === 'active').length} tone="teal" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <GlassCard className="p-5">
            <p className="text-sm font-semibold text-slate-500 mb-2">30-day Usage Events</p>
            <p className="text-3xl font-extrabold text-slate-950 mb-1">
              {Object.values(usage?.institutions || {}).reduce((sum, item) => sum + (item.total_events || 0), 0)}
            </p>
            <p className="text-xs text-slate-500 mb-0">Module opens tracked from tenant accounts.</p>
          </GlassCard>
          <GlassCard className="p-5">
            <p className="text-sm font-semibold text-slate-500 mb-2">Features Used</p>
            <p className="text-3xl font-extrabold text-slate-950 mb-1">{usedFeatureCount}</p>
            <p className="text-xs text-slate-500 mb-0">Distinct modules used in the last 30 days.</p>
          </GlassCard>
          <GlassCard className="p-5">
            <p className="text-sm font-semibold text-slate-500 mb-2">Unused Live Features</p>
            <p className="text-3xl font-extrabold text-slate-950 mb-1">{unusedLiveFeatureCount}</p>
            <p className="text-xs text-slate-500 mb-0">Live modules with no recent tenant activity.</p>
          </GlassCard>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <GlassCard className="p-5">
            <p className="text-sm font-semibold text-slate-500 mb-1">Plan Distribution</p>
            <p className="text-xs text-slate-500 mb-4">Institutions per subscription plan.</p>
            {planChartData.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-sm text-slate-400">No institutions yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={planChartData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {planChartData.map((entry, index) => (
                      <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                  <Legend verticalAlign="bottom" height={32} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </GlassCard>

          <GlassCard className="p-5">
            <p className="text-sm font-semibold text-slate-500 mb-1">Tenant Health Breakdown</p>
            <p className="text-xs text-slate-500 mb-4">How many accounts are healthy, watch, or at risk.</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={healthChartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <RechartsTooltip cursor={{ fill: 'rgba(15,23,42,0.04)' }} />
                <Bar dataKey="value" name="Institutions" radius={[6, 6, 0, 0]}>
                  {healthChartData.map(entry => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </GlassCard>

          <GlassCard className="p-5">
            <p className="text-sm font-semibold text-slate-500 mb-1">Top Used Features</p>
            <p className="text-xs text-slate-500 mb-4">Most-used modules across every tenant, last 30 days.</p>
            {topFeatureChartData.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-sm text-slate-400">No feature usage recorded yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topFeatureChartData} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <RechartsTooltip cursor={{ fill: 'rgba(15,23,42,0.04)' }} />
                  <Bar dataKey="events" name="Events" fill="#0E7C7B" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </GlassCard>
        </div>

        </>
        )}

        {activeTab === 'institutions' && (
        <>
        <GlassCard className="p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-950 mb-1">Tenant Filters</h2>
              <p className="text-sm text-slate-500 mb-0">
                Showing {filteredInstitutions.length} of {institutions.length} accounts.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[1.4fr,0.8fr,0.8fr,0.8fr,auto] gap-3 w-full xl:max-w-5xl">
              <Input
                label="Search"
                value={filters.search}
                onChange={event => setFilters(prev => ({ ...prev, search: event.target.value }))}
                placeholder="Institution, email, type"
              />
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Health</label>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-[#0E7C7B]"
                  value={filters.health}
                  onChange={event => setFilters(prev => ({ ...prev, health: event.target.value }))}
                >
                  <option value="all">All health</option>
                  <option value="healthy">Healthy</option>
                  <option value="watch">Watch</option>
                  <option value="risk">Risk</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Plan</label>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-[#0E7C7B]"
                  value={filters.plan}
                  onChange={event => setFilters(prev => ({ ...prev, plan: event.target.value }))}
                >
                  <option value="all">All plans</option>
                  {Object.keys(PLAN_DEFINITIONS).map(planKey => (
                    <option key={planKey} value={planKey}>{PLAN_DEFINITIONS[planKey].label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Billing</label>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-[#0E7C7B]"
                  value={filters.billing}
                  onChange={event => setFilters(prev => ({ ...prev, billing: event.target.value }))}
                >
                  <option value="all">All billing</option>
                  {['trialing', 'active', 'past_due', 'trial_expired', 'suspended', 'cancelled'].map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                variant="secondary"
                className="self-end"
                onClick={() => setFilters({ search: '', health: 'all', plan: 'all', billing: 'all' })}
              >
                Reset
              </Button>
            </div>
          </div>
        </GlassCard>

        <div className="grid grid-cols-1 lg:grid-cols-[0.9fr,1.4fr] gap-5">
          <GlassCard className="p-6">
            <p className="text-sm font-semibold text-slate-500 mb-2">Average Tenant Health</p>
            <div className="flex items-end gap-3 mb-4">
              <p className="text-5xl font-extrabold text-slate-950 mb-0">{averageHealthScore}</p>
              <p className="text-sm font-bold text-slate-500 mb-2">/ 100</p>
            </div>
            <div className="h-3 rounded-full bg-slate-100 overflow-hidden mb-4">
              <div
                className={`h-full rounded-full ${
                  averageHealthScore >= 80 ? 'bg-emerald-500' : averageHealthScore >= 55 ? 'bg-amber-500' : 'bg-red-500'
                }`}
                style={{ width: `${averageHealthScore}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-emerald-50 p-3">
                <p className="text-xl font-extrabold text-emerald-700 mb-0">{healthyCount}</p>
                <p className="text-xs font-semibold text-emerald-700 mb-0">Healthy</p>
              </div>
              <div className="rounded-lg bg-amber-50 p-3">
                <p className="text-xl font-extrabold text-amber-700 mb-0">{watchCount}</p>
                <p className="text-xs font-semibold text-amber-700 mb-0">Watch</p>
              </div>
              <div className="rounded-lg bg-red-50 p-3">
                <p className="text-xl font-extrabold text-red-700 mb-0">{riskCount}</p>
                <p className="text-xs font-semibold text-red-700 mb-0">Risk</p>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-950 mb-1">Accounts Needing Attention</h2>
                <p className="text-sm text-slate-500 mb-0">
                  Ranked by billing, limits, setup, and usage signals from the filtered accounts.
                </p>
              </div>
              <Badge status={healthAttentionList.some(item => item.health.status === 'risk') ? 'pending' : 'success'}>
                {healthAttentionList.filter(item => item.health.status === 'risk').length} filtered risk
              </Badge>
            </div>
            <div className="space-y-3">
              {healthAttentionList.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                  No tenant health data yet.
                </div>
              ) : healthAttentionList.map(({ institution, health }) => (
                <button
                  key={institution.id}
                  type="button"
                  onClick={() => openTenantDetail(institution.id)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-[#0E7C7B]/30 hover:bg-[#EEF7F6]/40 transition-colors"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-950 mb-1">{institution.name}</p>
                      <p className="text-xs text-slate-500 mb-0">
                        {health.risks.length ? health.risks.slice(0, 3).join(' / ') : 'No open risk signals'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge status={health.status === 'healthy' ? 'success' : health.status === 'watch' ? 'pending' : 'failed'}>
                        {health.status}
                      </Badge>
                      <span className="text-2xl font-extrabold text-slate-950">{health.score}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </GlassCard>
        </div>

        {tenantDetailOpen && selectedInstitution && selectedHealth && (
          <GlassCard className="p-0 overflow-hidden">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between px-6 py-5 border-b border-slate-200 bg-slate-50">
              <div>
                <p className="text-[#0E7C7B] text-xs font-extrabold uppercase tracking-[0.18em] mb-2">
                  Tenant Detail
                </p>
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <h2 className="text-2xl font-bold text-slate-950 mb-0">{selectedInstitution.name}</h2>
                  <Badge status={selectedHealth.status === 'healthy' ? 'success' : selectedHealth.status === 'watch' ? 'pending' : 'failed'}>
                    {selectedHealth.status}
                  </Badge>
                </div>
                <p className="text-sm text-slate-500 mb-0">
                  {selectedInstitution.email || 'No email'} / {selectedInstitution.type || 'School'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => loadTenantUsers(selectedInstitution.id)}
                  loading={loadingTenantUsers}
                >
                  Refresh Users
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => handleImpersonate(selectedInstitution)}
                  loading={impersonating}
                >
                  Impersonate
                </Button>
                <button
                  type="button"
                  onClick={() => setTenantDetailOpen(false)}
                  className="rounded-lg p-2 text-slate-500 hover:bg-white hover:text-slate-950 transition-colors"
                  aria-label="Close tenant detail"
                >
                  <MdClose className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-bold text-slate-500 mb-2">Health Score</p>
                  <p className="text-4xl font-extrabold text-slate-950 mb-3">{selectedHealth.score}</p>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full ${selectedHealth.score >= 80 ? 'bg-emerald-500' : selectedHealth.score >= 55 ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${selectedHealth.score}%` }}
                    />
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-bold text-slate-500 mb-2">Billing</p>
                  <Badge status={['active', 'trialing'].includes(selectedInstitution.billing_state || getBillingState(selectedInstitution)) ? 'success' : 'warning'}>
                    {selectedInstitution.billing_state || getBillingState(selectedInstitution)}
                  </Badge>
                  <p className="text-sm font-semibold text-slate-700 mt-3 mb-0">
                    {selectedInstitution.subscription_plan || 'free'} plan
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-bold text-slate-500 mb-2">Users / Students</p>
                  <p className="text-2xl font-extrabold text-slate-950 mb-1">
                    {selectedInstitution.user_count || 0} / {selectedInstitution.student_count || 0}
                  </p>
                  <p className="text-xs text-slate-500 mb-0">
                    Limits: {formatLimit((selectedInstitution.plan_limits || getPlanLimits(selectedInstitution.subscription_plan)).users)} users,
                    {' '}{formatLimit((selectedInstitution.plan_limits || getPlanLimits(selectedInstitution.subscription_plan)).students)} students
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-bold text-slate-500 mb-2">Usage</p>
                  <p className="text-2xl font-extrabold text-slate-950 mb-1">{selectedHealth.totalEvents}</p>
                  <p className="text-xs text-slate-500 mb-0">
                    {selectedHealth.lastSeenAt
                      ? `Last active ${new Date(selectedHealth.lastSeenAt).toLocaleDateString('en-IN')}`
                      : 'No recent activity'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[0.9fr,1.1fr] gap-5">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-sm font-bold text-slate-950 mb-3">Risk Signals</p>
                  {selectedHealth.risks.length === 0 ? (
                    <p className="text-sm text-slate-500 mb-0">No open risk signals for this account.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {selectedHealth.risks.map(risk => (
                        <span key={risk} className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
                          {risk}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-sm font-bold text-slate-950 mb-3">Top Used Features</p>
                  {selectedUsedFeatures.length === 0 ? (
                    <p className="text-sm text-slate-500 mb-0">No feature usage recorded for this tenant yet.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {selectedUsedFeatures.map(([featureKey, item]) => (
                        <div key={featureKey} className="rounded-lg bg-slate-50 p-3">
                          <p className="text-xs font-bold text-slate-500 mb-1">
                            {FEATURE_CATALOG.find(feature => feature.key === featureKey)?.label || featureKey}
                          </p>
                          <p className="text-lg font-extrabold text-slate-950 mb-0">{item.count || 0}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <p className="text-sm font-bold text-slate-950 mb-0">Enabled Modules</p>
                    <Badge status="active">{selectedEnabledFeatures.length}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedEnabledFeatures.slice(0, 16).map(feature => (
                      <span key={feature.key} className="rounded-full bg-[#EEF7F6] px-3 py-1 text-xs font-bold text-[#0E7C7B]">
                        {feature.label}
                      </span>
                    ))}
                    {selectedEnabledFeatures.length > 16 && (
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
                        +{selectedEnabledFeatures.length - 16} more
                      </span>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <p className="text-sm font-bold text-slate-950 mb-0">Recent Audit</p>
                    <button
                      type="button"
                      className="text-xs font-bold text-[#0E7C7B] hover:underline"
                      onClick={() => {
                        setAuditInstitutionFilter(selectedInstitution.id);
                        loadAudit(selectedInstitution.id);
                        setActiveTab('audit');
                      }}
                    >
                      View full timeline →
                    </button>
                  </div>
                  {auditForSelectedInstitution.length === 0 ? (
                    <p className="text-sm text-slate-500 mb-0">No recent audit events for this tenant.</p>
                  ) : (
                    <div className="space-y-3">
                      {auditForSelectedInstitution.slice(0, 4).map(event => (
                        <div key={event.id} className="rounded-lg bg-slate-50 p-3">
                          <p className="text-sm font-bold text-slate-950 mb-1">{formatAuditAction(event.action)}</p>
                          <p className="text-xs text-slate-500 mb-0">
                            {event.created_at ? new Date(event.created_at).toLocaleString('en-IN') : '-'}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </GlassCard>
        )}
        </>
        )}

        {activeTab === 'audit' && (
        <>
        <GlassCard className="p-0 overflow-hidden">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-6 py-5 border-b border-slate-200">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-[#EEF7F6] p-3 text-[#0E7C7B]">
                <MdHistory className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-950 mb-1">Audit Activity</h2>
                <p className="text-sm text-slate-500 mb-0">
                  {auditInstitutionFilter
                    ? `Activity timeline for ${institutions.find(inst => inst.id === auditInstitutionFilter)?.name || 'this tenant'}.`
                    : 'Recent Super Admin and tenant admin actions across SaaS accounts.'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-[#0E7C7B]"
                value={auditInstitutionFilter}
                onChange={event => { setAuditInstitutionFilter(event.target.value); loadAudit(event.target.value); }}
              >
                <option value="">All institutions</option>
                {institutions.map(inst => (
                  <option key={inst.id} value={inst.id}>{inst.name}</option>
                ))}
              </select>
              <Button type="button" variant="secondary" size="sm" onClick={exportAuditCsv} disabled={auditEvents.length === 0}>
                Export CSV
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={loadingAudit}
                onClick={() => loadAudit()}
              >
                Refresh
              </Button>
            </div>
          </div>

          {auditEvents.length === 0 ? (
            <div className="p-8 text-center">
              <p className="font-semibold text-slate-950 mb-1">No audit events yet</p>
              <p className="text-sm text-slate-500 mb-0">
                New tenant, plan, billing, feature, and user actions will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[36rem] overflow-y-auto">
              {auditEvents.map(event => (
                <div key={event.id} className="px-6 py-4 hover:bg-slate-50/80 transition-colors">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <p className="font-bold text-slate-950 mb-0">{formatAuditAction(event.action)}</p>
                        <Badge status={severityStatus(event.severity)}>
                          {event.severity || 'info'}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-600 mb-1">{event.description || 'No description'}</p>
                      <p className="text-xs text-slate-500 mb-0">
                        {event.institution_name || 'Unknown tenant'}
                        {event.metadata?.actor_role ? ` / ${event.metadata.actor_role.replace('_', ' ')}` : ''}
                        {event.ip_address ? ` / ${event.ip_address}` : ''}
                      </p>
                    </div>
                    <p className="text-xs font-semibold text-slate-500 whitespace-nowrap mb-0">
                      {event.created_at ? new Date(event.created_at).toLocaleString('en-IN') : '-'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
        </>
        )}

        {activeTab === 'features' && (
        <>
        <div className="grid grid-cols-1 xl:grid-cols-[1.1fr,1.9fr] gap-6">
          <GlassCard className="p-6">
            <h2 className="text-xl font-bold text-slate-950 mb-1">Plan Matrix</h2>
            <p className="text-sm text-slate-500 mb-5">
              Your SaaS packages and the modules each account receives by default.
            </p>
            <div className="space-y-3">
              {Object.entries(PLAN_DEFINITIONS).map(([planKey, plan]) => (
                <div key={planKey} className="rounded-xl border border-slate-200 bg-white/70 p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                      <p className="font-bold text-slate-950 mb-0">{plan.label}</p>
                      <p className="text-xs text-slate-500 mb-0">
                        {plan.monthlyPrice === null ? 'Custom pricing' : `Rs ${plan.monthlyPrice.toLocaleString('en-IN')}/mo`}
                      </p>
                    </div>
                    <Badge status={planKey === 'enterprise' ? 'success' : 'active'}>
                      {plan.features.length} features
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {plan.features.slice(0, 8).map(featureKey => (
                      <span key={featureKey} className="rounded-full bg-[#EEF7F6] px-2.5 py-1 text-[11px] font-semibold text-[#0E7C7B]">
                        {FEATURE_CATALOG.find(feature => feature.key === featureKey)?.label || featureKey}
                      </span>
                    ))}
                    {plan.features.length > 8 && (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                        +{plan.features.length - 8} more
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-5">
              <div>
                <h2 className="text-xl font-bold text-slate-950 mb-1">Account Feature Control</h2>
                <p className="text-sm text-slate-500 mb-0">
                  Select a tenant, switch plan, and override individual modules.
                </p>
              </div>
              <select
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-[#0E7C7B]"
                value={selectedInstitution?.id || ''}
                onChange={event => setSelectedInstitutionId(event.target.value)}
              >
                {institutions.map(inst => (
                  <option key={inst.id} value={inst.id}>{inst.name}</option>
                ))}
              </select>
            </div>

            {selectedInstitution ? (
              <div className="space-y-5">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0E7C7B] mb-1">
                        Selected Tenant
                      </p>
                      <h3 className="text-lg font-bold text-slate-950 mb-0">{selectedInstitution.name}</h3>
                      <p className="text-sm text-slate-500 mb-0">{selectedInstitution.email || 'No email'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-500">Plan</span>
                      <select
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-[#0E7C7B]"
                        value={selectedInstitution.subscription_plan || 'free'}
                        disabled={updating === `plan:${selectedInstitution.id}`}
                        onChange={event => handlePlanChange(selectedInstitution.id, event.target.value)}
                      >
                        {Object.keys(PLAN_DEFINITIONS).map(planKey => (
                          <option key={planKey} value={planKey}>{PLAN_DEFINITIONS[planKey].label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-lg bg-white p-3">
                      <p className="text-xs font-bold text-slate-500 mb-1">30-day events</p>
                      <p className="text-xl font-extrabold text-slate-950 mb-0">
                        {usageForSelectedInstitution?.total_events || 0}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white p-3">
                      <p className="text-xs font-bold text-slate-500 mb-1">Used features</p>
                      <p className="text-xl font-extrabold text-slate-950 mb-0">
                        {Object.keys(usageForSelectedInstitution?.features || {}).length}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white p-3">
                      <p className="text-xs font-bold text-slate-500 mb-1">Last active</p>
                      <p className="text-sm font-bold text-slate-950 mb-0">
                        {usageForSelectedInstitution?.last_seen_at
                          ? new Date(usageForSelectedInstitution.last_seen_at).toLocaleDateString('en-IN')
                          : 'No activity'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1.3fr,1fr] gap-3">
                    <div className="rounded-lg bg-white p-3">
                      <p className="text-xs font-bold text-slate-500 mb-2">Subscription</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge status={['active', 'trialing'].includes(selectedInstitution.billing_state || getBillingState(selectedInstitution)) ? 'success' : 'warning'}>
                          {selectedInstitution.billing_state || getBillingState(selectedInstitution)}
                        </Badge>
                        <select
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-[#0E7C7B]"
                          value={selectedInstitution.subscription_status || 'trialing'}
                          disabled={updating === `subscription:${selectedInstitution.id}`}
                          onChange={event => handleSubscriptionChange(selectedInstitution.id, event.target.value)}
                        >
                          {['trialing', 'active', 'past_due', 'suspended', 'cancelled'].map(status => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="rounded-lg bg-white p-3">
                      <p className="text-xs font-bold text-slate-500 mb-2">Plan Limits</p>
                      <p className="text-sm font-semibold text-slate-700 mb-1">
                        Users: {selectedInstitution.user_count || 0} / {formatLimit((selectedInstitution.plan_limits || getPlanLimits(selectedInstitution.subscription_plan)).users)}
                      </p>
                      <p className="text-sm font-semibold text-slate-700 mb-0">
                        Students: {selectedInstitution.student_count || 0} / {formatLimit((selectedInstitution.plan_limits || getPlanLimits(selectedInstitution.subscription_plan)).students)}
                      </p>
                    </div>
                  </div>
                  {(selectedInstitution.over_limits?.users || selectedInstitution.over_limits?.students) && (
                    <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm font-semibold text-orange-800">
                      This tenant is over its current plan limits. Upgrade the plan or reduce usage.
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  {Object.entries(FEATURE_CATEGORIES).map(([categoryKey, categoryLabel]) => {
                    const categoryFeatures = FEATURE_CATALOG.filter(feature => feature.category === categoryKey);
                    if (!categoryFeatures.length) return null;

                    return (
                      <div key={categoryKey}>
                        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-slate-500 mb-2">
                          {categoryLabel}
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {categoryFeatures.map(feature => {
                            const enabled = Boolean(selectedFeatureMap[feature.key]);
                            return (
                              <label
                                key={feature.key}
                                className={`flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors ${
                                  enabled ? 'border-[#0E7C7B]/25 bg-[#EEF7F6]' : 'border-slate-200 bg-white'
                                }`}
                              >
                                <span>
                                  <span className="block text-sm font-bold text-slate-950">{feature.label}</span>
                                  <span className="text-xs text-slate-500">
                                    {feature.status === 'live' ? 'Live in app' : 'Planned / future module'}
                                    {usageForSelectedInstitution?.features?.[feature.key]?.count
                                      ? ` / ${usageForSelectedInstitution.features[feature.key].count} uses`
                                      : ''}
                                  </span>
                                </span>
                                <input
                                  type="checkbox"
                                  checked={enabled}
                                  disabled={updating === `feature:${feature.key}`}
                                  onChange={event => handleFeatureToggle(feature.key, event.target.checked)}
                                  className="h-5 w-5 accent-[#0E7C7B]"
                                />
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
                Create an institution account to manage features.
              </div>
            )}
          </GlassCard>
        </div>
        </>
        )}

        {activeTab === 'users' && (
        <>
        <GlassCard className="p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-5">
            <div>
              <h2 className="text-xl font-bold text-slate-950 mb-1">Tenant User Support</h2>
              <p className="text-sm text-slate-500 mb-0">
                Add account owners, change roles, and disable access for the selected institution.
              </p>
            </div>
            <Badge status="active">
              {selectedInstitution?.name || 'No tenant selected'}
            </Badge>
          </div>

          {selectedInstitution ? (
            <div className="grid grid-cols-1 xl:grid-cols-[0.9fr,1.6fr] gap-5">
              <form onSubmit={handleSupportInvite} className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
                <div>
                  <p className="text-sm font-bold text-slate-950 mb-1">Invite or create user</p>
                  <p className="text-xs text-slate-500 mb-0">
                    Use a password for instant access, or leave it blank to send an email invite.
                  </p>
                </div>
                <Input
                  label="Email"
                  required
                  type="email"
                  value={supportInvite.email}
                  onChange={event => setSupportInvite(prev => ({ ...prev, email: event.target.value }))}
                  placeholder="admin@school.com"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="First Name"
                    required
                    value={supportInvite.firstName}
                    onChange={event => setSupportInvite(prev => ({ ...prev, firstName: event.target.value }))}
                    placeholder="Aarav"
                  />
                  <Input
                    label="Last Name"
                    value={supportInvite.lastName}
                    onChange={event => setSupportInvite(prev => ({ ...prev, lastName: event.target.value }))}
                    placeholder="Mehta"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Role</label>
                  <select
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-[#0E7C7B]"
                    value={supportInvite.role}
                    onChange={event => setSupportInvite(prev => ({ ...prev, role: event.target.value }))}
                  >
                    {ROLE_OPTIONS.map(role => (
                      <option key={role} value={role}>{role.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>
                <Input
                  label="Temporary Password"
                  type="password"
                  value={supportInvite.temporaryPassword}
                  onChange={event => setSupportInvite(prev => ({ ...prev, temporaryPassword: event.target.value }))}
                  placeholder="Optional"
                />
                <Button type="submit" loading={updating === 'support-invite'} className="w-full">
                  Add User
                </Button>
              </form>

              <div className="rounded-xl border border-slate-200 bg-white/80 overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 bg-slate-50">
                  <div>
                    <p className="text-sm font-bold text-slate-950 mb-0">Account users</p>
                    <p className="text-xs text-slate-500 mb-0">{tenantUsers.length} profiles found</p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    loading={loadingTenantUsers}
                    onClick={() => loadTenantUsers(selectedInstitution.id)}
                  >
                    Refresh
                  </Button>
                </div>

                {loadingTenantUsers ? (
                  <div className="p-8 text-center text-sm text-slate-500">Loading tenant users...</div>
                ) : tenantUsers.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="font-semibold text-slate-950 mb-1">No users yet</p>
                    <p className="text-sm text-slate-500 mb-0">Invite the first institution admin to activate this tenant.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="text-left px-4 py-3 text-slate-500 font-bold">User</th>
                          <th className="text-left px-4 py-3 text-slate-500 font-bold">Role</th>
                          <th className="text-left px-4 py-3 text-slate-500 font-bold">Status</th>
                          <th className="text-right px-4 py-3 text-slate-500 font-bold">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tenantUsers.map(tenantUser => (
                          <tr key={tenantUser.id} className="border-b border-slate-100 last:border-0">
                            <td className="px-4 py-3">
                              <p className="font-bold text-slate-950 mb-0">
                                {[tenantUser.first_name, tenantUser.last_name].filter(Boolean).join(' ') || 'Unnamed user'}
                              </p>
                              <p className="text-xs text-slate-500 mb-0">{tenantUser.user_id}</p>
                            </td>
                            <td className="px-4 py-3">
                              <select
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-[#0E7C7B]"
                                value={tenantUser.role}
                                disabled={updating === `tenant-role:${tenantUser.id}`}
                                onChange={event => handleTenantUserRole(tenantUser.id, event.target.value)}
                              >
                                {ROLE_OPTIONS.map(role => (
                                  <option key={role} value={role}>{role.replace('_', ' ')}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              <Badge status={tenantUser.is_active ? 'success' : 'warning'}>
                                {tenantUser.is_active ? 'active' : 'disabled'}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Button
                                type="button"
                                size="xs"
                                variant={tenantUser.is_active ? 'danger' : 'secondary'}
                                loading={updating === `tenant-status:${tenantUser.id}`}
                                onClick={() => handleTenantUserStatus(tenantUser.id, !tenantUser.is_active)}
                              >
                                {tenantUser.is_active ? 'Disable' : 'Enable'}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
              Create an institution account before adding tenant users.
            </div>
          )}
        </GlassCard>
        </>
        )}

        {activeTab === 'usage' && (
        <>
        <GlassCard className="p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-5">
            <div>
              <h2 className="text-xl font-bold text-slate-950 mb-1">Feature Usage Board</h2>
              <p className="text-sm text-slate-500 mb-0">
                See which live and planned modules are getting adoption across tenants.
              </p>
            </div>
            <Badge status="active">Last 30 days</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {FEATURE_CATALOG.map(feature => {
              const itemUsage = usageByFeature[feature.key];
              return (
                <div key={feature.key} className="rounded-xl border border-slate-200 bg-white/75 p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="font-bold text-slate-950 mb-1">{feature.label}</p>
                      <p className="text-xs text-slate-500 mb-0">
                        {FEATURE_CATEGORIES[feature.category]} / {feature.status}
                      </p>
                    </div>
                    <Badge status={itemUsage ? 'success' : 'pending'}>
                      {itemUsage ? 'Used' : 'Unused'}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg bg-slate-50 p-2">
                      <p className="text-xs text-slate-500 mb-1">Events</p>
                      <p className="font-extrabold text-slate-950 mb-0">{itemUsage?.count || 0}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2">
                      <p className="text-xs text-slate-500 mb-1">Accounts</p>
                      <p className="font-extrabold text-slate-950 mb-0">{itemUsage?.institution_count || 0}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
        </>
        )}

        {activeTab === 'create' && (
        <>
        <GlassCard className="p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between mb-6">
            <div>
              <p className="text-[#0E7C7B] text-xs font-extrabold uppercase tracking-[0.18em] mb-2">
                Guided Provisioning
              </p>
              <h2 className="text-xl font-bold text-slate-950 mb-1">Create Institution Account</h2>
              <p className="text-sm text-slate-500 mb-0">
                Provision the tenant, first admin, subscription trial, and module access in one step.
              </p>
            </div>
            <Badge status="active">
              {Object.values(form.modules || {}).filter(Boolean).length} modules enabled
            </Badge>
          </div>

          <form onSubmit={handleCreateInstitution} className="space-y-6">
            {lastProvisioned && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm font-extrabold text-emerald-800 mb-1">Tenant provisioned</p>
                    <p className="text-sm text-emerald-700 mb-2">
                      {lastProvisioned.institution?.name} is ready on the {lastProvisioned.institution?.subscription_plan} plan.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-semibold text-emerald-900">
                      <span>Admin: {lastProvisioned.adminEmail}</span>
                      <span>Trial: {Number(lastProvisioned.trialDays) > 0 ? `${lastProvisioned.trialDays} days` : 'Active now'}</span>
                      <span>Modules: {lastProvisioned.enabledModules}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => openTenantDetail(lastProvisioned.institution?.id || '')}
                    >
                      Review Tenant
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setLastProvisioned(null)}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-bold text-slate-950 mb-3">1. Institution</p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Input label="Institution Name" required value={form.name} onChange={e => updateForm('name', e.target.value)} placeholder="Green Valley School" />
                <Input label="Type" value={form.type} onChange={e => updateForm('type', e.target.value)} placeholder="School" />
                <Input label="Institution Email" required type="email" value={form.email} onChange={e => updateForm('email', e.target.value)} placeholder="school@example.com" />
                <Input label="Phone" value={form.phone} onChange={e => updateForm('phone', e.target.value)} placeholder="9999999999" />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-bold text-slate-950 mb-3">2. SaaS Package</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Plan</label>
                  <select
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-[#0E7C7B]"
                    value={form.subscription_plan}
                    onChange={event => updateForm('subscription_plan', event.target.value)}
                  >
                    {Object.entries(PLAN_DEFINITIONS).map(([planKey, plan]) => (
                      <option key={planKey} value={planKey}>
                        {plan.label} {plan.monthlyPrice === null ? '(Custom)' : `(Rs ${plan.monthlyPrice.toLocaleString('en-IN')}/mo)`}
                      </option>
                    ))}
                  </select>
                </div>
                <Input
                  label="Trial Days"
                  type="number"
                  min="0"
                  max="365"
                  value={form.trialDays}
                  onChange={e => updateForm('trialDays', e.target.value)}
                  placeholder="14"
                />
                <Input
                  label="Billing Email"
                  type="email"
                  value={form.billingEmail}
                  onChange={e => updateForm('billingEmail', e.target.value)}
                  placeholder="Uses institution email if blank"
                />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-4">
                <div>
                  <p className="text-sm font-bold text-slate-950 mb-1">3. Module Access</p>
                  <p className="text-xs text-slate-500 mb-0">Plan defaults are preselected. Override modules before launch.</p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => updateForm('modules', getPlanFeatureMap(form.subscription_plan))}
                >
                  Reset To Plan
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {FEATURE_CATALOG.filter(feature => feature.status === 'live').map(feature => {
                  const enabled = Boolean(form.modules?.[feature.key]);
                  return (
                    <label
                      key={feature.key}
                      className={`flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors ${
                        enabled ? 'border-[#0E7C7B]/25 bg-[#EEF7F6]' : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <span>
                        <span className="block text-sm font-bold text-slate-950">{feature.label}</span>
                        <span className="text-xs text-slate-500">{FEATURE_CATEGORIES[feature.category]}</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={event => toggleCreateModule(feature.key, event.target.checked)}
                        className="h-5 w-5 accent-[#0E7C7B]"
                      />
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-bold text-slate-950 mb-3">4. First Admin</p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Input label="Admin First Name" required value={form.adminFirstName} onChange={e => updateForm('adminFirstName', e.target.value)} />
                <Input label="Admin Last Name" value={form.adminLastName} onChange={e => updateForm('adminLastName', e.target.value)} />
                <Input label="Admin Email" required type="email" value={form.adminEmail} onChange={e => updateForm('adminEmail', e.target.value)} />
                <Input label="Temporary Password" required type="password" value={form.adminPassword} onChange={e => updateForm('adminPassword', e.target.value)} />
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500 mb-0">
                The account starts as {Number(form.trialDays) > 0 ? `trialing for ${form.trialDays} days` : 'active immediately'}.
              </p>
              <Button type="submit" loading={creating}>Provision Tenant</Button>
            </div>
          </form>
        </GlassCard>
        </>
        )}

        {activeTab === 'institutions' && (
        <>
        <GlassCard className="p-0 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-950 mb-1">Institution Accounts</h2>
              <p className="text-sm text-slate-500 mb-0">Tenant-level overview for SaaS operations.</p>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={exportInstitutionsCsv} disabled={filteredInstitutions.length === 0}>
              Export CSV
            </Button>
          </div>

          {selectedInstIds.size > 0 && (
            <div className="px-6 py-3 border-b border-slate-200 bg-[#EEF7F6] flex flex-wrap items-center gap-3">
              <span className="text-sm font-bold text-slate-950">{selectedInstIds.size} selected</span>
              <select
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-semibold text-slate-700 outline-none focus:border-[#0E7C7B]"
                value={bulkPlan}
                onChange={event => setBulkPlan(event.target.value)}
                disabled={bulkBusy}
              >
                {Object.keys(PLAN_DEFINITIONS).map(planKey => (
                  <option key={planKey} value={planKey}>{PLAN_DEFINITIONS[planKey].label}</option>
                ))}
              </select>
              <Button type="button" size="sm" variant="secondary" loading={bulkBusy} onClick={handleBulkChangePlan}>
                Change Plan
              </Button>
              <Button type="button" size="sm" variant="secondary" loading={bulkBusy} onClick={handleBulkActivate}>
                Activate
              </Button>
              <Button type="button" size="sm" variant="secondary" loading={bulkBusy} onClick={handleBulkSuspend}>
                Suspend
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={bulkBusy} onClick={() => setSelectedInstIds(new Set())}>
                Clear
              </Button>
            </div>
          )}

          {loading ? (
            <div className="p-10 text-center text-slate-500">Loading accounts...</div>
          ) : institutions.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-slate-950 font-semibold mb-1">No institutions visible yet</p>
              <p className="text-slate-500 text-sm mb-0">
                Register a school account or connect a backend admin endpoint with service-role access.
              </p>
            </div>
          ) : filteredInstitutions.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-slate-950 font-semibold mb-1">No accounts match these filters</p>
              <p className="text-slate-500 text-sm mb-4">
                Try a different search term, health status, plan, or billing state.
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setFilters({ search: '', health: 'all', plan: 'all', billing: 'all' })}
              >
                Clear Filters
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={filteredInstitutions.length > 0 && filteredInstitutions.every(inst => selectedInstIds.has(inst.id))}
                        onChange={toggleSelectAllFiltered}
                        aria-label="Select all institutions"
                      />
                    </th>
                    <th className="text-left px-5 py-3 text-slate-500 font-bold">Institution</th>
                    <th className="text-left px-5 py-3 text-slate-500 font-bold">Health</th>
                    <th className="text-left px-5 py-3 text-slate-500 font-bold">Type</th>
                    <th className="text-left px-5 py-3 text-slate-500 font-bold">Plan</th>
                    <th className="text-left px-5 py-3 text-slate-500 font-bold">Billing</th>
                    <th className="text-left px-5 py-3 text-slate-500 font-bold">Users</th>
                    <th className="text-left px-5 py-3 text-slate-500 font-bold">Students</th>
                    <th className="text-left px-5 py-3 text-slate-500 font-bold">Features</th>
                    <th className="text-left px-5 py-3 text-slate-500 font-bold">Usage</th>
                    <th className="text-left px-5 py-3 text-slate-500 font-bold">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInstitutions.map(inst => (
                    <tr
                      key={inst.id}
                      onClick={() => openTenantDetail(inst.id)}
                      className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                    >
                      <td className="px-4 py-4" onClick={event => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedInstIds.has(inst.id)}
                          onChange={event => toggleSelectInst(inst.id, event)}
                          aria-label={`Select ${inst.name}`}
                        />
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-bold text-slate-950 mb-0">{inst.name}</p>
                        <p className="text-xs text-slate-500 mb-0">{inst.email || 'No email'}</p>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-extrabold text-slate-950">{tenantHealth[inst.id]?.score || 0}</span>
                          <Badge status={tenantHealth[inst.id]?.status === 'healthy' ? 'success' : tenantHealth[inst.id]?.status === 'watch' ? 'pending' : 'failed'}>
                            {tenantHealth[inst.id]?.status || 'risk'}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate-600">{inst.type || 'School'}</td>
                      <td className="px-5 py-4">
                        <Badge status={(inst.subscription_plan || 'free') === 'free' ? 'pending' : 'success'}>
                          {inst.subscription_plan || 'free'}
                        </Badge>
                      </td>
                      <td className="px-5 py-4">
                        <Badge status={['active', 'trialing'].includes(inst.billing_state || getBillingState(inst)) ? 'success' : 'warning'}>
                          {inst.billing_state || getBillingState(inst)}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-slate-600">{inst.user_count || 0}</td>
                      <td className="px-5 py-4 text-slate-600">{inst.student_count || 0}</td>
                      <td className="px-5 py-4 text-slate-600">
                        {Object.values(getPlanFeatureMap(inst.subscription_plan || 'free', inst.settings?.modules || inst.enabled_modules || {})).filter(Boolean).length}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {usage?.institutions?.[inst.id]?.total_events || 0}
                      </td>
                      <td className="px-5 py-4 text-slate-500">
                        {inst.created_at ? new Date(inst.created_at).toLocaleDateString('en-IN') : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>
        </>
        )}
      </div>
    </MainLayout>
  );
}
