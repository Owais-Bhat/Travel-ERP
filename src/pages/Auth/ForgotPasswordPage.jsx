import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MdEmail, MdArrowBack, MdMarkEmailRead, MdContentCopy, MdCheck } from 'react-icons/md';
import api from '../../lib/api';
import AuthLayout from '../../components/Layout/AuthLayout';
import Input from '../../components/Common/Input';
import Button from '../../components/Common/Button';
import { useNotification } from '../../hooks/useNotification';

/**
 * Password reset request.
 *
 * Ported off Supabase Auth. The backend always answers the same way so the
 * form cannot be used to discover which emails have accounts. With no mail
 * transport configured, a development build returns the token directly so
 * the flow stays testable; production expects an administrator to issue the
 * reset from the users screen.
 */
export default function ForgotPasswordPage() {
  const notification = useNotification();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [devToken, setDevToken] = useState('');
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid email address');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/forgot-password', { email });
      setDevToken(data?.resetToken || '');
      setSent(true);
    } catch (err) {
      const message = err.response?.data?.error || err.message;
      notification.error(message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const copyToken = async () => {
    await navigator.clipboard.writeText(devToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AuthLayout>
      {sent ? (
        <div className="text-center py-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ boxShadow: 'var(--neu-inset)', color: 'var(--neu-success)' }}
          >
            <MdMarkEmailRead className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-bold font-display mb-2" style={{ color: 'var(--neu-ink)' }}>
            Request received
          </h2>
          <p className="text-sm mb-6" style={{ color: 'var(--neu-ink-muted)' }}>
            If an account exists for{' '}
            <span className="font-semibold" style={{ color: 'var(--neu-ink-soft)' }}>{email}</span>,
            a reset link has been generated. It expires in 30 minutes.
          </p>

          {devToken && (
            <div className="neu-alert neu-alert-warning text-left mb-6">
              <div className="min-w-0">
                <p className="font-semibold mb-1" style={{ color: 'var(--neu-ink)' }}>
                  Development mode
                </p>
                <p className="text-xs mb-2">
                  No mail transport is configured, so the token is shown here. Paste it on the
                  reset page.
                </p>
                <code className="block text-[11px] break-all p-2 neu-inset">{devToken}</code>
                <button
                  type="button"
                  onClick={copyToken}
                  className="neu-btn neu-btn-xs mt-2"
                >
                  {copied ? <MdCheck className="w-3.5 h-3.5" /> : <MdContentCopy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy token'}
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <Link to={devToken ? `/reset-password?token=${encodeURIComponent(devToken)}` : '/reset-password'}>
              <Button variant="primary" fullWidth type="button">Continue to reset</Button>
            </Link>
            <Link to="/login">
              <Button variant="secondary" fullWidth type="button" icon={MdArrowBack}>
                Back to sign in
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <h2 className="text-2xl font-bold font-display" style={{ color: 'var(--neu-ink)' }}>
              Forgot password?
            </h2>
            <p className="text-sm mt-1" style={{ color: 'var(--neu-ink-muted)' }}>
              Enter your account email and we&apos;ll start a reset.
            </p>
          </div>

          <Input
            name="email"
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(event) => { setEmail(event.target.value); setError(''); }}
            error={error}
            leftIcon={MdEmail}
            wrapperClass="mb-0"
            autoComplete="email"
          />

          <Button type="submit" variant="primary" loading={loading} disabled={loading} fullWidth size="lg">
            Send reset link
          </Button>

          <p className="text-center text-sm mb-0" style={{ color: 'var(--neu-ink-muted)' }}>
            Remembered it?{' '}
            <Link to="/login" className="font-semibold" style={{ color: 'var(--neu-primary)' }}>
              Sign in
            </Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}
