import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, Shield, LayoutDashboard, Users, Cloud, LogOut, ChevronLeft, Menu, X,
  Fuel, UserCircle, TrendingUp, Briefcase, MapPin, ChevronRight, Mail, ScanFace,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import useViewport from '../../hooks/useViewport';
import AdminDashboard from './AdminDashboard';
import AdminUserManagement from './AdminUserManagement';
import DestinationManager from './DestinationManager';
import FuelStationManager from './FuelStationManager';
import FirmManager from './FirmManager';
import ProfitLossSheet from './ProfitLossSheet';
import SystemSettings from './SystemSettings';
import AdminModule from '../../modules/AdminModule';
import PartyMaster from '../../modules/PartyMaster';
import StaffProfileModule from '../../modules/StaffProfileModule';
import TerminalBiometricsManager from './TerminalBiometricsManager';
import './admin.css';

const STORAGE_KEY = 'vgtc-admin-active';
const COLLAPSE_KEY = 'vgtc-admin-collapsed';

const NAV_GROUPS = [
  {
    id: 'insight',
    label: 'Insight',
    items: [
      { id: 'dashboard', label: 'Overview', Icon: LayoutDashboard },
      { id: 'pl_sheet', label: 'Profit & Loss', Icon: TrendingUp },
    ],
  },
  {
    id: 'people',
    label: 'People & access',
    items: [
      { id: 'users', label: 'User Management', Icon: Users },
      { id: 'profiles', label: 'Staff Profiles', Icon: UserCircle },
      { id: 'biometrics', label: 'Terminal & Attendance', Icon: ScanFace },
    ],
  },
  {
    id: 'masters',
    label: 'Master data',
    items: [
      { id: 'parties', label: 'Party Master', Icon: Building2 },
      { id: 'destinations', label: 'Destination Rates', Icon: MapPin },
      { id: 'firms', label: 'Firms & Vendors', Icon: Briefcase },
      { id: 'fuel', label: 'Fuel Stations', Icon: Fuel },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      // The mail server the panel's own OTP flow depends on used to be
      // reachable only from the in-app Settings tab.
      { id: 'settings', label: 'Email & Organisation', Icon: Mail },
      { id: 'backup', label: 'System & Backup', Icon: Cloud },
    ],
  },
];

const NAV_ITEMS = NAV_GROUPS.flatMap(g => g.items);

/** The standalone admin shell follows the saved light, dark, or sepia theme. */
export default function AdminLayout() {
  const { user, logout } = useAuth();
  const { mode } = useViewport();
  const isMobile = mode === 'mobile';

  const [active, setActive] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return NAV_ITEMS.some(n => n.id === saved) ? saved : 'dashboard';
  });
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const isAdmin = user?.role === 'admin';

  useLayoutEffect(() => {
    const syncTheme = () => {
      const saved = localStorage.getItem('vgtc-theme');
      document.documentElement.setAttribute('data-theme', ['light', 'dark', 'sepia'].includes(saved) ? saved : 'light');
    };
    syncTheme();
    window.addEventListener('storage', syncTheme);
    return () => window.removeEventListener('storage', syncTheme);
  }, []);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, active); }, [active]);
  useEffect(() => { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); }, [collapsed]);

  useEffect(() => {
    if (!isAdmin) window.location.href = '/admin/login';
  }, [isAdmin]);

  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setMobileNavOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileNavOpen]);

  const currentGroup = useMemo(
    () => NAV_GROUPS.find(g => g.items.some(i => i.id === active)),
    [active]
  );
  const currentItem = NAV_ITEMS.find(n => n.id === active);

  if (!isAdmin) return null;

  const railWidth = collapsed && !isMobile ? 78 : 264;
  const showSidebar = !isMobile || mobileNavOpen;

  const go = (id) => { setActive(id); setMobileNavOpen(false); };

  return (
    <div
      className="adm"
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        background: 'var(--bg)',
        color: 'var(--text)',
        fontFamily: '"Segoe UI", system-ui, sans-serif',
      }}
    >
      {/* Native options need their own surface colors in some browsers. */}
      <style>{`
        .adm select option { background: var(--bg-card); color: var(--text); }
        .adm ::-webkit-scrollbar { width: 10px; height: 10px; }
        .adm ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 6px; border: 3px solid transparent; background-clip: content-box; }
        .adm ::-webkit-scrollbar-thumb:hover { background: var(--text-muted); background-clip: content-box; }
        .adm ::-webkit-scrollbar-track { background: transparent; }
      `}</style>

      <AnimatePresence>
        {isMobile && mobileNavOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setMobileNavOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 60 }}
          />
        )}
      </AnimatePresence>

      {/* ── Sidebar ── */}
      <aside
        style={{
          width: railWidth,
          flexShrink: 0,
          background: 'var(--sidebar-bg)',
          borderRight: '1px solid var(--border)',
          display: showSidebar ? 'flex' : 'none',
          flexDirection: 'column',
          transition: 'width 0.24s cubic-bezier(0.4, 0, 0.2, 1)',
          position: isMobile ? 'fixed' : 'relative',
          inset: isMobile ? '0 auto 0 0' : undefined,
          zIndex: 70,
        }}
      >
        <div style={{ padding: collapsed && !isMobile ? '20px 0' : '20px', display: 'flex', alignItems: 'center', justifyContent: collapsed && !isMobile ? 'center' : 'space-between', gap: 12, borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <span style={{
              width: 38, height: 38, borderRadius: 11, flexShrink: 0,
              background: 'var(--adm-violet-wash)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Shield size={19} color="var(--adm-violet)" />
            </span>
            {!(collapsed && !isMobile) && (
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em' }}>System Admin</span>
                <span style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>Control panel</span>
              </span>
            )}
          </div>
          {isMobile && (
            <button type="button" className="adm-btn adm-btn--ghost adm-btn--icon adm-btn--sm" onClick={() => setMobileNavOpen(false)} aria-label="Close menu">
              <X size={17} />
            </button>
          )}
        </div>

        <nav style={{ flex: 1, padding: '14px 10px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {NAV_GROUPS.map(group => (
            <div key={group.id} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {!(collapsed && !isMobile) && (
                <span style={{ padding: '0 10px 4px', fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  {group.label}
                </span>
              )}
              {group.items.map(({ id, label, Icon }) => {
                const on = active === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => go(id)}
                    aria-current={on ? 'page' : undefined}
                    title={collapsed && !isMobile ? label : undefined}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: collapsed && !isMobile ? '11px 0' : '10px 12px',
                      justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
                      borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: on ? 'var(--adm-violet-wash)' : 'transparent',
                      color: on ? 'var(--text)' : 'var(--text-sub)',
                      boxShadow: on ? 'inset 3px 0 0 var(--adm-violet)' : 'none',
                      font: 'inherit', fontSize: 13.5, fontWeight: on ? 800 : 600,
                      transition: 'background 0.15s, color 0.15s',
                      width: '100%', textAlign: 'left',
                    }}
                  >
                    <Icon size={17} color={on ? 'var(--adm-violet)' : 'var(--text-muted)'} style={{ flexShrink: 0 }} />
                    {!(collapsed && !isMobile) && <span style={{ flex: 1 }}>{label}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div style={{ padding: 10, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!(collapsed && !isMobile) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: 'var(--bg-th)' }}>
              <span className="adm-avatar" style={{ width: 32, height: 32, fontSize: 12, background: 'var(--adm-violet-wash)', color: 'var(--adm-violet)' }}>
                {(user.name || 'A').charAt(0).toUpperCase()}
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</span>
                <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-muted)' }}>Administrator</span>
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={() => { logout(); window.location.href = '/admin/login'; }}
            style={{
              display: 'flex', alignItems: 'center', gap: 11,
              justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
              padding: collapsed && !isMobile ? '11px 0' : '10px 12px',
              borderRadius: 10, border: 'none', cursor: 'pointer',
              background: 'var(--bg-th)', color: 'var(--text-sub)',
              font: 'inherit', fontSize: 13, fontWeight: 700, width: '100%',
            }}
          >
            <LogOut size={17} />
            {!(collapsed && !isMobile) && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <header
          style={{
            height: 64, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 16, padding: '0 20px', background: 'var(--bg-card)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            {isMobile ? (
              <button type="button" className="adm-btn adm-btn--ghost adm-btn--icon adm-btn--sm" onClick={() => setMobileNavOpen(true)} aria-label="Open menu">
                <Menu size={19} />
              </button>
            ) : (
              <button
                type="button"
                className="adm-btn adm-btn--ghost adm-btn--icon adm-btn--sm"
                onClick={() => setCollapsed(c => !c)}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
              </button>
            )}
            <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{currentGroup?.label}</span>
              <ChevronRight size={13} color="var(--text-muted)" />
              <h1 style={{ margin: 0, fontSize: 16, fontWeight: 800, letterSpacing: '-0.015em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {currentItem?.label}
              </h1>
            </nav>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <a
              href="/status"
              target="_blank"
              rel="noopener noreferrer"
              className="adm-chip"
              style={{
                textDecoration: 'none',
                background: 'var(--adm-mint-wash)',
                border: '1px solid var(--border)',
                color: 'var(--adm-mint)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer'
              }}
              title="Open System Observability & Telemetry Status"
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--adm-mint)' }} />
              Observability ↗
            </a>
            <span className="adm-chip adm-chip--success" title="The API responded on the last request">
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--adm-mint)' }} />
              Online
            </span>
            {!isMobile && (
              <span className="adm-avatar" style={{ width: 34, height: 34, fontSize: 13, background: 'var(--adm-violet-wash)', color: 'var(--adm-violet)' }}>
                {(user?.name || 'A').charAt(0).toUpperCase()}
              </span>
            )}
          </div>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '18px 14px 40px' : '26px 24px 48px' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              {active === 'dashboard' && <AdminDashboard />}
              {active === 'pl_sheet' && <ProfitLossSheet />}
              {active === 'users' && <AdminUserManagement />}
              {active === 'profiles' && <StaffProfileModule role="admin" />}
              {active === 'biometrics' && <TerminalBiometricsManager />}
              {active === 'parties' && <PartyMaster />}
              {active === 'destinations' && <DestinationManager />}
              {active === 'firms' && <FirmManager />}
              {active === 'fuel' && <FuelStationManager />}
              {active === 'settings' && <SystemSettings />}
              {active === 'backup' && <AdminModule />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
