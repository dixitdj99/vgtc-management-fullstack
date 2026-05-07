import React, { useState, useEffect } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Shield, Lock, User as UserIcon, KeyRound, ArrowLeft, ArrowRight } from 'lucide-react';

export default function AdminLoginPage() {
  const { user, login, verifyOtp, resendOtp } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Auto-redirect if already logged in as admin
  useEffect(() => {
    if (user && user.role === 'admin') {
      window.location.href = '/admin';
    }
  }, [user]);

  // OTP States
  const [otpMode, setOtpMode] = useState(false);
  const [otp, setOtp] = useState('');
  const [userId, setUserId] = useState(null);
  const [userEmail, setUserEmail] = useState('');
  const [resending, setResending] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (otpMode) {
        await verifyOtp(userId, otp, '', '');
        window.location.href = '/admin';
      } else {
        const result = await login(username, password, '', '');
        if (result && result.requireOtp) {
          setOtpMode(true);
          setUserId(result.userId);
          setUserEmail(result.email);
          setOtp('');
        } else {
          // Check if admin
          if (result && result.role !== 'admin') {
              setError('Access denied: Admin privileges required.');
          } else {
              window.location.href = '/admin';
          }
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
    try {
      await resendOtp(userId);
      setError('A new OTP has been sent to your email.');
    } catch (err) {
      setError('Failed to resend OTP');
    } finally {
      setResending(false);
    }
  };

  const accentColor = '#8b5cf6'; // Violet for Admin

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0f172a', // Deep Slate
      fontFamily: '"Plus Jakarta Sans", sans-serif',
    }}>
      {/* Dynamic Background Pattern */}
      <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
        <div style={{
          position: 'absolute', top: '-10%', left: '20%', width: '700px', height: '700px',
          background: `radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 60%)`,
          filter: 'blur(60px)',
        }} />
        <div style={{
          position: 'absolute', bottom: '-20%', right: '10%', width: '500px', height: '500px',
          background: `radial-gradient(circle, rgba(236, 72, 153, 0.1) 0%, transparent 60%)`,
          filter: 'blur(60px)',
        }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '420px', padding: '0 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '20px',
            background: `linear-gradient(135deg, #8b5cf6, #6366f1)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
            boxShadow: '0 10px 30px rgba(139, 92, 246, 0.4)', border: '1px solid rgba(255,255,255,0.2)'
          }}>
            <Shield size={32} color="white" />
          </div>
          <div style={{ fontSize: '28px', fontWeight: 900, color: 'white', letterSpacing: '-0.02em' }}>
            System Console
          </div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8', marginTop: '6px' }}>
            Authorized Administrative Personnel Only
          </div>
        </div>

        <div style={{
          background: 'rgba(30, 41, 59, 0.7)', border: '1px solid rgba(255,255,255,0.1)',
          backdropFilter: 'blur(20px)', borderRadius: '24px', padding: '32px',
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'white', marginBottom: '4px' }}>
                {otpMode ? 'Security Verification' : 'Administrator Login'}
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                {otpMode ? `Code sent to ${userEmail.replace(/(.{3})(.*)(@.*)/, '$1***$3')}` : 'Enter your admin credentials'}
              </div>
            </div>
            {otpMode && (
              <button onClick={() => setOtpMode(false)} style={{
                background: 'rgba(139, 92, 246, 0.1)', border: 'none', color: '#a78bfa', fontSize: '11.5px', fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px', borderRadius: '8px'
              }}>
                <ArrowLeft size={12} /> Back
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit}>
            {!otpMode ? (
              <>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{
                    fontSize: '11px', fontWeight: 700, color: '#94a3b8',
                    textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '8px'
                  }}>
                    Admin Username
                  </label>
                  <div style={{ position: 'relative' }}>
                    <UserIcon size={15} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                    <input
                      type="text" value={username} onChange={e => setUsername(e.target.value)}
                      placeholder="e.g. system_admin" autoFocus required
                      style={{
                        width: '100%', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '12px', padding: '13px 14px 13px 40px', color: 'white',
                        fontSize: '14px', outline: 'none', transition: 'all 0.2s', boxSizing: 'border-box'
                      }}
                      onFocus={e => { e.target.style.borderColor = accentColor; e.target.style.background = 'rgba(15, 23, 42, 0.9)' }}
                      onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; e.target.style.background = 'rgba(15, 23, 42, 0.6)' }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <label style={{
                    fontSize: '11px', fontWeight: 700, color: '#94a3b8',
                    textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '8px'
                  }}>
                    Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={15} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                    <input
                      type="password" value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••" required
                      style={{
                        width: '100%', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '12px', padding: '13px 14px 13px 40px', color: 'white',
                        fontSize: '14px', outline: 'none', transition: 'all 0.2s', boxSizing: 'border-box'
                      }}
                      onFocus={e => { e.target.style.borderColor = accentColor; e.target.style.background = 'rgba(15, 23, 42, 0.9)' }}
                      onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; e.target.style.background = 'rgba(15, 23, 42, 0.6)' }}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div style={{ marginBottom: '24px' }}>
                <label style={{
                  fontSize: '11px', fontWeight: 700, color: '#94a3b8',
                  textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '8px'
                }}>
                  6-Digit OTP Code
                </label>
                <div style={{ position: 'relative' }}>
                  <KeyRound size={15} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                  <input
                    type="text" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456" autoFocus required maxLength={6}
                    style={{
                      width: '100%', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '12px', padding: '13px 14px 13px 40px', color: 'white',
                      fontSize: '20px', fontWeight: 800, letterSpacing: '0.2em', outline: 'none',
                      transition: 'all 0.2s', boxSizing: 'border-box'
                    }}
                    onFocus={e => { e.target.style.borderColor = accentColor; e.target.style.background = 'rgba(15, 23, 42, 0.9)' }}
                    onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; e.target.style.background = 'rgba(15, 23, 42, 0.6)' }}
                  />
                </div>
              </div>
            )}

            {error && (
              <div style={{
                background: error.includes('sent') ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)',
                border: `1px solid ${error.includes('sent') ? 'rgba(16,185,129,0.2)' : 'rgba(244,63,94,0.2)'}`,
                borderRadius: '12px', padding: '12px 14px', fontSize: '13px',
                color: error.includes('sent') ? '#34d399' : '#fb7185',
                fontWeight: 600, marginBottom: '20px'
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
                background: `linear-gradient(135deg, ${accentColor}, #6366f1)`,
                color: 'white', fontSize: '14.5px', fontWeight: 800,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                boxShadow: `0 8px 20px rgba(139, 92, 246, 0.3)`,
                opacity: loading ? 0.7 : 1, transition: 'all 0.2s', fontFamily: 'inherit'
              }}
            >
              {loading ? (otpMode ? 'Verifying…' : 'Authenticating…') : (
                <>{otpMode ? 'Verify Access' : 'Secure Login'} <ArrowRight size={16} /></>
              )}
            </button>

            {otpMode && (
              <div style={{ textAlign: 'center', marginTop: '20px' }}>
                <button type="button" onClick={handleResendOtp} disabled={resending} style={{
                  background: 'none', border: 'none', color: '#94a3b8', fontSize: '12.5px',
                  fontWeight: 600, cursor: resending ? 'not-allowed' : 'pointer', textDecoration: 'underline'
                }}>
                  {resending ? 'Sending...' : "Didn't receive code? Resend"}
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
