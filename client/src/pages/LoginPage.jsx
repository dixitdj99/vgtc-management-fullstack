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
  const { login, signup, forgotPassword, verifyOtp, resendOtp, resetPassword } = useAuth();
  const [view, setView] = useState('login'); // 'login' | 'signup' | 'forgot'
  const [locationId, setLocationId] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
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
  const [nameFocus, setNameFocus] = useState(false);
  const [usernameFocus, setUsernameFocus] = useState(false);
  const [emailFocus, setEmailFocus] = useState(false);
  const [passwordFocus, setPasswordFocus] = useState(false);
  const [methodId, setMethodId] = useState('');

  const selectedLocation = LOCATIONS.find(l => l.id === locationId);
  const accentColor = '#ff0000'; // Red accent like autoplant

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (view === 'signup') {
        if (!name || !username || !email || !password) {
          setError('All fields are required');
          setLoading(false);
          return;
        }
        if (otpMode) {
          await signup(name, username, email, password, 'vgtc', otp, methodId);
        } else {
          const res = await signup(name, username, email, password, 'vgtc');
          if (res && res.requireOtp) {
            setOtpMode(true);
            setMethodId(res.methodId);
            setOtp('');
            setError('An OTP has been sent to your email.');
          }
        }
      } else if (view === 'forgot') {
        if (!email) {
          setError('Email is required');
          setLoading(false);
          return;
        }
        await forgotPassword(email);
        setError('A password reset link has been sent to your email. Please check your inbox.');
        setEmail('');
      } else {
        // Login flow
        if (!locationId) { setError('Please select a location first'); setLoading(false); return; }
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
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Action failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (view === 'signup' || view === 'forgot') {
      setResending(true);
      setError('');
      try {
        const res = view === 'signup' 
          ? await signup(name, username, email, password, 'vgtc')
          : await forgotPassword(email);
        if (res && res.methodId) {
          setMethodId(res.methodId);
        }
        setError('A new OTP has been sent to your email.');
      } catch (err) {
        setError('Failed to resend OTP');
      } finally {
        setResending(false);
      }
      return;
    }

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
        paddingLeft: '10%',
        backgroundImage: 'url(/truck_highway_bg.jpg)',
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
          width: '340px',
          background: '#f4f4f4',
          borderRadius: '8px',
          padding: '36px 30px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
          zIndex: 2,
          position: 'relative',
          border: '1px solid #d3d3d3',
        }}
      >
        {/* Brand */}
        <div style={{ marginBottom: '24px', textAlign: 'center' }}>
          <div style={{
            fontSize: '30px', fontWeight: '900', color: '#ff0000',
            fontStyle: 'normal', letterSpacing: '-0.03em',
            lineHeight: 1.1,
          }}>
            vikas goods
          </div>
          <div style={{
            fontSize: '14px', color: '#333333', fontWeight: '600', marginTop: '6px',
            fontStyle: 'normal',
          }}>
            {view === 'login' ? 'Transforming Logistics' : view === 'signup' ? 'Create Your Account' : 'Reset Your Password'}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {!otpMode ? (
            <>
              {view === 'signup' && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{
                    fontSize: '12.5px', fontWeight: '700', color: '#444',
                    display: 'block', marginBottom: '6px',
                  }}>
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Enter Full Name"
                    required
                    style={{
                      width: '100%', background: '#ffffff',
                      border: `1px solid ${nameFocus ? '#ff0000' : '#cccccc'}`,
                      borderRadius: '4px', padding: '9px 12px', color: '#111',
                      fontSize: '13px', outline: 'none', boxSizing: 'border-box',
                    }}
                    onFocus={() => setNameFocus(true)}
                    onBlur={() => setNameFocus(false)}
                  />
                </div>
              )}

              {view === 'login' && (
                /* Location Selector */
                <div style={{ marginBottom: '16px' }}>
                  <label style={{
                    fontSize: '12.5px', fontWeight: '700', color: '#444',
                    display: 'block', marginBottom: '6px',
                  }}>
                    Location
                  </label>
                  <div style={{ position: 'relative' }}>
                    <div
                      onClick={() => setShowLocDropdown(!showLocDropdown)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        background: '#ffffff', border: `1px solid ${showLocDropdown ? '#ff0000' : '#cccccc'}`,
                        borderRadius: '4px', padding: '8px 12px', cursor: 'pointer',
                        fontSize: '13px', minHeight: '36px',
                      }}
                    >
                      {selectedLocation ? (
                        <span style={{ fontWeight: '600', color: '#111' }}>
                          {selectedLocation.label}
                        </span>
                      ) : (
                        <span style={{ color: '#aaaaaa' }}>Choose location...</span>
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
              )}

              {view !== 'forgot' && (
                /* Username */
                <div style={{ marginBottom: '16px' }}>
                  <label style={{
                    fontSize: '12.5px', fontWeight: '700', color: '#444',
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
                    required
                    style={{
                      width: '100%', background: '#ffffff',
                      border: `1px solid ${usernameFocus ? '#ff0000' : '#cccccc'}`,
                      borderRadius: '4px', padding: '9px 12px', color: '#111',
                      fontSize: '13px', outline: 'none', boxSizing: 'border-box',
                    }}
                    onFocus={() => setUsernameFocus(true)}
                    onBlur={() => setUsernameFocus(false)}
                  />
                </div>
              )}

              {view !== 'login' && (
                /* Email */
                <div style={{ marginBottom: '16px' }}>
                  <label style={{
                    fontSize: '12.5px', fontWeight: '700', color: '#444',
                    display: 'block', marginBottom: '6px',
                  }}>
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="Enter Email Address"
                    required
                    style={{
                      width: '100%', background: '#ffffff',
                      border: `1px solid ${emailFocus ? '#ff0000' : '#cccccc'}`,
                      borderRadius: '4px', padding: '9px 12px', color: '#111',
                      fontSize: '13px', outline: 'none', boxSizing: 'border-box',
                    }}
                    onFocus={() => setEmailFocus(true)}
                    onBlur={() => setEmailFocus(false)}
                  />
                </div>
              )}

              {view !== 'forgot' && (
                /* Password */
                <div style={{ marginBottom: '20px' }}>
                  <label style={{
                    fontSize: '12.5px', fontWeight: '700', color: '#444',
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
                        border: `1px solid ${passwordFocus ? '#ff0000' : '#cccccc'}`,
                        borderRadius: '4px', padding: '9px 32px 9px 12px', color: '#111',
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
              )}
            </>
          ) : (
            /* OTP Input */
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                fontSize: '11px', fontWeight: '700', color: '#555',
                display: 'block', marginBottom: '5px',
              }}>
                {view === 'forgot' ? 'OTP Code & New Password' : '6-Digit OTP'}
              </label>
              <div style={{ position: 'relative', marginBottom: view === 'forgot' ? '12px' : '0px' }}>
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
                    borderRadius: '4px', padding: '7px 10px', color: '#111',
                    fontSize: '18px', fontWeight: '700', letterSpacing: '0.15em',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
              {view === 'forgot' && (
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter New Password"
                    required
                    style={{
                      width: '100%', background: '#ffffff', border: '1px solid #cccccc',
                      borderRadius: '4px', padding: '7px 10px', color: '#111',
                      fontSize: '13px', outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}
              <div style={{ textAlign: 'right', marginTop: '6px' }}>
                <button type="button" onClick={() => { setOtpMode(false); setOtp(''); }} style={{
                  background: 'none', border: 'none', color: '#ff0000',
                  fontSize: '11px', fontWeight: '600', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: '3px',
                }}>
                  <ArrowLeft size={10} /> Back
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              background: (error.includes('sent') || error.includes('successful')) ? 'rgba(0,150,136,0.05)' : 'rgba(255,0,0,0.05)',
              border: `1px solid ${(error.includes('sent') || error.includes('successful')) ? 'rgba(0,150,136,0.2)' : 'rgba(255,0,0,0.2)'}`,
              borderRadius: '4px', padding: '8px 10px', fontSize: '11.5px',
              color: (error.includes('sent') || error.includes('successful')) ? '#009688' : '#ff0000',
              fontWeight: '600', marginBottom: '12px',
            }}>
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            id="login-submit"
            type="submit"
            disabled={loading || (view === 'login' && !otpMode && !locationId)}
            style={{
              width: '100%', padding: '11px', borderRadius: '4px', border: 'none',
              background: (view === 'login' && !otpMode && !locationId) ? '#eaeaea' : '#ff0000',
              color: (view === 'login' && !otpMode && !locationId) ? '#999' : '#ffffff',
              fontSize: '14px', fontWeight: '700',
              cursor: (view === 'login' && !otpMode && !locationId) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              opacity: loading ? 0.8 : 1,
              transition: 'background 0.2s',
            }}
          >
            {loading ? 'Processing…' : view === 'login' ? (otpMode ? 'Verify & Login' : 'Login') : (otpMode ? 'Reset Password' : 'Send Reset Link')}
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

          {/* View Toggle Links */}
          {!otpMode && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px', textAlign: 'center', fontSize: '12.5px' }}>
              {view === 'login' && (
                <button type="button" onClick={() => { setView('forgot'); setError(''); }} style={{ background: 'none', border: 'none', color: '#ff0000', cursor: 'pointer', fontWeight: '700', textDecoration: 'underline' }}>
                  Forgot Password?
                </button>
              )}
              {view === 'forgot' && (
                <button type="button" onClick={() => { setView('login'); setError(''); }} style={{ background: 'none', border: 'none', color: '#ff0000', cursor: 'pointer', fontWeight: '700', textDecoration: 'underline' }}>
                  Back to Login
                </button>
              )}
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
