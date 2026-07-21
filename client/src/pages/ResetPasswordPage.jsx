import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Eye, EyeOff, CheckCircle2 } from 'lucide-react';

export default function ResetPasswordPage() {
  const { resetPassword } = useAuth();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [passwordFocus, setPasswordFocus] = useState(false);
  const [tokenFocus, setTokenFocus] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      setToken(urlToken);
    }
  }, []);

  const handleSubmit = async e => {
    e.preventDefault();
    if (!token) {
      setError('Reset token is required.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await resetPassword(token, password);
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to reset password. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
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
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.15)',
        zIndex: 1,
      }} />

      <div
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
            Set New Password
          </div>
        </div>

        {success ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px', color: '#009688' }}>
              <CheckCircle2 size={48} />
            </div>
            <p style={{ fontSize: '14px', fontWeight: '600', color: '#111', marginBottom: '20px' }}>
              Password Reset Successful!
            </p>
            <button
              onClick={() => { window.location.href = '/'; }}
              style={{
                width: '100%', padding: '11px', borderRadius: '4px', border: 'none',
                background: '#ff0000', color: '#ffffff', fontSize: '14px', fontWeight: '700',
                cursor: 'pointer',
              }}
            >
              Go to Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                fontSize: '12.5px', fontWeight: '700', color: '#444',
                display: 'block', marginBottom: '6px',
              }}>
                Reset Token
              </label>
              <input
                type="text"
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="Enter reset token if not in URL"
                required
                style={{
                  width: '100%', background: '#ffffff',
                  border: `1px solid ${tokenFocus ? '#ff0000' : '#cccccc'}`,
                  borderRadius: '4px', padding: '9px 12px', color: '#111',
                  fontSize: '13px', outline: 'none', boxSizing: 'border-box',
                }}
                onFocus={() => setTokenFocus(true)}
                onBlur={() => setTokenFocus(false)}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{
                fontSize: '12.5px', fontWeight: '700', color: '#444',
                display: 'block', marginBottom: '6px',
              }}>
                New Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter New Password"
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

            {error && (
              <div style={{
                background: 'rgba(255,0,0,0.05)',
                border: '1px solid rgba(255,0,0,0.2)',
                borderRadius: '4px', padding: '8px 10px', fontSize: '11.5px',
                color: '#ff0000', fontWeight: '600', marginBottom: '12px',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '11px', borderRadius: '4px', border: 'none',
                background: '#ff0000', color: '#ffffff', fontSize: '14px', fontWeight: '700',
                cursor: 'pointer', opacity: loading ? 0.8 : 1, transition: 'background 0.2s',
              }}
            >
              {loading ? 'Updating Password…' : 'Reset Password'}
            </button>

            <div style={{ textAlign: 'center', marginTop: '16px' }}>
              <button
                type="button"
                onClick={() => { window.location.href = '/'; }}
                style={{
                  background: 'none', border: 'none', color: '#ff0000',
                  fontSize: '12.5px', fontWeight: '700', cursor: 'pointer', textDecoration: 'underline',
                }}
              >
                Back to Login
              </button>
            </div>
          </form>
        )}
      </div>

      <style>{`
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
      `}</style>
    </div>
  );
}
