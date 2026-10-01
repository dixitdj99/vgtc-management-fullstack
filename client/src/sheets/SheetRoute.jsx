import React from 'react';
import { useAuth } from '../auth/AuthContext';
import LoginPage from '../pages/LoginPage';
import SmartSheet from './SmartSheet';

export default function SheetRoute() {
  const { user, ready } = useAuth();
  const sheetId = decodeURIComponent(window.location.pathname.split('/')[2] || '');
  if (!ready) return <div className="sheet-route-state">Loading sheet…</div>;
  if (!user) return <LoginPage />;
  return <SmartSheet sheetId={sheetId} />;
}
