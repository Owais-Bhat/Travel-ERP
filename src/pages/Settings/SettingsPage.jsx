import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import api from '../../lib/api';
import { fetchInstitutionUsers, inviteInstitutionUser, updateInstitutionUser } from '../../lib/usersApi';
import { fetchRoleFeatures, saveRoleFeatures } from '../../lib/institutionsApi';
import {
  MdBusiness, MdPeople, MdSettings, MdAdd, MdDelete, MdEmail, MdShield,
  MdContentCopy, MdCheck, MdWarning, MdPalette,
} from 'react-icons/md';

const TABS = [
  { key: 'institution', label: 'Institution', icon: MdBusiness },
  { key: 'branding', label: 'Branding', icon: MdPalette },
  { key: 'users', label: 'Users & Roles', icon: MdPeople },
  { key: 'roleAccess', label: 'Role Access', icon: MdShield },
  { key: 'modules', label: 'Modules', icon: MdSettings },
];

const ROLE_LABELS = {
  teacher: 'Teacher',
  student: 'Student',
  parent: 'Parent',
  staff: 'Staff',
};

const MODULES = [
  { key: 'lms', label: 'Learning Management (LMS)', description: 'Courses, lessons, content delivery' },
  { key: 'transport', label: 'Transport Management', description: 'Bus routes, driver tracking' },
  { key: 'fees', label: 'Fee Management', description: 'Fee collection, payments, receipts' },
  { key: 'exams', label: 'Exams & Results', description: 'Exam scheduling, result entry' },
  { key: 'ai', label: 'AI Features', description: 'AI tutor, career path, performance analysis' },
  { key: 'communication', label: 'Communication', description: 'Announcements, messaging' },
  { key: 'admissions', label: 'Admissions CRM', description: 'Application tracking, enrollment' },
];

export default function SettingsPage() {
  const { profile, user } = useAuth();
  const notification = useNotification();
  const [activeTab, setActiveTab] = useState('institution');
  const [saving, setSaving] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [institution, setInstitution] = useState({ name: '', type: '', address: '', phone: '', email: '' });
  const [branding, setBranding] = useState({ logo_url: '', primary_color: '' });
  const [savingBranding, setSavingBranding] = useState(false);
  const [users, setUsers] = useState([]);
  const [modules, setModules] = useState({});
  const [plan, setPlan] = useState('free');
  const [planLimits, setPlanLimits] = useState(null);

  const [inviteForm, setInviteForm] = useState({ email: '', role: 'teacher', firstName: '', lastName: '' });
  const [inviting, setInviting] = useState(false);
  // Set only when an invite's email failed to send, so the admin has a
  // fallback way to hand the temporary password to the new user.
  const [lastInvite, setLastInvite] = useState(null);
  const [passwordCopied, setPasswordCopied] = useState(false);

  const copyInvitePassword = async () => {
    if (!lastInvite?.temporaryPassword) return;
    await navigator.clipboard.writeText(lastInvite.temporaryPassword);
    setPasswordCopied(true);
    setTimeout(() => setPasswordCopied(false), 2000);
  };

  // ── Role access ──────────────────────────────────────────────
  const [roleFeatureCatalog, setRoleFeatureCatalog] = useState([]);
  const [restrictableRoles, setRestrictableRoles] = useState([]);
  const [roleFeatures, setRoleFeatures] = useState({});
  const [activeRole, setActiveRole] = useState('teacher');
  const [loadingRoleFeatures, setLoadingRoleFeatures] = useState(false);
  const [savingRoleFeatures, setSavingRoleFeatures] = useState(false);

  useEffect(() => {
    if (profile?.institution_id) {
      loadInstitution();
      if (activeTab === 'users') loadUsers();
      if (activeTab === 'roleAccess') loadRoleFeatures();
    }
  }, [profile?.institution_id, activeTab]);

  const loadInstitution = async () => {
    try {
      const { data } = await api.get('/institutions/current');
      if (!data) return;
      setInstitution({
        name: data.name || '',
        type: data.type || '',
        address: data.address || '',
        phone: data.phone || '',
        email: data.email || '',
        settings: data.settings || {},
      });
      setBranding({
        logo_url: data.logo_url || '',
        primary_color: data.settings?.branding?.primary_color || '',
      });
      // `enabled_modules` is the resolved plan + override map from the
      // server; module availability is set by the plan, not by the tenant.
      setModules(data.enabled_modules || data.settings?.modules || {});
      setPlan(data.subscription_plan || 'free');
      setPlanLimits(data.plan_limits || null);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to load institution settings');
    }
  };

  const loadRoleFeatures = async () => {
    setLoadingRoleFeatures(true);
    try {
      const data = await fetchRoleFeatures();
      setRoleFeatureCatalog(data.catalog || []);
      setRestrictableRoles(data.roles || []);
      setRoleFeatures(data.roleFeatures || {});
      if (data.roles?.length) setActiveRole((r) => (data.roles.includes(r) ? r : data.roles[0]));
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to load role access settings');
    } finally {
      setLoadingRoleFeatures(false);
    }
  };

  /** Keys currently checked for a role — every plan feature when unrestricted. */
  const activeKeysFor = (role) => (
    Array.isArray(roleFeatures[role]) ? roleFeatures[role] : roleFeatureCatalog.map((f) => f.key)
  );

  const toggleRoleFeature = (role, key) => {
    setRoleFeatures((prev) => {
      const current = Array.isArray(prev[role]) ? prev[role] : roleFeatureCatalog.map((f) => f.key);
      const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
      return { ...prev, [role]: next };
    });
  };

  const resetRoleToFullAccess = (role) => {
    setRoleFeatures((prev) => {
      const next = { ...prev };
      delete next[role];
      return next;
    });
  };

  const saveRoleAccess = async () => {
    setSavingRoleFeatures(true);
    try {
      const data = await saveRoleFeatures(roleFeatures);
      setRoleFeatures(data.roleFeatures || {});
      notification.success('Role access updated');
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to save role access');
    } finally {
      setSavingRoleFeatures(false);
    }
  };

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const data = await fetchInstitutionUsers();
      setUsers(data.users || []);
    } catch (error) {
      notification.error('Failed to load users: ' + error.message);
    }
    setLoadingUsers(false);
  };

  const saveInstitution = async () => {
    setSaving(true);
    try {
      await api.put('/institutions/profile', {
        name: institution.name,
        type: institution.type,
        address: institution.address,
        phone: institution.phone,
        email: institution.email,
      });
      notification.success('Institution settings saved');
    } catch (err) {
      notification.error('Failed to save: ' + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  const saveBranding = async () => {
    setSavingBranding(true);
    try {
      await api.put('/institutions/profile', { logo_url: branding.logo_url });
      await api.put('/institutions/settings', {
        settings: { branding: { primary_color: branding.primary_color } },
      });
      notification.success('Branding saved — reload to see it everywhere.');
    } catch (err) {
      notification.error('Failed to save: ' + (err.response?.data?.error || err.message));
    } finally {
      setSavingBranding(false);
    }
  };

  const inviteUser = async () => {
    if (!inviteForm.email || !inviteForm.firstName) {
      notification.error('Email and first name are required');
      return;
    }
    setInviting(true);
    try {
      const data = await inviteInstitutionUser({
        email: inviteForm.email,
        role: inviteForm.role,
        firstName: inviteForm.firstName,
        lastName: inviteForm.lastName,
        institutionId: profile.institution_id,
      });

      if (data.emailSent) {
        notification.success(`Invitation emailed to ${inviteForm.email}`);
        setLastInvite(null);
      } else {
        // No SMTP configured, or the send failed — the account still
        // exists, so the admin needs the password to hand over some other
        // way. Keep it on screen (not just a toast) until they copy it.
        notification.warning('Account created, but the invite email could not be sent. Copy the password below.', 8000);
        setLastInvite(data);
      }

      setInviteForm({ email: '', role: 'teacher', firstName: '', lastName: '' });
      loadUsers();
      loadInstitution();
    } catch (err) {
      // The plan-limit message and other server errors live on the axios
      // response body, not err.message (which is a generic status string).
      notification.error(err.response?.data?.error || 'Invite failed: ' + err.message);
    } finally {
      setInviting(false);
    }
  };

  const deactivateUser = async (userId) => {
    try {
      await updateInstitutionUser(userId, { isActive: false });
      notification.success('User deactivated');
      loadUsers();
    } catch (error) {
      notification.error(error.response?.data?.error || 'Failed to deactivate user: ' + error.message);
    }
  };

  const reactivateUser = async (userId) => {
    try {
      await updateInstitutionUser(userId, { isActive: true });
      notification.success('User reactivated');
      loadUsers();
    } catch (error) {
      notification.error(error.response?.data?.error || 'Failed to reactivate user: ' + error.message);
    }
  };

  const updateUserRole = async (userId, role) => {
    try {
      await updateInstitutionUser(userId, { role });
      notification.success('Role updated');
      loadUsers();
    } catch (error) {
      notification.error(error.response?.data?.error || 'Failed to update role: ' + error.message);
    }
  };

  const activeUserCount = users.filter((u) => u.is_active).length;
  const userLimitReached = planLimits && planLimits.users !== null && activeUserCount >= planLimits.users;

  const ROLE_OPTIONS = ['institution_admin', 'principal', 'teacher', 'student', 'parent', 'staff'];

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <h1 className="text-3xl font-bold text-white">Settings</h1>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-white/10 pb-0">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all ${
                activeTab === tab.key
                  ? 'bg-white/10 text-neon-cyan border-b-2 border-neon-cyan'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Institution Settings */}
        {activeTab === 'institution' && (
          <GlassCard className="p-6 space-y-5">
            <h2 className="text-lg font-bold text-white">Institution Profile</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Institution Name" value={institution.name} onChange={e => setInstitution(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Green Valley School" />
              <div>
                <label className="block text-white/60 text-sm mb-1">Institution Type</label>
                <select value={institution.type} onChange={e => setInstitution(p => ({ ...p, type: e.target.value }))}
                  className="w-full bg-white/5 border border-white/20 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:border-neon-cyan/50">
                  {['School', 'College', 'University', 'Coaching Center'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <Input label="Contact Email" type="email" value={institution.email} onChange={e => setInstitution(p => ({ ...p, email: e.target.value }))} />
              <Input label="Phone Number" value={institution.phone} onChange={e => setInstitution(p => ({ ...p, phone: e.target.value }))} />
              <div className="md:col-span-2">
                <label className="block text-white/60 text-sm mb-1">Address</label>
                <textarea value={institution.address} onChange={e => setInstitution(p => ({ ...p, address: e.target.value }))}
                  rows={3} placeholder="Full address"
                  className="w-full bg-white/5 border border-white/20 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:border-neon-cyan/50 resize-none" />
              </div>
            </div>
            <Button variant="primary" onClick={saveInstitution} loading={saving}>Save Changes</Button>
          </GlassCard>
        )}

        {/* Branding */}
        {activeTab === 'branding' && (
          <GlassCard className="p-6 space-y-5">
            <div>
              <h2 className="text-lg font-bold text-white">Custom Branding</h2>
              <p className="text-white/50 text-sm mb-0">
                Your logo replaces the CyberMilo mark in your sidebar, and your primary color tints buttons and highlights across the app.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Logo URL"
                placeholder="https://your-school.com/logo.png"
                value={branding.logo_url}
                onChange={e => setBranding(b => ({ ...b, logo_url: e.target.value }))}
              />
              <div>
                <label className="block text-white/60 text-sm mb-1">Primary Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={branding.primary_color || '#0066FF'}
                    onChange={e => setBranding(b => ({ ...b, primary_color: e.target.value }))}
                    className="w-12 h-10 rounded-lg border border-white/20 bg-transparent cursor-pointer"
                  />
                  <input
                    value={branding.primary_color}
                    onChange={e => setBranding(b => ({ ...b, primary_color: e.target.value }))}
                    placeholder="#0066FF"
                    className="flex-1 bg-white/5 border border-white/20 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:border-neon-cyan/50"
                  />
                </div>
              </div>
            </div>
            {branding.logo_url && (
              <div>
                <p className="text-white/40 text-xs mb-2">Preview</p>
                <img src={branding.logo_url} alt="Logo preview" className="h-12 rounded bg-white/5 p-1" onError={e => { e.target.style.display = 'none'; }} />
              </div>
            )}
            <Button variant="primary" onClick={saveBranding} loading={savingBranding}>Save Branding</Button>
          </GlassCard>
        )}

        {/* Users & Roles */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            {/* Invite form */}
            <GlassCard className="p-6">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-0"><MdAdd /> Invite User</h2>
                {planLimits && (
                  <span
                    className={`neu-badge ${userLimitReached ? 'neu-badge-danger' : ''}`}
                    title="Active users against your plan's seat limit"
                  >
                    {activeUserCount} / {planLimits.users === null ? '∞' : planLimits.users} seats used
                  </span>
                )}
              </div>

              {userLimitReached && (
                <div className="neu-alert neu-alert-warning mb-4">
                  <span>
                    Your <strong style={{ textTransform: 'capitalize' }}>{plan}</strong> plan is at its
                    {' '}{planLimits.users}-user limit. Deactivate someone or upgrade your plan to invite more.
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Input placeholder="First Name" value={inviteForm.firstName} onChange={e => setInviteForm(p => ({ ...p, firstName: e.target.value }))} />
                <Input placeholder="Last Name" value={inviteForm.lastName} onChange={e => setInviteForm(p => ({ ...p, lastName: e.target.value }))} />
                <Input placeholder="Email address" type="email" value={inviteForm.email} onChange={e => setInviteForm(p => ({ ...p, email: e.target.value }))} />
                <div>
                  <select value={inviteForm.role} onChange={e => setInviteForm(p => ({ ...p, role: e.target.value }))}
                    className="w-full bg-white/5 border border-white/20 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:border-neon-cyan/50">
                    {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
                  </select>
                </div>
              </div>
              <Button variant="primary" onClick={inviteUser} loading={inviting} disabled={userLimitReached} className="mt-4">
                <MdEmail className="mr-2 inline" /> Send Invitation
              </Button>

              {lastInvite && (
                <div className="neu-alert neu-alert-warning mt-4">
                  <MdWarning className="w-5 h-5 shrink-0" style={{ color: 'var(--neu-amber)' }} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold mb-1" style={{ color: 'var(--neu-ink)' }}>
                      Couldn&apos;t email {lastInvite.email} — share this password yourself
                    </p>
                    <div className="flex items-center gap-2">
                      <code
                        className="text-sm px-2 py-1"
                        style={{ borderRadius: 'var(--neu-radius-sm)', boxShadow: 'var(--neu-inset-subtle)' }}
                      >
                        {lastInvite.temporaryPassword}
                      </code>
                      <button type="button" onClick={copyInvitePassword} className="neu-btn neu-btn-xs">
                        {passwordCopied ? <MdCheck className="w-3.5 h-3.5" /> : <MdContentCopy className="w-3.5 h-3.5" />}
                        {passwordCopied ? 'Copied' : 'Copy'}
                      </button>
                      <button type="button" onClick={() => setLastInvite(null)} className="neu-btn neu-btn-ghost neu-btn-xs">
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </GlassCard>

            {/* Users table */}
            <GlassCard className="p-6">
              <h2 className="text-lg font-bold text-white mb-4">All Users ({users.length})</h2>
              {loadingUsers ? (
                <div className="text-white/60 text-sm">Loading users...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left py-3 px-4 text-white/60">Name</th>
                        <th className="text-left py-3 px-4 text-white/60">Role</th>
                        <th className="text-left py-3 px-4 text-white/60">Status</th>
                        <th className="text-left py-3 px-4 text-white/60">Joined</th>
                        <th className="text-center py-3 px-4 text-white/60">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u.id} className="border-b border-white/5 hover:bg-white/5">
                          <td className="py-3 px-4 text-white">{u.first_name} {u.last_name}</td>
                          <td className="py-3 px-4">
                            <select
                              value={u.role || 'teacher'}
                              onChange={e => updateUserRole(u.id, e.target.value)}
                              disabled={u.user_id === user?.id}
                              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm capitalize text-white outline-none disabled:opacity-50"
                            >
                              {ROLE_OPTIONS.map(r => (
                                <option key={r} value={r} className="bg-slate-900 text-white">
                                  {r.replace('_', ' ')}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded-full text-xs ${u.is_active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                              {u.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-white/60">{new Date(u.created_at).toLocaleDateString('en-IN')}</td>
                          <td className="py-3 px-4 text-center">
                            {u.user_id !== user?.id && (
                              <button
                                onClick={() => u.is_active ? deactivateUser(u.id) : reactivateUser(u.id)}
                                className={u.is_active ? 'text-red-400 hover:text-red-300' : 'text-emerald-300 hover:text-emerald-200'}
                              >
                                {u.is_active ? <MdDelete className="w-4 h-4" /> : 'Activate'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </GlassCard>
          </div>
        )}

        {/* Role Access — tenant admin narrows what a role can see, within the plan */}
        {activeTab === 'roleAccess' && (
          <div className="space-y-6">
            <GlassCard className="p-6 space-y-4">
              <div>
                <h2 className="text-lg font-bold" style={{ color: 'var(--neu-ink)' }}>Role access</h2>
                <p className="text-sm mb-0" style={{ color: 'var(--neu-ink-muted)' }}>
                  Choose which modules each role can use, inside what your plan already includes.
                  A role with no restriction gets everything the plan offers. Institution admins and
                  principals always have full access, since they are the ones setting this up.
                </p>
              </div>

              {loadingRoleFeatures ? (
                <div className="neu-skeleton h-40" />
              ) : restrictableRoles.length === 0 ? (
                <p className="text-sm mb-0" style={{ color: 'var(--neu-ink-muted)' }}>Nothing to configure yet.</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {restrictableRoles.map((role) => {
                      const restricted = Array.isArray(roleFeatures[role]);
                      const active = activeRole === role;
                      return (
                        <button
                          key={role}
                          type="button"
                          onClick={() => setActiveRole(role)}
                          className="neu-btn neu-btn-sm"
                          style={active ? { boxShadow: 'var(--neu-inset)', color: 'var(--neu-primary)', fontWeight: 700 } : undefined}
                        >
                          {ROLE_LABELS[role] || role}
                          {restricted && (
                            <span
                              className="neu-badge neu-badge-plain"
                              style={{ marginLeft: '0.4rem', padding: '0.1rem 0.5rem' }}
                            >
                              restricted
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm mb-0" style={{ color: 'var(--neu-ink-muted)' }}>
                      {Array.isArray(roleFeatures[activeRole])
                        ? `${ROLE_LABELS[activeRole]} is restricted to ${roleFeatures[activeRole].length} of ${roleFeatureCatalog.length} modules.`
                        : `${ROLE_LABELS[activeRole]} currently has full access to every module in your plan.`}
                    </p>
                    {Array.isArray(roleFeatures[activeRole]) && (
                      <Button variant="ghost" size="sm" onClick={() => resetRoleToFullAccess(activeRole)}>
                        Reset to full access
                      </Button>
                    )}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    {roleFeatureCatalog.map((feature) => {
                      const enabled = activeKeysFor(activeRole).includes(feature.key);
                      return (
                        <button
                          key={feature.key}
                          type="button"
                          onClick={() => toggleRoleFeature(activeRole, feature.key)}
                          className="flex items-center justify-between gap-3 p-3 text-left"
                          style={{ borderRadius: 'var(--neu-radius)', boxShadow: enabled ? 'var(--neu-e1)' : 'var(--neu-inset)' }}
                        >
                          <span style={{ color: 'var(--neu-ink)' }}>{feature.label}</span>
                          <span
                            className={`neu-badge ${enabled ? 'neu-badge-success' : ''}`}
                            style={{ flexShrink: 0 }}
                          >
                            {enabled ? 'Allowed' : 'Blocked'}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <Button variant="primary" onClick={saveRoleAccess} loading={savingRoleFeatures}>
                    Save role access
                  </Button>
                </>
              )}
            </GlassCard>
          </div>
        )}

        {/* Modules — read-only: entitlement belongs to the plan, not the tenant */}
        {activeTab === 'modules' && (
          <GlassCard className="p-6 space-y-4">
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--neu-ink)' }}>Modules in your plan</h2>
              <p className="text-sm mb-0" style={{ color: 'var(--neu-ink-muted)' }}>
                Module access is set by your subscription. Toggling it here used to write straight
                to the institution record, which let any account unlock paid features — so it is now
                controlled from the platform console.
              </p>
            </div>

            <div className="neu-alert neu-alert-info">
              <span>
                Current plan: <strong style={{ textTransform: 'capitalize' }}>{plan}</strong>.
                To add a module, contact your CyberMilo account manager.
              </span>
            </div>

            <div className="space-y-3">
              {MODULES.map((mod) => {
                const enabled = modules[mod.key] === true;
                return (
                  <div
                    key={mod.key}
                    className="flex items-center justify-between gap-4 p-4 neu-inset"
                    style={{ borderRadius: 'var(--neu-radius)' }}
                  >
                    <div className="min-w-0">
                      <p className="font-medium mb-0" style={{ color: 'var(--neu-ink)' }}>{mod.label}</p>
                      <p className="text-sm mb-0" style={{ color: 'var(--neu-ink-muted)' }}>{mod.description}</p>
                    </div>
                    <span
                      className={`neu-badge ${enabled ? 'neu-badge-success' : ''}`}
                      style={{ flexShrink: 0 }}
                    >
                      {enabled ? 'Included' : 'Not in plan'}
                    </span>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        )}
      </div>
    </MainLayout>
  );
}
