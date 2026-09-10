import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, Shield, LayoutDashboard, Users, Cloud, LogOut, ChevronLeft, Menu, X,
  Fuel, UserCircle, TrendingUp, Briefcase, MapPin, ChevronRight, Mail,
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

/** The dark palette this shell runs in, written as the variables index.css uses. */
const ADMIN_THEME = {
  '--bg': '#0f172a',
  '--bg-card': '#1e293b',
  '--bg-card-muted': 'rgba(15, 23, 42, 0.6)',
  '--bg-input': '#0f172a',
  '--bg-inset': '#111c31',
  '--bg-th': '#172033',
  '--bg-tf': '#172033',
  '--bg-filter': '#1e293b',
  '--bg-hover': 'rgba(148, 163, 184, 0.10)',
  '--bg-active': 'rgba(99, 102, 241, 0.16)',
  '--bg-row-even': 'rgba(30, 41, 59, 0.3)',
  '--bg-row-odd': 'rgba(15, 23, 42, 0.3)',
  '--bg-row-hover': 'rgba(148, 163, 184, 0.12)',
  '--topbar-bg': '#1e293b',
  '--sidebar-bg': '#0b1220',
  '--border': 'rgba(148, 163, 184, 0.20)',
  '--border-row': 'rgba(148, 163, 184, 0.11)',
  '--text': '#f1f5f9',
  '--text-sub': '#cbd5e1',
  '--text-muted': '#94a3b8',
  '--primary': '#818cf8',
  '--primary-2': '#a5b4fc',
  '--primary-hover': '#6366f1',
  '--primary-glow': 'rgba(129, 140, 248, 0.22)',
  '--danger': '#fb7185',
  '--danger-glow': 'rgba(251, 113, 133, 0.2)',
  '--accent': '#34d399',
  '--warn': '#fbbf24',
  '--skeleton-hi': 'rgba(255, 255, 255, 0.06)',
  '--shadow': '0 1px 3px rgba(0, 0, 0, 0.35)',
  '--shadow-md': '0 6px 18px rgba(0, 0, 0, 0.45)',
};

/**
 * The admin shell at /admin/*.
 *
 * Two things changed here beyond the styling. The role guard used to assign
 * `window.location.href` in the middle of render, which React treats as a side
 * effect in a pure function and which fired again on every re-render before the
 * navigation landed; it is an effect now. And the scope below used to force
 * every bare `input`, `select` and `.btn-*` dark with `!important`, so any
 * component wanting its own surface — a switch, a chip, a coloured button —
 * lost. Setting the theme variables does the same job and lets components style
 * themselves.
 */
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
        ...ADMIN_THEME,
        display: 'flex',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        background: 'var(--bg)',
        color: 'var(--text)',
        fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
      }}
    >
      {/* Options do not inherit CSS variables in every browser, so this one rule stays. */}
      <style>{`
        .adm select option { background: #1e293b; color: #f1f5f9; }
        .adm ::-webkit-scrollbar { width: 10px; height: 10px; }
        .adm ::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.28); border-radius: 6px; border: 3px solid transparent; background-clip: content-box; }
        .adm ::-webkit-scrollbar-thumb:hover { background: rgba(148,163,184,0.45); background-clip: content-box; }
        .adm ::-webkit-scrollbar-track { background: transparent; }
      `}</style>

      <AnimatePresence>
        {isMobile && mobileNavOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setMobileNavOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.6)', zIndex: 60 }}
          />
        )}
      </AnimatePresence>

      {/* ── Sidebar ── */}
      <aside
        style={{
          width: railWidth,
          flexShrink: 0,
          background: '#0b1220',
          borderRight: '1px solid rgba(148,163,184,0.14)',
          display: showSidebar ? 'flex' : 'none',
          flexDirection: 'column',
          transition: 'width 0.24s cubic-bezier(0.4, 0, 0.2, 1)',
          position: isMobile ? 'fixed' : 'relative',
          inset: isMobile ? '0 auto 0 0' : undefined,
          zIndex: 70,
        }}
      >
        <div style={{ padding: collapsed && !isMobile ? '20px 0' : '20px', display: 'flex', alignItems: 'center', justifyContent: collapsed && !isMobile ? 'center' : 'space-between', gap: 12, borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <span style={{
              width: 38, height: 38, borderRadius: 11, flexShrink: 0,
              background: 'linear-gradient(135deg, #818cf8, #6366f1)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(99,102,241,0.45)',
            }}>
              <Shield size={19} color="#fff" />
            </span>
            {!(collapsed && !isMobile) && (
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em' }}>System Admin</span>
                <span style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.09em' }}>Control panel</span>
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
                <span style={{ padding: '0 10px 4px', fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b' }}>
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
                      background: on ? 'rgba(129,140,248,0.16)' : 'transparent',
                      color: on ? '#c7d2fe' : '#94a3b8',
                      boxShadow: on ? 'inset 3px 0 0 #818cf8' : 'none',
                      font: 'inherit', fontSize: 13.5, fontWeight: on ? 800 : 600,
                      transition: 'background 0.15s, color 0.15s',
                      width: '100%', textAlign: 'left',
                    }}
                  >
                    <Icon size={17} color={on ? '#a5b4fc' : '#64748b'} style={{ flexShrink: 0 }} />
                    {!(collapsed && !isMobile) && <span style={{ flex: 1 }}>{label}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div style={{ padding: 10, borderTop: '1px solid rgba(148,163,184,0.12)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!(collapsed && !isMobile) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: 'rgba(148,163,184,0.07)' }}>
              <span className="adm-avatar" style={{ width: 32, height: 32, fontSize: 12, background: 'rgba(129,140,248,0.2)', color: '#c7d2fe' }}>
                {(user.name || 'A').charAt(0).toUpperCase()}
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</span>
                <span style={{ display: 'block', fontSize: 10.5, color: '#64748b' }}>Administrator</span>
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
              background: 'rgba(251,113,133,0.1)', color: '#fb7185',
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
            gap: 16, padding: '0 20px', background: 'rgba(15,23,42,0.9)', backdropFilter: 'blur(10px)',
            borderBottom: '1px solid rgba(148,163,184,0.14)',
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
              <span style={{ fontSize: 12.5, color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>{currentGroup?.label}</span>
              <ChevronRight size={13} color="#475569" />
              <h1 style={{ margin: 0, fontSize: 16, fontWeight: 800, letterSpacing: '-0.015em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {currentItem?.label}
              </h1>
            </nav>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <span className="adm-chip adm-chip--success" title="The API responded on the last request">
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 8px #34d399' }} />
              Online
            </span>
            {!isMobile && (
              <span className="adm-avatar" style={{ width: 34, height: 34, fontSize: 13, background: 'rgba(129,140,248,0.2)', color: '#c7d2fe' }}>
                {(user.name || 'A').charAt(0).toUpperCase()}
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
