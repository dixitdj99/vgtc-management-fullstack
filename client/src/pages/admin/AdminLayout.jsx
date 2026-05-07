import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, LayoutDashboard, Users, Settings, Cloud, LogOut, ChevronRight, CheckCircle2, AlertTriangle, Menu, X } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import AdminDashboard from './AdminDashboard';
import AdminUserManagement from './AdminUserManagement';
import OrganizationSettings from '../../modules/OrganizationSettings';
import AdminModule from '../../modules/AdminModule';
import PartyMaster from '../../modules/PartyMaster';

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const [active, setActive] = useState(() => localStorage.getItem('vgtc-admin-active') || 'dashboard');
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [col, setCol] = useState(false);

  useEffect(() => {
    localStorage.setItem('vgtc-admin-active', active);
  }, [active]);

  if (!user || user.role !== 'admin') {
    window.location.href = '/admin/login';
    return null;
  }

  const NAV = [
    { id: 'dashboard', label: 'Overview', Icon: LayoutDashboard },
    { id: 'users', label: 'User Management', Icon: Users },
    { id: 'parties', label: 'Party Master', Icon: Building2 },
    { id: 'org', label: 'Organization Settings', Icon: Settings },
    { id: 'backup', label: 'System & Backup', Icon: Cloud },
  ];

  return (
    <div style={{
      display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden',
      background: '#0f172a', color: 'white', fontFamily: '"Plus Jakarta Sans", sans-serif'
    }}>
      {/* Mobile Overlay */}
      {showMobileMenu && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40 }} onClick={() => setShowMobileMenu(false)} />
      )}

      {/* Sidebar */}
      <aside style={{
        width: col ? '80px' : '260px', background: 'rgba(30, 41, 59, 0.7)',
        borderRight: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)',
        display: 'flex', flexDirection: 'column', transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'relative', zIndex: 50,
        ...(window.innerWidth <= 768 && !showMobileMenu ? { transform: 'translateX(-100%)', position: 'absolute' } : {})
      }}>
        {/* Brand */}
        <div style={{ padding: '24px 20px', display: 'flex', alignItems: 'center', gap: '14px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            boxShadow: '0 4px 15px rgba(139, 92, 246, 0.4)'
          }}>
            <Shield size={20} color="white" />
          </div>
          {!col && (
            <div style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
              <div style={{ fontSize: '16px', fontWeight: 900, letterSpacing: '-0.02em', color: 'white' }}>System Admin</div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Control Panel</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '20px 12px', display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
          {NAV.map(({ id, label, Icon }) => {
            const isActive = active === id;
            return (
              <button key={id} onClick={() => { setActive(id); setShowMobileMenu(false); }} style={{
                display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 14px', borderRadius: '12px',
                border: 'none', background: isActive ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
                color: isActive ? '#a78bfa' : '#94a3b8', cursor: 'pointer', transition: 'all 0.2s',
                fontFamily: 'inherit', fontWeight: isActive ? 800 : 600, fontSize: '14px',
                boxShadow: isActive ? 'inset 2px 0 0 #8b5cf6' : 'none'
              }}>
                <Icon size={18} color={isActive ? '#a78bfa' : '#64748b'} style={{ flexShrink: 0 }} />
                {!col && <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>}
              </button>
            )
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: '20px 12px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <button onClick={() => { logout(); window.location.href = '/admin/login'; }} style={{
            display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 14px', borderRadius: '12px',
            border: 'none', background: 'rgba(244, 63, 94, 0.1)', color: '#fb7185', cursor: 'pointer',
            transition: 'all 0.2s', fontFamily: 'inherit', fontWeight: 700, fontSize: '14px', width: '100%',
            justifyContent: col ? 'center' : 'flex-start'
          }}>
            <LogOut size={18} />
            {!col && <span>Logout Securely</span>}
          </button>
          
          {/* Collapse Toggle */}
          <button onClick={() => setCol(!col)} style={{
            position: 'absolute', right: '-14px', top: '50px', width: '28px', height: '28px',
            borderRadius: '50%', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8',
            cursor: 'pointer', zIndex: 10, display: window.innerWidth <= 768 ? 'none' : 'flex'
          }}>
            <ChevronRight size={14} style={{ transform: col ? 'none' : 'rotate(180deg)', transition: 'transform 0.3s' }} />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
        {/* Topbar */}
        <header style={{
          height: '70px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 24px', background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(255,255,255,0.05)', zIndex: 30
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button onClick={() => setShowMobileMenu(true)} style={{
              display: window.innerWidth <= 768 ? 'flex' : 'none', background: 'none', border: 'none',
              color: 'white', cursor: 'pointer', padding: '8px'
            }}>
              <Menu size={20} />
            </button>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'white' }}>
              {NAV.find(n => n.id === active)?.label}
            </h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '100px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#34d399', boxShadow: '0 0 8px #34d399' }} />
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.05em' }}>System Online</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '13px', fontWeight: 800 }}>{user.name}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>Superadmin</div>
              </div>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(139, 92, 246, 0.2)', color: '#a78bfa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                {user.name.charAt(0).toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        {/* Content Viewport */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '32px 24px' }}>
          {/* Inject dark theme variables into this specific scope since the components are designed for a light/variable theme */}
          <div style={{
            '--bg': 'transparent',
            '--bg-card': 'rgba(30, 41, 59, 0.6)',
            '--bg-card-muted': 'rgba(15, 23, 42, 0.4)',
            '--bg-input': 'rgba(15, 23, 42, 0.8)',
            '--bg-th': 'rgba(15, 23, 42, 0.8)',
            '--bg-row-even': 'transparent',
            '--bg-row-odd': 'rgba(255,255,255,0.02)',
            '--border': 'rgba(255,255,255,0.1)',
            '--border-row': 'rgba(255,255,255,0.05)',
            '--text': '#f8fafc',
            '--text-sub': '#cbd5e1',
            '--text-muted': '#94a3b8',
            '--primary': '#8b5cf6',
            '--primary-hover': '#7c3aed',
            '--danger': '#fb7185',
            '--accent': '#6366f1'
          }}>
            <AnimatePresence mode="wait">
              <motion.div key={active} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
                {active === 'dashboard' && <AdminDashboard />}
                {active === 'users' && <AdminUserManagement />}
                {active === 'parties' && <PartyMaster />}
                {active === 'org' && <OrganizationSettings />}
                {active === 'backup' && <AdminModule />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}
