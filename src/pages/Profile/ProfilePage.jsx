import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import api from '../../lib/api';
import { MdPerson, MdLock, MdCamera } from 'react-icons/md';

export default function ProfilePage() {
  const { profile, updateProfile, user } = useAuth();
  const notification = useNotification();
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [profileForm, setProfileForm] = useState({
    first_name: profile?.first_name || '',
    last_name: profile?.last_name || '',
    phone: profile?.phone || '',
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordErrors, setPasswordErrors] = useState({});

  const handleProfileChange = (e) => setProfileForm(p => ({ ...p, [e.target.name]: e.target.value }));
  const handlePasswordChange = (e) => {
    setPasswordForm(p => ({ ...p, [e.target.name]: e.target.value }));
    if (passwordErrors[e.target.name]) setPasswordErrors(p => ({ ...p, [e.target.name]: '' }));
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    if (!profileForm.first_name.trim()) { notification.error('First name is required'); return; }
    setSavingProfile(true);
    const { success, error } = await updateProfile({
      first_name: profileForm.first_name.trim(),
      last_name: profileForm.last_name.trim(),
      phone: profileForm.phone.trim(),
    });
    setSavingProfile(false);
    if (success) notification.success('Profile updated successfully');
    else notification.error(error || 'Failed to update profile');
  };

  const savePassword = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!passwordForm.currentPassword) errs.currentPassword = 'Current password is required';
    if (!passwordForm.newPassword) errs.newPassword = 'New password is required';
    else if (passwordForm.newPassword.length < 8) errs.newPassword = 'Minimum 8 characters';
    else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(passwordForm.newPassword)) errs.newPassword = 'Must include uppercase, lowercase, and number';
    if (passwordForm.newPassword !== passwordForm.confirmPassword) errs.confirmPassword = 'Passwords do not match';
    if (Object.keys(errs).length > 0) { setPasswordErrors(errs); return; }

    setSavingPassword(true);
    try {
      // The API verifies the current password before rotating it — the old
      // Supabase call changed it on session trust alone.
      await api.put('/auth/password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      notification.success('Password changed successfully');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      notification.error(err.response?.data?.error || err.message);
    } finally {
      setSavingPassword(false);
    }
  };

  const initials = `${profile?.first_name?.[0] || ''}${profile?.last_name?.[0] || ''}`.toUpperCase() || 'U';

  return (
    <MainLayout>
      <div className="p-6 max-w-2xl space-y-6">
        <h1 className="text-3xl font-bold text-white">My Profile</h1>

        {/* Avatar */}
        <GlassCard className="p-6">
          <div className="flex items-center gap-6">
            <div className="relative">
              <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-primary-blue to-neon-cyan flex items-center justify-center text-2xl font-bold text-white">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover rounded-xl" />
                ) : initials}
              </div>
              <button className="absolute -bottom-2 -right-2 w-7 h-7 rounded-full bg-neon-cyan flex items-center justify-center shadow-lg hover:bg-neon-cyan/80 transition">
                <MdCamera className="w-4 h-4 text-black" />
              </button>
            </div>
            <div>
              <p className="text-white font-bold text-lg">{profile?.first_name} {profile?.last_name}</p>
              <p className="text-white/60 capitalize">{profile?.role?.replace('_', ' ')}</p>
              <p className="text-white/40 text-sm">{user?.email}</p>
            </div>
          </div>
        </GlassCard>

        {/* Profile form */}
        <GlassCard className="p-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><MdPerson /> Personal Information</h2>
          <form onSubmit={saveProfile} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="First Name"
                name="first_name"
                value={profileForm.first_name}
                onChange={handleProfileChange}
                placeholder="First name"
              />
              <Input
                label="Last Name"
                name="last_name"
                value={profileForm.last_name}
                onChange={handleProfileChange}
                placeholder="Last name"
              />
            </div>
            <Input
              label="Phone Number"
              name="phone"
              value={profileForm.phone}
              onChange={handleProfileChange}
              placeholder="+91 98765 43210"
            />
            <div>
              <label className="block text-white/60 text-sm mb-1">Email</label>
              <div className="bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white/50 text-sm">
                {user?.email} <span className="text-xs ml-2 text-white/30">(cannot be changed)</span>
              </div>
            </div>
            <Button type="submit" variant="primary" loading={savingProfile}>Save Profile</Button>
          </form>
        </GlassCard>

        {/* Password form */}
        <GlassCard className="p-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><MdLock /> Change Password</h2>
          <form onSubmit={savePassword} className="space-y-4">
            <Input
              label="Current Password"
              name="currentPassword"
              type="password"
              value={passwordForm.currentPassword}
              onChange={handlePasswordChange}
              error={passwordErrors.currentPassword}
              placeholder="Your existing password"
            />
            <Input
              label="New Password"
              name="newPassword"
              type="password"
              value={passwordForm.newPassword}
              onChange={handlePasswordChange}
              error={passwordErrors.newPassword}
              placeholder="Minimum 8 characters"
            />
            <Input
              label="Confirm New Password"
              name="confirmPassword"
              type="password"
              value={passwordForm.confirmPassword}
              onChange={handlePasswordChange}
              error={passwordErrors.confirmPassword}
              placeholder="Repeat new password"
            />
            <Button type="submit" variant="secondary" loading={savingPassword}>Update Password</Button>
          </form>
        </GlassCard>
      </div>
    </MainLayout>
  );
}
