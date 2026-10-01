import React from 'react';
import { useAuth } from '../auth/AuthContext';
import LoginPage from './LoginPage';
import StatusPage from './StatusPage';

export default function StatusRoute() {
  const { user, ready } = useAuth();
  if (!ready) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#090d16', color: '#fff' }}>Loading status…</div>;
  if (!user) return <LoginPage />;
  return <StatusPage />;
}
