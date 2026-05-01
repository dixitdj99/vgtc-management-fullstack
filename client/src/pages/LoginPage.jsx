import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { User, Lock, LogIn, Truck, MapPin, KeyRound, ArrowLeft, Building2, Factory } from 'lucide-react';

const LOCATIONS = [
  {
    id: 'jharli',
    label: 'Jharli Dump & Plant',
    desc: 'JK Lakshmi Dump · Factory · JK Super Factory',
    color: '#f59e0b',
    glow: 'rgba(245,158,11,0.35)',
    bg: 'rgba(245,158,11,0.1)',
    border: 'rgba(245,158,11,0.35)',
    icon: Factory,
    // Maps to internal values:
    plant: 'jklakshmi',
    godown: '',
  },
  {
    id: 'kosli',
    label: 'Kosli Dump',
    desc: 'Kosli LR · Bill · Balance · Stock',
    color: '#6366f1',
    glow: 'rgba(99,102,241,0.35)',
    bg: 'rgba(99,102,241,0.1)',
    border: 'rgba(99,102,241,0.35)',
    icon: Truck,
    plant: 'jksuper',
    godown: 'kosli',
  },
  {
    id: 'jhajjar',
    label: 'Jajjhar Dump',
    desc: 'Jhajjar LR · Bill · Balance · Stock',
    color: '#14b8a6',
    glow: 'rgba(20,184,166,0.35)',
    bg: 'rgba(20,184,166,0.1)',
    border: 'rgba(20,184,166,0.35)',
    icon: Building2,
    plant: 'jksuper',
    godown: 'jhajjar',
  },
];

export default function LoginPage() {
  const { login, verifyOtp, resendOtp } = useAuth();
  const [locationId, setLocationId] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // OTP States
  const [otpMode, setOtpMode] = useState(false);
  const [otp, setOtp] = useState('');
  const [userId, setUserId] = useState(null);
  const [userEmail, setUserEmail] = useState('');
  const [resending, setResending] = useState(false);

  const selectedLocation = LOCATIONS.find(l => l.id === locationId);

  const handleSubmit = async e => {
    e.preventDefault();
    if (!locationId) { setError('Please select a location first'); return; }
    setError('');
    setLoading(true);
    try {
      const loc = selectedLocation;
      if (otpMode) {
        await verifyOtp(userId, otp, loc.plant, loc.godown);
      } else {
        const result = await login(username, password, loc.plant, loc.godown);
        if (result && result.requireOtp) {
          setOtpMode(true);
          setUserId(result.userId);
          setUserEmail(result.email);
          setOtp('');
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

  const accentColor = selectedLocation?.color || '#6366f1';
  const accentGlow = selectedLocation?.glow || 'rgba(99,102,241,0.35)';

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', fontFamily: '"Plus Jakarta Sans", sans-serif',
    }}>
      {/* Background glow */}
      <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
        <div style={{
          position: 'absolute', top: '-20%', left: '30%', width: '600px', height: '600px',
          background: `radial-gradient(circle, ${accentGlow.replace('0.35', '0.12')} 0%, transparent 65%)`,
          filter: 'blur(40px)', transition: 'background 0.4s'
        }} />
        <div style={{
          position: 'absolute', bottom: '-10%', right: '20%', width: '400px', height: '400px',
          background: 'radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 65%)', filter: 'blur(40px)'
        }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '480px', padding: '0 20px' }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '18px',
            background: `linear-gradient(135deg,${accentColor},${accentColor}cc)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
            boxShadow: `0 8px 32px ${accentGlow}`, transition: 'all 0.4s'
          }}>
            <Truck size={30} color="white" />
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.03em' }}>
            Vikas Goods
          </div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginTop: '4px' }}>
            Transport Management System
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px',
          padding: '28px 28px 32px', boxShadow: '0 24px 60px rgba(0,0,0,0.4)'
        }}>

          {!otpMode && (
            <>
              {/* Location selection */}
              <div style={{ marginBottom: '22px' }}>
                <label style={{
                  fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.07em', display: 'flex', alignItems: 'center',
                  gap: '6px', marginBottom: '8px'
                }}>
                  <MapPin size={12} /> Select Location
                </label>
                <div style={{ position: 'relative' }}>
                  <select
                    id="location-select"
                    value={locationId}
                    onChange={(e) => { setLocationId(e.target.value); setError(''); }}
                    style={{
                      width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)',
                      borderRadius: '10px', padding: '12px 14px', color: locationId ? 'var(--text)' : 'var(--text-muted)',
                      fontSize: '14px', fontWeight: 700, outline: 'none', transition: 'all 0.18s',
                      appearance: 'none', cursor: 'pointer', fontFamily: 'inherit', boxSizing: 'border-box'
                    }}
                    onFocus={e => e.target.style.borderColor = accentColor + '80'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                  >
                    <option value="" disabled>Choose your location...</option>
                    {LOCATIONS.map(loc => (
                      <option key={loc.id} value={loc.id}>
                        {loc.label} — {loc.desc}
                      </option>
                    ))}
                  </select>
                  <div style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', marginBottom: '20px' }} />
            </>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>
                {otpMode ? 'Enter Security Code' : `Sign in${selectedLocation ? ` — ${selectedLocation.label}` : ''}`}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                {otpMode ? `Authentication code sent to ${userEmail.replace(/(.{3})(.*)(@.*)/, '$1***$3')}` : 'Enter your credentials to continue'}
              </div>
            </div>
            {otpMode && (
              <button onClick={() => setOtpMode(false)} style={{
                background: 'none', border: 'none', color: accentColor, fontSize: '11.5px', fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 0'
              }}>
                <ArrowLeft size={12} /> Back
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit}>
            {!otpMode ? (
              <>
                <div style={{ marginBottom: '14px' }}>
                  <label style={{
                    fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: '6px'
                  }}>
                    Username
                  </label>
                  <div style={{ position: 'relative' }}>
                    <User size={14} style={{
                      position: 'absolute', left: '12px', top: '50%',
                      transform: 'translateY(-50%)', color: 'var(--text-muted)'
                    }} />
                    <input
                      id="login-username"
                      type="text" value={username} onChange={e => setUsername(e.target.value)}
                      placeholder="e.g. admin" autoFocus required
                      style={{
                        width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)',
                        borderRadius: '10px', padding: '11px 12px 11px 36px', color: 'var(--text)',
                        fontSize: '13.5px', outline: 'none', transition: 'border 0.18s',
                        fontFamily: 'inherit', boxSizing: 'border-box'
                      }}
                      onFocus={e => e.target.style.borderColor = accentColor + '80'}
                      onBlur={e => e.target.style.borderColor = 'var(--border)'}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{
                    fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: '6px'
                  }}>
                    Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={14} style={{
                      position: 'absolute', left: '12px', top: '50%',
                      transform: 'translateY(-50%)', color: 'var(--text-muted)'
                    }} />
                    <input
                      id="login-password"
                      type="password" value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••" required
                      style={{
                        width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)',
                        borderRadius: '10px', padding: '11px 12px 11px 36px', color: 'var(--text)',
                        fontSize: '13.5px', outline: 'none', transition: 'border 0.18s',
                        fontFamily: 'inherit', boxSizing: 'border-box'
                      }}
                      onFocus={e => e.target.style.borderColor = accentColor + '80'}
                      onBlur={e => e.target.style.borderColor = 'var(--border)'}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: '6px'
                }}>
                  6-Digit OTP
                </label>
                <div style={{ position: 'relative' }}>
                  <KeyRound size={14} style={{
                    position: 'absolute', left: '12px', top: '50%',
                    transform: 'translateY(-50%)', color: 'var(--text-muted)'
                  }} />
                  <input
                    id="login-otp"
                    type="text" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456" autoFocus required maxLength={6}
                    style={{
                      width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)',
                      borderRadius: '10px', padding: '11px 12px 11px 36px', color: 'var(--text)',
                      fontSize: '18px', fontWeight: 800, letterSpacing: '0.2em', outline: 'none',
                      transition: 'border 0.18s', fontFamily: 'inherit', boxSizing: 'border-box'
                    }}
                    onFocus={e => e.target.style.borderColor = accentColor + '80'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                  />
                </div>
              </div>
            )}

            {error && (
              <div style={{
                background: error.includes('sent') ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)',
                border: `1px solid ${error.includes('sent') ? 'rgba(16,185,129,0.25)' : 'rgba(244,63,94,0.25)'}`,
                borderRadius: '10px', padding: '10px 14px', fontSize: '12.5px',
                color: error.includes('sent') ? '#10b981' : 'var(--danger)',
                fontWeight: 600, marginBottom: '16px'
              }}>
                {error}
              </div>
            )}

            <button
              id="login-submit"
              type="submit"
              disabled={loading || !locationId}
              style={{
                width: '100%', padding: '13px', borderRadius: '12px', border: 'none',
                background: locationId ? `linear-gradient(135deg,${accentColor},${accentColor}dd)` : 'var(--bg-input)',
                color: locationId ? 'white' : 'var(--text-muted)',
                fontSize: '14px', fontWeight: 800,
                cursor: locationId ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                boxShadow: locationId ? `0 4px 20px ${accentGlow}` : 'none',
                opacity: loading ? 0.7 : 1, transition: 'all 0.3s',
                fontFamily: 'inherit',
              }}
            >
              {loading ? (otpMode ? 'Verifying…' : 'Signing in…') : (
                <>{otpMode ? <><KeyRound size={16} /> Verify OTP</> : <><LogIn size={16} /> Sign In</>}</>
              )}
            </button>

            {otpMode && (
              <div style={{ textAlign: 'center', marginTop: '16px' }}>
                <button type="button" onClick={handleResendOtp} disabled={resending} style={{
                  background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '12px',
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