import React, { useLayoutEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import LoginPage from './LoginPage';
import StatusPage from './StatusPage';

export default function StatusRoute() {
  const { user, ready } = useAuth();
  useLayoutEffect(() => {
    const syncTheme = () => {
      const saved = localStorage.getItem('vgtc-theme');
      document.documentElement.setAttribute('data-theme', ['light', 'dark', 'sepia'].includes(saved) ? saved : 'light');
    };
    syncTheme();
    window.addEventListener('storage', syncTheme);
    return () => window.removeEventListener('storage', syncTheme);
  }, []);
  if (!ready) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text)' }}>Loading status…</div>;
  if (!user) return <LoginPage />;
  return <StatusPage />;
}
