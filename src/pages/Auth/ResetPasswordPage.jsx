import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MdLock, MdErrorOutline, MdVpnKey } from 'react-icons/md';
import api from '../../lib/api';
import AuthLayout from '../../components/Layout/AuthLayout';
import Input from '../../components/Common/Input';
import Button from '../../components/Common/Button';
import { useNotification } from '../../hooks/useNotification';

/**
 * Set a new password from a reset token.
 *
 * Ported off Supabase Auth: the token arrives as `?token=` and is redeemed
 * against the backend, which validates the hash and its expiry.
 */
export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const notification = useNotification();
  const [searchParams] = useSearchParams();

  const [token, setToken] = useState('');
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const fromUrl = searchParams.get('token');
    if (fromUrl) setToken(fromUrl);
  }, [searchParams]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    const nextErrors = {};
    if (!token.trim()) nextErrors.token = 'Paste the reset token from your email';
    if (form.password.length < 8) nextErrors.password = 'Minimum 8 characters';
    else if (!/[a-zA-Z]/.test(form.password) || !/\d/.test(form.password)) {
      nextErrors.password = 'Include at least one letter and one number';
    }
    if (form.confirm !== form.password) nextErrors.confirm = 'Passwords do not match';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      await api.post('/auth/reset-password', { token: token.trim(), newPassword: form.password });
      setDone(true);
      notification.success('Password updated. Sign in with your new password.');
      setTimeout(() => navigate('/login'), 1600);
    } catch (err) {
      const message = err.response?.data?.error || err.message;
      notification.error(message);
      setErrors({ form: message });
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <AuthLayout>
        <div className="text-center py-6">
          <h2 className="text-2xl font-bold font-display mb-2" style={{ color: 'var(--neu-ink)' }}>
            Password updated
          </h2>
          <p className="text-sm mb-6" style={{ color: 'var(--neu-ink-muted)' }}>
            Taking you to the sign-in page…
          </p>
          <Link to="/login">
            <Button variant="primary" fullWidth type="button">Sign in now</Button>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <h2 className="text-2xl font-bold font-display" style={{ color: 'var(--neu-ink)' }}>
            Set a new password
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--neu-ink-muted)' }}>
            Choose a strong password for your account.
          </p>
        </div>

        {errors.form && (
          <div className="neu-alert neu-alert-error">
            <MdErrorOutline className="w-5 h-5 shrink-0" style={{ color: 'var(--neu-danger)' }} />
            <span>{errors.form}</span>
          </div>
        )}

        <div className="space-y-4">
          {!searchParams.get('token') && (
            <Input
              name="token"
              label="Reset token"
              placeholder="Paste the token from your reset email"
              value={token}
              onChange={(event) => { setToken(event.target.value); setErrors({}); }}
              error={errors.token}
              leftIcon={MdVpnKey}
              wrapperClass="mb-0"
            />
          )}

          <Input
            name="password"
            type="password"
            placeholder="New password"
            value={form.password}
            onChange={(event) => { setForm((f) => ({ ...f, password: event.target.value })); setErrors({}); }}
            error={errors.password}
            hint="At least 8 characters, with a letter and a number."
            leftIcon={MdLock}
            wrapperClass="mb-0"
            autoComplete="new-password"
          />

          <Input
            name="confirm"
            type="password"
            placeholder="Confirm new password"
            value={form.confirm}
            onChange={(event) => { setForm((f) => ({ ...f, confirm: event.target.value })); setErrors({}); }}
            error={errors.confirm}
            leftIcon={MdLock}
            wrapperClass="mb-0"
            autoComplete="new-password"
          />
        </div>

        <Button type="submit" variant="primary" loading={saving} disabled={saving} fullWidth size="lg">
          Update password
        </Button>

        <p className="text-center text-sm mb-0" style={{ color: 'var(--neu-ink-muted)' }}>
          Link expired?{' '}
          <Link to="/forgot-password" className="font-semibold" style={{ color: 'var(--neu-primary)' }}>
            Request a new one
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
