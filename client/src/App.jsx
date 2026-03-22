import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutDashboard, Receipt, FileText, BarChart3, BookOpen, Package, ChevronRight, Sun, Moon, Coffee, Shield, LogOut } from 'lucide-react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import LoginPage from './pages/LoginPage';
import AdminPage from './pages/AdminPage';
import LRModule from './modules/LRModule';
import VoucherModule from './modules/VoucherModule';
import BalanceSheet from './modules/BalanceSheet';
import CashbookModule from './modules/CashbookModule';
import StockModule from './modules/StockModule';
import VehicleModule from './modules/VehicleModule';
import DieselModule from './modules/DieselModule';
import PublicLoadingStatus from './modules/PublicLoadingStatus';
import AdminLoadingStatus from './modules/AdminLoadingStatus';
import SellModule from './modules/SellModule';
import CCTVModule from './modules/CCTVModule';
import { Truck, Fuel, ShoppingCart, Camera } from 'lucide-react';

const THEMES = [
  { id: 'dark', label: 'Dark', Icon: Moon },
  { id: 'light', label: 'Light', Icon: Sun },
  { id: 'sepia', label: 'Sepia', Icon: Coffee },
];

function AppInner() {
  const { user, logout, ready, plant } = useAuth();
  // Default to first module of the selected plant
  // Persistence for navigation
  const [active, setActive] = useState(() => localStorage.getItem('vgtc-active') || (plant === 'jklakshmi' ? 'lr_jkl' : 'lr_dump'));
  const [subActive, setSubActive] = useState(() => localStorage.getItem('vgtc-subactive') || '');
  const [expanded, setExpanded] = useState(() => {
    try {
      const saved = localStorage.getItem('vgtc-expanded');
      return saved ? JSON.parse(saved) : { [localStorage.getItem('vgtc-active')]: true };
    } catch { return {}; }
  });
  const [col, setCol] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('vgtc-theme') || 'sepia');

  const [isWakingUp, setIsWakingUp] = useState(false);

  useEffect(() => {
    const handleSlow = () => setIsWakingUp(true);
    const handleFast = () => setIsWakingUp(false);
    window.addEventListener('api-slow', handleSlow);
    window.addEventListener('api-fast', handleFast);
    return () => {
      window.removeEventListener('api-slow', handleSlow);
      window.removeEventListener('api-fast', handleFast);
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('vgtc-theme', theme);
  }, [theme]);

  // Persist navigation state
  useEffect(() => {
    localStorage.setItem('vgtc-active', active);
    localStorage.setItem('vgtc-subactive', subActive);
    localStorage.setItem('vgtc-expanded', JSON.stringify(expanded));
  }, [active, subActive, expanded]);

  const cycleTheme = () => {
    const idx = THEMES.findIndex(t => t.id === theme);
    setTheme(THEMES[(idx + 1) % THEMES.length].id);
  };

  // Build nav items based on role
  const NAV = [
    // ── JK Super ──
    { id: 'lr_dump', label: 'Loading Receipt', Icon: Receipt, color: '#6366f1', section: 'jksuper', permKey: 'lr' },
    {
      id: 'voucher_dump', label: 'Voucher', Icon: FileText, color: '#6366f1', section: 'jksuper', permKey: 'voucher', sub: [
        { id: 'Dump', label: 'Dump Voucher' },
        { id: 'JK_Super', label: 'JK Super Voucher' },
      ]
    },
    {
      id: 'balance_dump', label: 'Balance Sheet', Icon: BarChart3, color: '#6366f1', section: 'jksuper', permKey: 'balance', sub: [
        { id: 'Dump', label: 'Dump Sheet' },
        { id: 'JK_Super', label: 'JK Super Sheet' },
      ]
    },
    {
      id: 'stock_dump', label: 'Dump Stock', Icon: Package, color: '#6366f1', section: 'jksuper', permKey: 'stock', sub: [
        { id: 'overview', label: 'Overview' },
        { id: 'add', label: 'Add Stock' },
        { id: 'challan', label: 'Create Challan' },
        { id: 'history', label: 'History' },
      ]
    },
    {
      id: 'cashbook_dump', label: 'Cashbook', Icon: BookOpen, color: '#10b981', section: 'jksuper', permKey: 'cashbook', sub: [
        { id: 'ledger', label: 'Full Ledger' },
        { id: 'deposits', label: 'Deposits' },
        { id: 'voucher_cash', label: 'Voucher Cash Adv' },
        { id: 'online', label: 'Online Advances' },
        { id: 'cash_out', label: 'Cash Outs' },
      ]
    },
    { id: 'vehicles_dump', label: 'Vehicle Details', Icon: Truck, color: '#14b8a6', section: 'jksuper', permKey: 'vehicle' },
    { id: 'diesel_dump', label: 'Diesel Control', Icon: Fuel, color: '#3b82f6', section: 'jksuper', permKey: 'diesel' },
    { id: 'sell_dump', label: 'Sell Register', Icon: ShoppingCart, color: '#ec4899', section: 'jksuper', permKey: 'sell' },
    { id: 'cctv_dump', label: 'CCTV Live', Icon: Camera, color: '#a855f7', section: 'jksuper', permKey: 'cctv' },

    // ── JK Lakshmi ──
    { id: 'lr_jkl', label: 'Loading Receipt', Icon: Receipt, color: '#f59e0b', section: 'jklakshmi', permKey: 'lr' },
    {
      id: 'voucher_jkl', label: 'Voucher', Icon: FileText, color: '#f59e0b', section: 'jklakshmi', permKey: 'voucher', sub: [
        { id: 'Dump', label: 'Dump Voucher' },
        { id: 'JK_Lakshmi', label: 'JK Lakshmi Voucher' },
      ]
    },
    {
      id: 'balance_jkl', label: 'Balance Sheet', Icon: BarChart3, color: '#f59e0b', section: 'jklakshmi', permKey: 'balance', sub: [
        { id: 'Dump', label: 'Dump Sheet' },
        { id: 'JK_Lakshmi', label: 'JK Lakshmi Sheet' },
      ]
    },
    {
      id: 'stock_jkl', label: 'JK Lakshmi Stock', Icon: Package, color: '#f59e0b', section: 'jklakshmi', permKey: 'stock', sub: [
        { id: 'overview', label: 'Overview' },
        { id: 'add', label: 'Add Stock' },
        { id: 'challan', label: 'Create Challan' },
        { id: 'history', label: 'History' },
      ]
    },
    {
      id: 'cashbook_jkl', label: 'Cashbook', Icon: BookOpen, color: '#10b981', section: 'jklakshmi', permKey: 'cashbook', sub: [
        { id: 'ledger', label: 'Full Ledger' },
        { id: 'deposits', label: 'Deposits' },
        { id: 'voucher_cash', label: 'Voucher Cash Adv' },
        { id: 'online', label: 'Online Advances' },
        { id: 'cash_out', label: 'Cash Outs' },
      ]
    },
    { id: 'vehicles_jkl', label: 'Vehicle Details', Icon: Truck, color: '#14b8a6', section: 'jklakshmi', permKey: 'vehicle' },
    { id: 'diesel_jkl', label: 'Diesel Control', Icon: Fuel, color: '#3b82f6', section: 'jklakshmi', permKey: 'diesel' },
    { id: 'sell_jkl', label: 'Sell Register', Icon: ShoppingCart, color: '#ec4899', section: 'jklakshmi', permKey: 'sell' },
    { id: 'cctv_jkl', label: 'CCTV Live', Icon: Camera, color: '#a855f7', section: 'jklakshmi', permKey: 'cctv' },

    ...(user?.role === 'admin' ? [
      { id: 'admin', label: 'Admin', Icon: Shield, color: '#a855f7', section: plant || 'jksuper' },
      { id: 'admin_loading_status', label: 'Loading Status (Live)', Icon: Truck, color: '#ef4444', section: plant || 'jksuper' }
    ] : []),
  ];

  // Filter by plant AND permissions
  const FILTERED_NAV = NAV.filter(n => {
    // Basic plant filter
    if (n.section !== (plant || 'jksuper')) return false;

    // Admin panel always visible for admins
    if (n.id === 'admin') return true;

    // Admins see everything else too
    if (user?.role === 'admin') return true;

    // If permissions object is missing (transition period), allow view
    if (!user?.permissions || Object.keys(user.permissions).length === 0) return true;

    // Others must have at least 'view' permission
    const perm = user.permissions[n.permKey];
    return perm === 'view' || perm === 'edit';
  });


  // Redirect away from admin if not admin
  React.useEffect(() => {
    if (active === 'admin' && user?.role !== 'admin') setActive('lr_dump');
  }, [user]);

  const isPublicLoading = window.location.pathname === '/loading-status';
  if (isPublicLoading) return <PublicLoadingStatus />;

  if (!ready) return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)',
      color: 'var(--text-muted)'
    }}>
      <div style={{ width: '24px', height: '24px', border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '16px' }} />
      <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.05em', color: isWakingUp ? '#f59e0b' : 'var(--text)' }}>
        {isWakingUp ? 'Waking up database server... (this can take ~50 seconds)' : 'AUTHENTICATING...'}
      </div>
      {isWakingUp && <div style={{ fontSize: '11px', marginTop: '8px', opacity: 0.7 }}>Render free tiers spin down after 15 minutes of inactivity. Please wait.</div>}
    </div>
  );

  if (!user) return <LoginPage />;

  const currentTheme = THEMES.find(t => t.id === theme) || THEMES[0];
  const ThemeIcon = currentTheme.Icon;

  return (
    <div className="app-shell">
      <aside className={`sidebar${col ? ' collapsed' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-icon"><LayoutDashboard size={22} color="white" /></div>
          {!col && <div className="brand-text">
            <div className="brand-name">Vikas Goods</div>
            <div className="brand-sub">Transport System</div>
          </div>}
        </div>
        <nav className="sidebar-nav">
          {/* Plant label header */}
          {!col && (
            <div style={{ padding: '8px 14px 6px', fontSize: '9px', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: plant === 'jklakshmi' ? '#f59e0b' : '#6366f1', opacity: 0.85, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: plant === 'jklakshmi' ? '#f59e0b' : '#6366f1', display: 'inline-block' }} />
              {plant === 'jklakshmi' ? 'J.K Lakshmi' : 'JK Super'}
            </div>
          )}
          {FILTERED_NAV.map(({ id, label, Icon, color, sub }) => (
            <div key={id}>
              <button className={`nav-btn${active === id ? ' active' : ''}`}
                onClick={() => {
                  if (col) setCol(false);
                  if (sub) {
                    setExpanded(e => ({ ...e, [id]: !e[id] }));
                    if (active !== id) {
                      setActive(id);
                      setSubActive(sub[0].id);
                    }
                  } else {
                    setActive(id);
                    setSubActive('');
                  }
                }} title={col ? label : undefined}>
                <span className="nav-indicator" style={{ background: color }} />
                <Icon size={20} color={active === id ? color : 'currentColor'} />
                {!col && <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>}
                {!col && sub && (
                  <ChevronRight size={14} style={{ transition: 'transform 0.2s', transform: expanded[id] ? 'rotate(90deg)' : 'none', opacity: 0.5 }} />
                )}
              </button>
              <AnimatePresence>
                {!col && sub && expanded[id] && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    style={{ overflow: 'hidden', paddingLeft: '32px', display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px', marginBottom: '8px' }}
                  >
                    {sub.map(s => (
                      <button key={s.id}
                        onClick={() => { setActive(id); setSubActive(s.id); }}
                        style={{
                          background: 'transparent', border: 'none', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', fontSize: '12px', fontWeight: 600, transition: 'all 0.15s',
                          color: active === id && subActive === s.id ? color : 'var(--text-muted)',
                          backgroundColor: active === id && subActive === s.id ? `${color}15` : 'transparent'
                        }}
                      >
                        <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'currentColor', marginRight: '8px', opacity: active === id && subActive === s.id ? 1 : 0.4 }} />
                        {s.label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </nav>
        {/* User info + logout at bottom of sidebar */}
        <div style={{ marginTop: 'auto', padding: col ? '12px 8px' : '12px 14px', borderTop: '1px solid var(--border)' }}>
          {!col && (
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: '1px' }}>{user.role}</div>
            </div>
          )}
          <button onClick={logout}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 10px',
              borderRadius: '10px', border: '1px solid var(--border)', background: 'none',
              color: 'var(--text-muted)', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
              transition: 'all 0.18s', justifyContent: col ? 'center' : 'flex-start',
              fontFamily: 'inherit'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(244,63,94,0.08)'; e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.borderColor = 'rgba(244,63,94,0.3)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; }}>
            <LogOut size={15} />
            {!col && 'Logout'}
          </button>
        </div>
        <div className="sidebar-footer" style={{ borderTop: 'none' }}>
          <button className="collapse-btn" onClick={() => setCol(c => !c)}>
            <span className={`chevron${!col ? ' flipped' : ''}`}><ChevronRight size={18} /></span>
          </button>
        </div>
      </aside>

      <div className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <div className="app-title">{FILTERED_NAV.find(n => n.id === active)?.label}</div>
          </div>
          <div className="topbar-right">
            <button className="notif-btn theme-toggle-btn" onClick={cycleTheme}
              title={`Theme: ${currentTheme.label} (click to switch)`}>
              <ThemeIcon size={17} />
              <span style={{ fontSize: '11px', fontWeight: 700, marginLeft: '5px' }}>
                {currentTheme.label}
              </span>
            </button>
            <div className="sep-v" />
            <div className="user-chip">
              <div className="user-info">
                <div className="user-name">{user.name}</div>
                <div className="user-role">{user.role}</div>
              </div>
              <div className="user-avatar" style={{ fontSize: '14px', fontWeight: 900, color: 'white' }}>
                {user.name.charAt(0).toUpperCase()}
              </div>
            </div>
          </div>
        </header>
        <div className="page-area">
          <AnimatePresence mode="wait">
            <motion.div key={active + subActive} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="page-content">
              {active === 'lr_dump' && <LRModule role={user.role} permissions={user.permissions} brand="dump" />}
              {active === 'lr_jkl' && <LRModule role={user.role} permissions={user.permissions} brand="jkl" />}
              {active === 'voucher_dump' && <VoucherModule role={user.role} permissions={user.permissions} lockedType={subActive || 'Dump'} />}
              {active === 'voucher_jkl' && <VoucherModule role={user.role} permissions={user.permissions} lockedType={subActive || 'Dump'} />}
              {active === 'balance_dump' && <BalanceSheet role={user.role} permissions={user.permissions} lockedType={subActive || 'Dump'} />}
              {active === 'balance_jkl' && <BalanceSheet role={user.role} permissions={user.permissions} lockedType={subActive || 'Dump'} />}
              {active === 'cashbook_dump' && <CashbookModule role={user.role} permissions={user.permissions} initialTab={subActive || 'ledger'} moduleType="dump" />}
              {active === 'cashbook_jkl' && <CashbookModule role={user.role} permissions={user.permissions} initialTab={subActive || 'ledger'} moduleType="jkl" />}
              {active === 'stock_dump' && <StockModule role={user.role} permissions={user.permissions} initialTab={subActive || 'overview'} brand="dump" />}
              {active === 'stock_jkl' && <StockModule role={user.role} permissions={user.permissions} initialTab={subActive || 'overview'} brand="jkl" />}
              {(active === 'vehicles_dump' || active === 'vehicles_jkl') && <VehicleModule permissions={user.permissions} />}
              {(active === 'diesel_dump' || active === 'diesel_jkl') && <DieselModule permissions={user.permissions} />}
              {(active === 'sell_dump' || active === 'sell_jkl') && <SellModule brand={active.includes('jkl') ? 'jkl' : 'dump'} role={user.role} permissions={user.permissions} />}
              {active === 'admin' && (user?.role === 'admin') && <AdminPage />}
              {active === 'admin_loading_status' && (user?.role === 'admin') && <AdminLoadingStatus />}
              {(active === 'cctv_dump' || active === 'cctv_jkl') && <CCTVModule />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Global Waking Up indicator for inside the app */}
      <AnimatePresence>
        {isWakingUp && ready && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            style={{ position: 'fixed', bottom: '24px', left: '50%', background: '#f59e0b', color: '#000', padding: '12px 24px', borderRadius: '30px', fontSize: '13px', fontWeight: 800, zIndex: 9999, display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 10px 25px rgba(245,158,11,0.4)', pointerEvents: 'none' }}
          >
            <div style={{ width: '16px', height: '16px', border: '3px solid rgba(0,0,0,0.2)', borderTopColor: '#000', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            Waking up remote server... (up to 50s)
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}