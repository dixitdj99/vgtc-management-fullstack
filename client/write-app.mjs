import { writeFileSync } from 'fs';

const code = `import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutDashboard, Receipt, FileText, BarChart3, ChevronRight, Sun, Moon, Coffee, Shield, LogOut } from 'lucide-react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import LoginPage from './pages/LoginPage';
import AdminPage from './pages/AdminPage';
import LRModule from './modules/LRModule';
import VoucherModule from './modules/VoucherModule';
import BalanceSheet from './modules/BalanceSheet';

const THEMES = [
  { id: 'dark',  label: 'Dark',  Icon: Moon   },
  { id: 'light', label: 'Light', Icon: Sun    },
  { id: 'sepia', label: 'Sepia', Icon: Coffee },
];

function AppInner() {
  const { user, logout, ready } = useAuth();
  const [active, setActive]   = useState('lr');
  const [col,    setCol]      = useState(false);
  const [theme,  setTheme]    = useState(() => localStorage.getItem('vgtc-theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('vgtc-theme', theme);
  }, [theme]);

  const cycleTheme = () => {
    const idx = THEMES.findIndex(t => t.id === theme);
    setTheme(THEMES[(idx + 1) % THEMES.length].id);
  };

  // Build nav items based on role
  const NAV = [
    { id: 'lr',      label: 'Loading Receipt', Icon: Receipt,   color: '#6366f1' },
    { id: 'voucher', label: 'Voucher',          Icon: FileText,  color: '#10b981' },
    { id: 'balance', label: 'Balance Sheet',    Icon: BarChart3, color: '#f59e0b' },
    ...(user?.role === 'admin' ? [{ id: 'admin', label: 'Admin', Icon: Shield, color: '#a855f7' }] : []),
  ];

  // Redirect away from admin if not admin
  React.useEffect(() => {
    if (active === 'admin' && user?.role !== 'admin') setActive('lr');
  }, [user]);

  if (!ready) return (
    <div style={{ height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg)',
      color:'var(--text-muted)',fontSize:'12px',fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase' }}>
      Loading…
    </div>
  );

  if (!user) return <LoginPage />;

  const currentTheme = THEMES.find(t => t.id === theme) || THEMES[0];
  const ThemeIcon = currentTheme.Icon;

  return (
    <div className="app-shell">
      <aside className={\`sidebar\${col ? ' collapsed' : ''}\`}>
        <div className="sidebar-brand">
          <div className="brand-icon"><LayoutDashboard size={22} color="white" /></div>
          {!col && <div className="brand-text">
            <div className="brand-name">Vikas Goods</div>
            <div className="brand-sub">Transport System</div>
          </div>}
        </div>
        <nav className="sidebar-nav">
          {NAV.map(({ id, label, Icon, color }) => (
            <button key={id} className={\`nav-btn\${active === id ? ' active' : ''}\`}
              onClick={() => setActive(id)} title={col ? label : undefined}>
              <span className="nav-indicator" />
              <Icon size={20} color={active === id ? color : 'currentColor'} />
              {!col && label}
            </button>
          ))}
        </nav>
        {/* User info + logout at bottom of sidebar */}
        <div style={{ marginTop:'auto', padding: col ? '12px 8px' : '12px 14px', borderTop:'1px solid var(--border)' }}>
          {!col && (
            <div style={{ marginBottom:'10px' }}>
              <div style={{ fontSize:'12px',fontWeight:800,color:'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{user.name}</div>
              <div style={{ fontSize:'10px',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.07em',marginTop:'1px' }}>{user.role}</div>
            </div>
          )}
          <button onClick={logout}
            style={{ width:'100%',display:'flex',alignItems:'center',gap:'8px',padding:'9px 10px',
              borderRadius:'10px',border:'1px solid var(--border)',background:'none',
              color:'var(--text-muted)',fontSize:'12px',fontWeight:700,cursor:'pointer',
              transition:'all 0.18s',justifyContent: col ? 'center' : 'flex-start',
              fontFamily:'inherit' }}
            onMouseEnter={e=>{e.currentTarget.style.background='rgba(244,63,94,0.08)';e.currentTarget.style.color='var(--danger)';e.currentTarget.style.borderColor='rgba(244,63,94,0.3)';}}
            onMouseLeave={e=>{e.currentTarget.style.background='none';e.currentTarget.style.color='var(--text-muted)';e.currentTarget.style.borderColor='var(--border)';}}>
            <LogOut size={15}/>
            {!col && 'Logout'}
          </button>
        </div>
        <div className="sidebar-footer" style={{ borderTop:'none' }}>
          <button className="collapse-btn" onClick={() => setCol(c => !c)}>
            <span className={\`chevron\${!col ? ' flipped' : ''}\`}><ChevronRight size={18} /></span>
          </button>
        </div>
      </aside>

      <div className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <div className="app-title">{NAV.find(n => n.id === active)?.label}</div>
          </div>
          <div className="topbar-right">
            <button className="notif-btn theme-toggle-btn" onClick={cycleTheme}
              title={\`Theme: \${currentTheme.label} (click to switch)\`}>
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
              <div className="user-avatar" style={{ fontSize:'14px',fontWeight:900,color:'white' }}>
                {user.name.charAt(0).toUpperCase()}
              </div>
            </div>
          </div>
        </header>
        <div className="page-area">
          <AnimatePresence mode="wait">
            <motion.div key={active} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="page-content">
              {active === 'lr'      && <LRModule      role={user.role} />}
              {active === 'voucher' && <VoucherModule  role={user.role} />}
              {active === 'balance' && <BalanceSheet   role={user.role} />}
              {active === 'admin'   && user.role === 'admin' && <AdminPage />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}`;

writeFileSync('B:/VGTC Managemet/client/src/App.jsx', code, 'utf8');
console.log('App.jsx written:', code.length);
