import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Shield, Users, Fuel, Settings, Mail, Building2, TrendingUp, Cloud,
  LayoutDashboard, UserCircle, Briefcase,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import AdminDashboard from './admin/AdminDashboard';
import AdminUserManagement from './admin/AdminUserManagement';
import ProfitLossSheet from './admin/ProfitLossSheet';
import FuelStationManager from './admin/FuelStationManager';
import FirmManager from './admin/FirmManager';
import DestinationManager from './admin/DestinationManager';
import SystemSettings from './admin/SystemSettings';
import AdminModule from '../modules/AdminModule';
import StaffProfileModule from '../modules/StaffProfileModule';
import PartyMaster from '../modules/PartyMaster';
import './admin/admin.css';

const TAB_STORAGE_KEY = 'vgtc-adminpage-tab';

/**
 * Tabs, grouped. The bar used to be eleven equal pills in a row that scrolled
 * off the edge with nothing to say which belonged together.
 */
const TAB_GROUPS = [
  {
    id: 'people',
    label: 'People',
    tabs: [
      { id: 'users', label: 'Users & Permissions', Icon: Users },
      { id: 'profiles', label: 'Driver & Staff Profiles', Icon: UserCircle },
    ],
  },
  {
    id: 'masters',
    label: 'Master data',
    tabs: [
      { id: 'parties', label: 'Party Master', Icon: Building2 },
      { id: 'destinations', label: 'Destination Rates', Icon: MapPin },
      { id: 'firms', label: 'Firms & Vendors', Icon: Briefcase },
      { id: 'fuel', label: 'Fuel Stations', Icon: Fuel },
    ],
  },
  {
    id: 'system',
    label: 'System',
    tabs: [
      { id: 'overview', label: 'System Overview', Icon: LayoutDashboard },
      { id: 'pl_sheet', label: 'Profit & Loss', Icon: TrendingUp },
      { id: 'settings', label: 'Email & Organisation', Icon: Mail },
      { id: 'backup', label: 'Google Drive Backup', Icon: Cloud },
    ],
  },
];

const ALL_TABS = TAB_GROUPS.flatMap(g => g.tabs);

/**
 * AdminPage — the admin hub reached from inside the main app.
 *
 * It used to carry its own copy of user creation, the OTP handshake, the user
 * table and the labour-worker CRUD, all of which also existed in
 * pages/admin/AdminUserManagement.jsx. The two had drifted: this one filtered
 * "copy permissions from" with `u.id !== editTarget` where editTarget is the
 * user object, so it always offered the account being edited as a source, and
 * `isOtpEnabled` sat in its form state with no control to set it. Both screens
 * now render the same component, so there is one behaviour to fix and one to
 * test.
 */
export default function AdminPage() {
  const { user: me } = useAuth();

  const [activeTab, setActiveTab] = useState(() => {
    const saved = localStorage.getItem(TAB_STORAGE_KEY);
    return ALL_TABS.some(t => t.id === saved) ? saved : 'users';
  });

  const activeTabRef = useRef(null);

  useEffect(() => { localStorage.setItem(TAB_STORAGE_KEY, activeTab); }, [activeTab]);

  // The bar scrolls, and the tab restored from last session is often past the
  // right edge — landing on a strip that looks like nothing is selected.
  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [activeTab]);

  // Guard renders after every hook has run — an early return above them made
  // the hook order depend on the role, which React does not allow.
  if (me?.role !== 'admin') {
    return (
      <div className="adm" style={{ padding: '80px 20px', maxWidth: 460, margin: '0 auto' }}>
        <div className="adm-empty">
          <span className="adm-empty-icon" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', width: 60, height: 60 }}>
            <Shield size={28} />
          </span>
          <h3>Administrator access only</h3>
          <p>System settings and the admin panel are limited to administrator accounts. Ask an administrator if you need access.</p>
          <button type="button" className="adm-btn adm-btn--sm" onClick={() => { window.location.href = '/'; }}>
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="adm" style={{ padding: '0 20px 48px' }}>
      <div className="adm-page">

        <header className="adm-head">
          <div>
            <h1><Settings size={22} color="var(--primary)" /> Admin hub</h1>
            <p>Accounts and permissions, master data, and the system settings behind them.</p>
          </div>
        </header>

        {/* ── Tab bar ── */}
        <div className="adm-tabs" role="tablist" aria-label="Admin sections">
          {TAB_GROUPS.map((group, gi) => (
            <React.Fragment key={group.id}>
              {gi > 0 && (
                <span aria-hidden="true" style={{ width: 1, alignSelf: 'stretch', margin: '4px 6px', background: 'var(--border)', flexShrink: 0 }} />
              )}
              {group.tabs.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  ref={activeTab === id ? activeTabRef : null}
                  type="button"
                  role="tab"
                  id={`adm-tab-${id}`}
                  aria-selected={activeTab === id}
                  aria-controls={`adm-panel-${id}`}
                  className="adm-tab"
                  onClick={() => setActiveTab(id)}
                >
                  <Icon size={15} /> {label}
                </button>
              ))}
            </React.Fragment>
          ))}
        </div>

        {/* ── Panels ── */}
        <div id={`adm-panel-${activeTab}`} role="tabpanel" aria-labelledby={`adm-tab-${activeTab}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16 }}
            >
              {activeTab === 'users' && <AdminUserManagement />}
              {activeTab === 'profiles' && <StaffProfileModule role="admin" />}
              {activeTab === 'parties' && <PartyMaster />}
              {activeTab === 'destinations' && <DestinationManager />}
              {activeTab === 'firms' && <FirmManager />}
              {activeTab === 'fuel' && <FuelStationManager />}
              {activeTab === 'overview' && <AdminDashboard />}
              {activeTab === 'pl_sheet' && <ProfitLossSheet />}
              {activeTab === 'settings' && <SystemSettings />}
              {activeTab === 'backup' && <AdminModule />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
