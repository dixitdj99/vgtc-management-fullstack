import React, { useEffect, useLayoutEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, KeyRound, Lock, Shield, User as UserIcon } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import './admin.css';
import './adminLogin.css';

export default function AdminLoginPage() {
  const { user, ready, login, verifyOtp, resendOtp } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpMode, setOtpMode] = useState(false);
  const [otp, setOtp] = useState('');
  const [userId, setUserId] = useState(null);
  const [userEmail, setUserEmail] = useState('');
  const [resending, setResending] = useState(false);

  useLayoutEffect(() => {
    const syncTheme = () => {
      const saved = localStorage.getItem('vgtc-theme');
      document.documentElement.setAttribute('data-theme', ['light', 'dark', 'sepia'].includes(saved) ? saved : 'light');
    };
    syncTheme();
    window.addEventListener('storage', syncTheme);
    return () => window.removeEventListener('storage', syncTheme);
  }, []);
  useEffect(() => {
    if (ready && user?.role === 'admin') window.location.href = '/admin';
  }, [ready, user]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    try {
      if (otpMode) {
        await verifyOtp(userId, otp, '', '');
        window.location.href = '/admin';
      } else {
        const result = await login(username, password, '', '');
        if (result?.requireOtp) {
          setOtpMode(true);
          setUserId(result.userId);
          setUserEmail(result.email || '');
          setOtp('');
        } else if (result?.role !== 'admin') {
          setError('Access denied: Admin privileges required.');
        } else {
          window.location.href = '/admin';
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!userId) return;
    setResending(true);
    setError('');
    setNotice('');
    try {
      await resendOtp(userId);
      setNotice('A new OTP has been sent to your email.');
    } catch {
      setError('Failed to resend OTP');
    } finally {
      setResending(false);
    }
  };

  return (
    <main className="adm adm-login">
      <div className="adm-login-wrap">
        <header className="adm-login-brand">
          <span className="adm-login-mark" aria-hidden="true"><Shield size={27} strokeWidth={2} /></span>
          <p className="adm-login-eyebrow">VGTC administration</p>
          <h1>System Console</h1>
          <p>Authorized administrative personnel only</p>
        </header>
        <section className="adm-login-panel" aria-labelledby="adm-login-title">
          <div className="adm-login-panel-head">
            <div>
              <h2 id="adm-login-title">{otpMode ? 'Security verification' : 'Administrator login'}</h2>
              <p>{otpMode ? `Code sent to ${userEmail.replace(/(.{3})(.*)(@.*)/, '$1***$3')}` : 'Enter your admin credentials'}</p>
            </div>
            {otpMode && (
              <button className="adm-login-back" type="button" onClick={() => { setOtpMode(false); setError(''); setNotice(''); }}>
                <ArrowLeft size={14} /> Back
              </button>
            )}
          </div>
          <form onSubmit={handleSubmit}>
            {!otpMode ? (
              <>
                <div className="adm-login-field">
                  <label htmlFor="admin-username">Admin username</label>
                  <div className="adm-login-input-wrap">
                    <UserIcon size={17} aria-hidden="true" />
                    <input id="admin-username" type="text" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Username" autoComplete="username" autoFocus required />
                  </div>
                </div>
                <div className="adm-login-field">
                  <label htmlFor="admin-password">Password</label>
                  <div className="adm-login-input-wrap">
                    <Lock size={17} aria-hidden="true" />
                    <input id="admin-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" autoComplete="current-password" required />
                  </div>
                </div>
              </>
            ) : (
              <div className="adm-login-field">
                <label htmlFor="admin-otp">6-digit OTP code</label>
                <div className="adm-login-input-wrap">
                  <KeyRound size={17} aria-hidden="true" />
                  <input id="admin-otp" className="adm-login-otp" type="text" inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" autoFocus required minLength={6} maxLength={6} />
                </div>
              </div>
            )}
            {error && <p className="adm-login-message adm-login-message--error" role="alert">{error}</p>}
            {notice && <p className="adm-login-message adm-login-message--success" role="status">{notice}</p>}
            <button className="adm-login-submit" type="submit" disabled={loading}>
              {loading ? (otpMode ? 'Verifying…' : 'Authenticating…') : (otpMode ? 'Verify access' : 'Secure login')}
              {!loading && <ArrowRight size={16} aria-hidden="true" />}
            </button>
            {otpMode && (
              <button className="adm-login-resend" type="button" onClick={handleResendOtp} disabled={resending}>
                {resending ? 'Sending…' : "Didn't receive code? Resend"}
              </button>
            )}
          </form>
        </section>
      </div>
    </main>
  );
}
