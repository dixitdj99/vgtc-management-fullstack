import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { User, Lock, LogIn, Truck, MapPin, KeyRound, ArrowLeft, Building2, Factory, Eye, EyeOff } from 'lucide-react';

const LOCATIONS = [
  {
    id: 'jharli',
    label: 'Jharli Dump & Plant',
    desc: 'JK Lakshmi Dump · Factory · JK Super Factory',
    color: '#e53935',
    glow: 'rgba(229,57,53,0.35)',
    bg: 'rgba(229,57,53,0.08)',
    border: 'rgba(229,57,53,0.35)',
    icon: Factory,
    plant: 'jklakshmi',
    godown: '',
  },
  {
    id: 'kosli',
    label: 'Kosli Dump',
    desc: 'Kosli LR · Bill · Balance · Stock',
    color: '#1565c0',
    glow: 'rgba(21,101,192,0.35)',
    bg: 'rgba(21,101,192,0.08)',
    border: 'rgba(21,101,192,0.35)',
    icon: Truck,
    plant: 'jksuper',
    godown: 'kosli',
  },
  {
    id: 'jhajjar',
    label: 'Jajjhar Dump',
    desc: 'Jhajjar LR · Bill · Balance · Stock',
    color: '#00897b',
    glow: 'rgba(0,137,123,0.35)',
    bg: 'rgba(0,137,123,0.08)',
    border: 'rgba(0,137,123,0.35)',
    icon: Building2,
    plant: 'jksuper',
    godown: 'jhajjar',
  },
  {
    id: 'bahadurgarh',
    label: 'Bahadurgarh Dump',
    desc: 'Bahadurgarh LR · Bill · Balance · Stock',
    color: '#d97706',
    glow: 'rgba(217,119,6,0.35)',
    bg: 'rgba(217,119,6,0.08)',
    border: 'rgba(217,119,6,0.35)',
    icon: Building2,
    plant: 'jksuper',
    godown: 'bahadurgarh',
  },
];

export default function LoginPage() {
  const { login, verifyOtp, resendOtp } = useAuth();
  const [locationId, setLocationId] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // OTP States
  const [otpMode, setOtpMode] = useState(false);
  const [otp, setOtp] = useState('');
  const [userId, setUserId] = useState(null);
  const [userEmail, setUserEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [showLocDropdown, setShowLocDropdown] = useState(false);
  const [usernameFocus, setUsernameFocus] = useState(false);
  const [passwordFocus, setPasswordFocus] = useState(false);

  const selectedLocation = LOCATIONS.find(l => l.id === locationId);
  const accentColor = '#e53935'; // Red accent like autoplant

  const handleSubmit = async e => {
    e.preventDefault();
    if (!locationId) { setError('Please select a location first'); return; }
    setError('');
    setLoading(true);
    try {
      const loc = selectedLocation;
      const plant = loc?.plant || '';
      const godown = loc?.godown || '';
      if (otpMode) {
        await verifyOtp(userId, otp, plant, godown);
      } else {
        const result = await login(username, password, plant, godown);
        if (result && result.requireOtp) {
          setOtpMode(true);
          setUserId(result.userId);
          setUserEmail(result.email);
          setOtp('');
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please check your credentials.');
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

  return (
    <div
      id="login-container"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingLeft: '6%',
        backgroundImage: 'url(/truck_highway_bg.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Semi-transparent dark overlay for background contrast */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.15)',
        zIndex: 1,
      }} />

      <div
        id="login-card"
        style={{
          width: '320px',
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(8px)',
          borderRadius: '4px',
          padding: '32px 28px',
          boxShadow: '0 4px 30px rgba(0,0,0,0.18)',
          zIndex: 2,
          position: 'relative',
          border: '1px solid rgba(255,255,255,0.6)',
        }}
      >
        {/* Brand */}
        <div style={{ marginBottom: '22px' }}>
          <div style={{
            fontSize: '24px', fontWeight: '800', color: '#ff0000',
            fontStyle: 'italic', letterSpacing: '-0.02em',
            lineHeight: 1.2,
          }}>
            vikas goods
          </div>
          <div style={{
            fontSize: '13px', color: '#444', fontWeight: '600', marginTop: '4px',
            fontStyle: 'italic',
          }}>
            Transforming Logistics
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {!otpMode ? (
            <>
              {/* Location Selector */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{
                  fontSize: '12px', fontWeight: '700', color: '#333',
                  display: 'block', marginBottom: '6px',
                }}>
                  Location
                </label>
                <div style={{ position: 'relative' }}>
                  <div
                    onClick={() => setShowLocDropdown(!showLocDropdown)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: '#ffffff', border: `1px solid ${showLocDropdown ? '#ff0000' : '#ccc'}`,
                      borderRadius: '3px', padding: '7px 10px', cursor: 'pointer',
                      fontSize: '12px', minHeight: '34px',
                    }}
                  >
                    {selectedLocation ? (
                      <span style={{ fontWeight: '600', color: '#111' }}>
                        {selectedLocation.label}
                      </span>
                    ) : (
                      <span style={{ color: '#aaa' }}>Choose location...</span>
                    )}
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      style={{ transform: showLocDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </div>

                  {showLocDropdown && (
                    <>
                      <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setShowLocDropdown(false)} />
                      <div style={{
                        position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 11,
                        background: '#fff', border: '1.5px solid #ddd', borderRadius: '8px',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden',
                      }}>
                        {LOCATIONS.map(loc => {
                          const active = locationId === loc.id;
                          return (
                            <div key={loc.id}
                              onClick={() => { setLocationId(loc.id); setShowLocDropdown(false); setError(''); }}
                              style={{
                                padding: '8px 10px', cursor: 'pointer',
                                fontSize: '12px',
                                background: active ? '#f0f0f0' : 'transparent',
                                color: active ? '#ff0000' : '#111',
                                fontWeight: active ? '700' : '500',
                                borderBottom: '1px solid #f5f5f5',
                              }}
                              onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#f7f7f7'; }}
                              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                            >
                              {loc.label}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Username */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{
                  fontSize: '12px', fontWeight: '700', color: '#333',
                  display: 'block', marginBottom: '6px',
                }}>
                  Username
                </label>
                <input
                  id="login-username"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Enter Username"
                  autoFocus
                  required
                  style={{
                    width: '100%', background: '#ffffff',
                    border: `1px solid ${usernameFocus ? '#ff0000' : '#d0d0d0'}`,
                    borderRadius: '3px', padding: '9px 12px', color: '#111',
                    fontSize: '13px', outline: 'none', boxSizing: 'border-box',
                  }}
                  onFocus={() => setUsernameFocus(true)}
                  onBlur={() => setUsernameFocus(false)}
                />
              </div>

              {/* Password */}
              <div style={{ marginBottom: '18px' }}>
                <label style={{
                  fontSize: '12px', fontWeight: '700', color: '#333',
                  display: 'block', marginBottom: '6px',
                }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter Password"
                    required
                    style={{
                      width: '100%', background: '#ffffff',
                      border: `1px solid ${passwordFocus ? '#ff0000' : '#d0d0d0'}`,
                      borderRadius: '3px', padding: '9px 32px 9px 12px', color: '#111',
                      fontSize: '13px', outline: 'none', boxSizing: 'border-box',
                    }}
                    onFocus={() => setPasswordFocus(true)}
                    onBlur={() => setPasswordFocus(false)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute', right: '8px', top: '50%',
                      transform: 'translateY(-50%)', background: 'none', border: 'none',
                      cursor: 'pointer', padding: '2px', color: '#888', display: 'flex',
                    }}
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* OTP Input */
            <div style={{ marginBottom: '18px' }}>
              <label style={{
                fontSize: '11px', fontWeight: '700', color: '#555',
                display: 'block', marginBottom: '5px',
              }}>
                6-Digit OTP
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="login-otp"
                  type="text"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  autoFocus
                  required
                  maxLength={6}
                  style={{
                    width: '100%', background: '#ffffff', border: '1px solid #ff0000',
                    borderRadius: '3px', padding: '7px 10px', color: '#111',
                    fontSize: '18px', fontWeight: '700', letterSpacing: '0.15em',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ textAlign: 'right', marginTop: '6px' }}>
                <button type="button" onClick={() => setOtpMode(false)} style={{
                  background: 'none', border: 'none', color: '#ff0000',
                  fontSize: '11px', fontWeight: '600', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: '3px',
                }}>
                  <ArrowLeft size={10} /> Back to Login
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              background: error.includes('sent') ? 'rgba(0,150,136,0.05)' : 'rgba(255,0,0,0.05)',
              border: `1px solid ${error.includes('sent') ? 'rgba(0,150,136,0.2)' : 'rgba(255,0,0,0.2)'}`,
              borderRadius: '3px', padding: '8px 10px', fontSize: '11.5px',
              color: error.includes('sent') ? '#009688' : '#ff0000',
              fontWeight: '600', marginBottom: '12px',
            }}>
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            id="login-submit"
            type="submit"
            disabled={loading || (!otpMode && !locationId)}
            style={{
              width: '100%', padding: '10px', borderRadius: '3px', border: 'none',
              background: (!otpMode && !locationId) ? '#eaeaea' : '#ff0000',
              color: (!otpMode && !locationId) ? '#999' : '#ffffff',
              fontSize: '14px', fontWeight: '700',
              cursor: (!otpMode && !locationId) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              opacity: loading ? 0.8 : 1,
              transition: 'background 0.2s',
            }}
          >
            {loading ? 'Processing…' : 'Login'}
          </button>

          {/* Resend OTP */}
          {otpMode && (
            <div style={{ textAlign: 'center', marginTop: '12px' }}>
              <button type="button" onClick={handleResendOtp} disabled={resending} style={{
                background: 'none', border: 'none', color: '#ff0000', fontSize: '11px',
                fontWeight: '600', cursor: resending ? 'not-allowed' : 'pointer',
                textDecoration: 'underline',
              }}>
                {resending ? 'Sending...' : "Didn't receive code? Resend"}
              </button>
            </div>
          )}

          {/* Forgot Password hint */}
          {!otpMode && (
            <div style={{ marginTop: '14px', textAlign: 'left' }}>
              <span style={{
                fontSize: '12px', color: '#0000ff', fontWeight: '600',
                cursor: 'pointer', textDecoration: 'none',
              }}>
                Forgot Password ?
              </span>
            </div>
          )}
        </form>
      </div>

      {/* Responsive styles injected */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

        @media (max-width: 600px) {
          #login-container {
            justify-content: center !important;
            padding-left: 20px !important;
            padding-right: 20px !important;
          }
          #login-card {
            width: 100% !important;
          }
        }

        input::placeholder { color: #aaa !important; }
        input:focus { outline: none; }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}
