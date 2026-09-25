import React, { useState, useEffect, useMemo } from 'react';
import {
  ScanFace, Fingerprint, Calendar, Search, Filter, Download,
  CheckCircle2, XCircle, Clock, AlertCircle, RefreshCw, User,
  Eye, Image as ImageIcon, Shield, Smartphone, HardHat, Truck,
  Plus, Trash2, Upload
} from 'lucide-react';
import ax from '../../api';
import TableScroll from '../../components/TableScroll';
import * as XLSX from 'xlsx';

const getTodayIST = () => {
  const d = new Date();
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  const ist = new Date(utc + (3600000 * 5.5));
  return ist.toISOString().slice(0, 10);
};

export default function TerminalBiometricsManager() {
  const [activeTab, setActiveTab] = useState('logs'); // 'logs' | 'enrolled'
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Logs state
  const [logs, setLogs] = useState([]);
  const [selectedDate, setSelectedDate] = useState(getTodayIST);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all'); // 'all' | 'terminal'

  // Enrolled employees state
  const [profiles, setProfiles] = useState([]);
  const [roleFilter, setRoleFilter] = useState('all');
  const [enrolledSearch, setEnrolledSearch] = useState('');
  const [viewingPhotoModal, setViewingPhotoModal] = useState(null); // profile object

  // Add Employee Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addRole, setAddRole] = useState('Staff');
  const [addVehicle, setAddVehicle] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addPhoto, setAddPhoto] = useState(null);
  const [savingEmployee, setSavingEmployee] = useState(false);

  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 320;
        const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUri = canvas.toDataURL('image/jpeg', 0.8);
        setAddPhoto(dataUri);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleSaveEmployee = async (e) => {
    e.preventDefault();
    if (!addName.trim()) return alert('Please enter employee name');
    setSavingEmployee(true);
    try {
      const payload = {
        name: addName.trim(),
        profileType: addRole,
        vehicleNo: addVehicle.trim().toUpperCase() || null,
        phone: addPhone.trim() || null,
        photo: addPhoto || null,
        photos: addPhoto ? [addPhoto] : [],
        createdAt: new Date().toISOString(),
      };
      await ax.post('profiles', payload);
      await fetchProfiles();
      setIsAddModalOpen(false);
      setAddName('');
      setAddRole('Staff');
      setAddVehicle('');
      setAddPhone('');
      setAddPhoto(null);
    } catch (err) {
      console.error('Failed to create profile:', err);
      alert(err.response?.data?.error || err.message || 'Failed to save employee');
    } finally {
      setSavingEmployee(false);
    }
  };

  const handleDeleteProfile = async (p) => {
    if (!window.confirm(`Are you sure you want to remove ${p.name}? This will also delete their biometrics on the terminal.`)) return;
    try {
      await ax.delete(`profiles/${p.id}`);
      await fetchProfiles();
    } catch (err) {
      console.error('Failed to delete profile:', err);
      alert('Failed to delete profile');
    }
  };

  // Fetch Attendance Logs (supports silent background sync)
  const fetchLogs = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // Fetch attendance range around selectedDate
      const res = await ax.get(`attendance?from=${selectedDate}&to=${selectedDate}`);
      const rawRecords = Array.isArray(res.data) ? res.data : [];
      setLogs(rawRecords);
    } catch (err) {
      console.error('Failed to load attendance logs:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Fetch Enrolled Profiles
  const fetchProfiles = async () => {
    try {
      const res = await ax.get('profiles');
      setProfiles(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to load profiles:', err);
    }
  };

  useEffect(() => {
    fetchLogs();
    fetchProfiles();
  }, [selectedDate]);

  // Live auto-refresh polling every 5 seconds so punches appear in real-time
  useEffect(() => {
    if (!autoRefresh || activeTab !== 'logs') return;
    const interval = setInterval(() => {
      fetchLogs(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedDate, autoRefresh, activeTab]);

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const isTerminal = log.source === 'terminal' || log.terminalId || log.method === 'face' || log.method === 'fingerprint' || log.id?.startsWith('emp_');
      if (sourceFilter === 'terminal' && !isTerminal) return false;
      if (statusFilter !== 'all' && log.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const name = (log.profileName || '').toLowerCase();
        const role = (log.profileType || '').toLowerCase();
        if (!name.includes(q) && !role.includes(q)) return false;
      }
      return true;
    });
  }, [logs, sourceFilter, statusFilter, searchQuery]);

  // Filtered Enrolled Profiles
  const filteredProfiles = useMemo(() => {
    return profiles.filter(p => {
      if (roleFilter !== 'all' && (p.profileType || 'Staff') !== roleFilter) return false;
      if (enrolledSearch.trim()) {
        const q = enrolledSearch.toLowerCase();
        const name = (p.name || '').toLowerCase();
        const role = (p.profileType || '').toLowerCase();
        if (!name.includes(q) && !role.includes(q)) return false;
      }
      return true;
    });
  }, [profiles, roleFilter, enrolledSearch]);

  // Stats calculation
  const stats = useMemo(() => {
    const presentCount = filteredLogs.filter(l => l.status === 'present').length;
    const halfDayCount = filteredLogs.filter(l => l.status === 'half_day').length;
    const absentCount = filteredLogs.filter(l => l.status === 'absent').length;
    const terminalCount = filteredLogs.filter(l => l.source === 'terminal' || l.terminalId || l.method === 'face' || l.method === 'fingerprint' || l.id?.startsWith('emp_')).length;

    const totalEnrolled = profiles.length;
    const faceEnrolledCount = profiles.filter(p => p.photo || (p.photos && p.photos.length > 0)).length;
    const fpEnrolledCount = profiles.filter(p => p.fingerprintEnrolled).length;

    return {
      presentCount,
      halfDayCount,
      absentCount,
      terminalCount,
      totalEnrolled,
      faceEnrolledCount,
      fpEnrolledCount,
    };
  }, [filteredLogs, profiles]);

  // Export to Excel
  const handleExportExcel = () => {
    if (activeTab === 'logs') {
      const exportData = filteredLogs.map((r, i) => ({
        'S.No': i + 1,
        'Date': r.date || selectedDate,
        'Employee Name': r.profileName || 'Unknown',
        'Role/Department': r.profileType || 'Staff',
        'Status': (r.status || '').toUpperCase(),
        'Punch Source': r.source === 'terminal' ? 'VGTC Terminal Kiosk' : 'Web Manual',
        'Marked At': r.createdAt ? new Date(r.createdAt).toLocaleTimeString('en-IN') : '-',
        'Note': r.note || '',
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `Attendance_${selectedDate}`);
      XLSX.writeFile(wb, `VGTC_Terminal_Attendance_${selectedDate}.xlsx`);
    } else {
      const exportData = filteredProfiles.map((p, i) => ({
        'S.No': i + 1,
        'Employee Name': p.name,
        'Department': p.profileType || 'Staff',
        'Face Enrolled': p.photo ? 'Yes (Photo Saved)' : 'No',
        'Photos Count': p.photos ? p.photos.length : (p.photo ? 1 : 0),
        'Fingerprint Enrolled': p.fingerprintEnrolled ? 'Yes (Linked)' : 'No',
        'Phone': p.phone || '-',
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Enrolled_Biometrics');
      XLSX.writeFile(wb, 'VGTC_Biometric_Enrollment_List.xlsx');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Banner with Title and Action Tabs */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98))',
        border: '1px solid rgba(148, 163, 184, 0.2)',
        borderRadius: 14,
        padding: '20px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: 'linear-gradient(135deg, #6366f1, #3b82f6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            boxShadow: '0 4px 14px rgba(99, 102, 241, 0.3)',
          }}>
            <ScanFace size={26} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.01em' }}>
              Attendance Terminal &amp; Biometrics Hub
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>
              Real-time kiosk punch logs, OTG fingerprint events, and enrolled face profiles
            </p>
          </div>
        </div>

        {/* Tab switchers */}
        <div style={{ display: 'flex', gap: 8, background: '#0b1220', padding: 4, borderRadius: 10 }}>
          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 700,
              background: activeTab === 'logs' ? '#6366f1' : 'transparent',
              color: activeTab === 'logs' ? '#ffffff' : '#94a3b8',
              transition: 'all 0.15s ease',
            }}
          >
            <Clock size={16} />
            Terminal Punch Logs ({filteredLogs.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('enrolled')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 700,
              background: activeTab === 'enrolled' ? '#6366f1' : 'transparent',
              color: activeTab === 'enrolled' ? '#ffffff' : '#94a3b8',
              transition: 'all 0.15s ease',
            }}
          >
            <Fingerprint size={16} />
            Enrolled Biometrics ({profiles.length})
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 14,
      }}>
        {activeTab === 'logs' ? (
          <>
            <div className="adm-card" style={{ padding: '16px 20px', borderLeft: '4px solid #6366f1' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                Terminal Punches Today
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#f8fafc', marginTop: 6 }}>
                {stats.terminalCount}
              </div>
            </div>
            <div className="adm-card" style={{ padding: '16px 20px', borderLeft: '4px solid #10b981' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                Present Marked
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#10b981', marginTop: 6 }}>
                {stats.presentCount}
              </div>
            </div>
            <div className="adm-card" style={{ padding: '16px 20px', borderLeft: '4px solid #f59e0b' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                Half Day Marked
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#f59e0b', marginTop: 6 }}>
                {stats.halfDayCount}
              </div>
            </div>
            <div className="adm-card" style={{ padding: '16px 20px', borderLeft: '4px solid #ef4444' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                Absent / Leave
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#ef4444', marginTop: 6 }}>
                {stats.absentCount}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="adm-card" style={{ padding: '16px 20px', borderLeft: '4px solid #6366f1' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                Total Enrolled Staff
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#f8fafc', marginTop: 6 }}>
                {stats.totalEnrolled}
              </div>
            </div>
            <div className="adm-card" style={{ padding: '16px 20px', borderLeft: '4px solid #10b981' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                Face Enrolled
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#10b981', marginTop: 6 }}>
                {stats.faceEnrolledCount} / {stats.totalEnrolled}
              </div>
            </div>
            <div className="adm-card" style={{ padding: '16px 20px', borderLeft: '4px solid #3b82f6' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                Fingerprint Linked (OTG)
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#3b82f6', marginTop: 6 }}>
                {stats.fpEnrolledCount}
              </div>
            </div>
          </>
        )}
      </div>

      {/* FILTER BAR & ACTIONS */}
      <div style={{
        background: '#1e293b',
        borderRadius: 12,
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        border: '1px solid rgba(148, 163, 184, 0.15)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {activeTab === 'logs' ? (
            <>
              {/* Date picker */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Calendar size={16} color="#94a3b8" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  style={{
                    background: '#0f172a',
                    border: '1px solid rgba(148, 163, 184, 0.25)',
                    borderRadius: 8,
                    padding: '6px 12px',
                    color: '#f8fafc',
                    fontSize: 13,
                  }}
                />
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  background: '#0f172a',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  borderRadius: 8,
                  padding: '6px 12px',
                  color: '#f8fafc',
                  fontSize: 13,
                }}
              >
                <option value="all">All Statuses</option>
                <option value="present">Present Only</option>
                <option value="half_day">Half Day Only</option>
                <option value="absent">Absent Only</option>
              </select>

              {/* Source Filter */}
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                style={{
                  background: '#0f172a',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  borderRadius: 8,
                  padding: '6px 12px',
                  color: '#f8fafc',
                  fontSize: 13,
                }}
              >
                <option value="all">All Sources (Kiosk + Web)</option>
                <option value="terminal">Kiosk Terminal Only</option>
              </select>

              {/* Search */}
              <div style={{ position: 'relative' }}>
                <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: 10, top: 9 }} />
                <input
                  type="text"
                  placeholder="Search employee..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    background: '#0f172a',
                    border: '1px solid rgba(148, 163, 184, 0.25)',
                    borderRadius: 8,
                    padding: '6px 12px 6px 32px',
                    color: '#f8fafc',
                    fontSize: 13,
                    width: 180,
                  }}
                />
              </div>
            </>
          ) : (
            <>
              {/* Role filter */}
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                style={{
                  background: '#0f172a',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  borderRadius: 8,
                  padding: '6px 12px',
                  color: '#f8fafc',
                  fontSize: 13,
                }}
              >
                <option value="all">All Roles</option>
                <option value="Staff">Staff</option>
                <option value="Driver">Driver</option>
                <option value="Labour">Labour</option>
                <option value="Helper">Helper</option>
                <option value="Manager">Manager</option>
              </select>

              {/* Search */}
              <div style={{ position: 'relative' }}>
                <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: 10, top: 9 }} />
                <input
                  type="text"
                  placeholder="Search enrolled staff..."
                  value={enrolledSearch}
                  onChange={(e) => setEnrolledSearch(e.target.value)}
                  style={{
                    background: '#0f172a',
                    border: '1px solid rgba(148, 163, 184, 0.25)',
                    borderRadius: 8,
                    padding: '6px 12px 6px 32px',
                    color: '#f8fafc',
                    fontSize: 13,
                    width: 220,
                  }}
                />
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* Live auto-refresh indicator */}
          {activeTab === 'logs' && (
            <button
              type="button"
              onClick={() => setAutoRefresh(v => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid rgba(16, 185, 129, 0.3)',
                background: autoRefresh ? 'rgba(16, 185, 129, 0.12)' : 'rgba(148, 163, 184, 0.1)',
                color: autoRefresh ? '#34d399' : '#94a3b8',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Click to toggle real-time auto-refresh"
            >
              <span style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: autoRefresh ? '#10b981' : '#64748b',
                boxShadow: autoRefresh ? '0 0 8px #10b981' : 'none',
              }} />
              {autoRefresh ? 'Live Sync (5s)' : 'Live Paused'}
            </button>
          )}

          {activeTab === 'enrolled' && (
            <button
              type="button"
              className="adm-btn adm-btn--primary adm-btn--sm"
              onClick={() => setIsAddModalOpen(true)}
              style={{ background: '#10b981', borderColor: '#059669', color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={14} />
              Enroll Employee
            </button>
          )}

          <button
            type="button"
            className="adm-btn adm-btn--ghost adm-btn--sm"
            onClick={activeTab === 'logs' ? () => fetchLogs(false) : fetchProfiles}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            type="button"
            className="adm-btn adm-btn--primary adm-btn--sm"
            onClick={handleExportExcel}
          >
            <Download size={14} />
            Export to Excel
          </button>
        </div>
      </div>

      {/* CONTENT AREA */}
      {activeTab === 'logs' ? (
        <div className="adm-card" style={{ padding: 0, overflow: 'hidden' }}>
          <TableScroll maxHeight="65vh">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Punch Time</th>
                  <th>Employee Name</th>
                  <th>Role / Dept</th>
                  <th>Status</th>
                  <th>Punch Source</th>
                  <th>Punch Method</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '36px 0', color: '#94a3b8' }}>
                      <Clock size={36} color="#64748b" style={{ margin: '0 auto 8px', display: 'block' }} />
                      No terminal punch logs recorded for {selectedDate}.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log, idx) => {
                    const statusColor =
                      log.status === 'present' ? '#10b981' :
                      log.status === 'half_day' ? '#f59e0b' : '#ef4444';

                    const rawTime = log.punchTime || log.markedAt || log.createdAt || (log.updatedAt?.seconds ? log.updatedAt.seconds * 1000 : log.updatedAt);
                    const punchTime = rawTime
                      ? new Date(rawTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
                      : 'Logged';

                    const isTerminal = log.source === 'terminal' || log.terminalId || log.method === 'face' || log.method === 'fingerprint' || log.id?.startsWith('emp_');

                    const punchMethod = log.method === 'fingerprint' ? 'OTG Fingerprint' :
                                        log.method === 'face' ? 'Face Verification' :
                                        log.method === 'manual' ? 'Terminal Direct' :
                                        (isTerminal ? 'Kiosk Auto-Punch' : 'Supervisor Roll-Call');

                    const matchedProfile = profiles.find(p => p.id === log.profileId || p.name?.toLowerCase() === log.profileName?.toLowerCase());
                    const photoUrl = log.photo || matchedProfile?.photo || (matchedProfile?.photos && matchedProfile.photos[0]);
                    const assignedVeh = log.vehicleNo || matchedProfile?.vehicleNo;

                    return (
                      <tr key={log.id || idx}>
                        <td style={{ fontWeight: 700, color: '#f8fafc' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Clock size={13} color="#94a3b8" />
                            {punchTime}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {photoUrl ? (
                              <img
                                src={photoUrl}
                                alt=""
                                style={{
                                  width: 34,
                                  height: 34,
                                  borderRadius: '50%',
                                  objectFit: 'cover',
                                  border: '2px solid #6366f1',
                                  flexShrink: 0,
                                }}
                              />
                            ) : (
                              <div style={{
                                width: 34,
                                height: 34,
                                borderRadius: '50%',
                                background: 'rgba(99, 102, 241, 0.15)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                color: '#818cf8',
                                fontSize: 13,
                                flexShrink: 0,
                              }}>
                                {(log.profileName || 'U').charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <div style={{ fontWeight: 700, color: '#f1f5f9' }}>{log.profileName}</div>
                              {assignedVeh && (
                                <div style={{ fontSize: 11, color: '#38bdf8', fontWeight: 600 }}>
                                  🚛 {assignedVeh}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ color: '#cbd5e1' }}>
                          <div>{log.profileType || 'Staff'}</div>
                          {assignedVeh && <div style={{ fontSize: 11, color: '#94a3b8' }}>{assignedVeh}</div>}
                        </td>
                        <td>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '3px 10px',
                            borderRadius: 12,
                            fontSize: 12,
                            fontWeight: 700,
                            background: `${statusColor}1A`,
                            color: statusColor,
                            border: `1px solid ${statusColor}4D`,
                          }}>
                            {log.status === 'present' ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                            {(log.status || 'present').toUpperCase()}
                          </span>
                        </td>
                        <td>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '3px 10px',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            background: isTerminal ? 'rgba(59, 130, 246, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                            color: isTerminal ? '#60a5fa' : '#94a3b8',
                          }}>
                            <Smartphone size={12} />
                            {isTerminal ? 'VGTC Terminal Kiosk' : 'Web Manual'}
                          </span>
                        </td>
                        <td>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            fontSize: 12,
                            color: log.method === 'fingerprint' ? '#10b981' : '#a5b4fc',
                            fontWeight: 600,
                          }}>
                            {log.method === 'fingerprint' ? <Fingerprint size={13} /> : <ScanFace size={13} />}
                            {punchMethod}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </TableScroll>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 16,
        }}>
          {filteredProfiles.length === 0 ? (
            <div style={{
              gridColumn: '1 / -1',
              textAlign: 'center',
              padding: '60px 20px',
              background: '#1e293b',
              borderRadius: 14,
              color: '#94a3b8',
            }}>
              <Fingerprint size={48} color="#64748b" style={{ margin: '0 auto 12px', display: 'block' }} />
              <h3 style={{ margin: 0, color: '#f8fafc', fontSize: 17 }}>No Enrolled Employees Found</h3>
              <p style={{ margin: '6px 0 0', fontSize: 13 }}>
                Use the VGTC Android Terminal app to enroll face photos and OTG fingerprints.
              </p>
            </div>
          ) : (
            filteredProfiles.map(p => {
              const primaryPhoto = p.photo || (p.photos && p.photos.length > 0 ? p.photos[0] : null);
              const hasFace = !!(primaryPhoto || (p.faceEmbedding && p.faceEmbedding.length > 0));
              const photoCount = p.photos && p.photos.length > 0 ? p.photos.length : (primaryPhoto ? 1 : 0);
              const hasFp = !!p.fingerprintEnrolled || p.fingerprintSlotId != null;

              return (
                <div
                  key={p.id}
                  style={{
                    background: '#1e293b',
                    border: '1px solid rgba(148, 163, 184, 0.18)',
                    borderRadius: 14,
                    padding: 18,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    {primaryPhoto ? (
                      <img
                        src={primaryPhoto}
                        alt={p.name}
                        style={{
                          width: 54,
                          height: 54,
                          borderRadius: '50%',
                          objectFit: 'cover',
                          border: '2px solid #6366f1',
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div style={{
                        width: 54,
                        height: 54,
                        borderRadius: '50%',
                        background: 'rgba(99, 102, 241, 0.15)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#818cf8',
                        fontSize: 20,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}>
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                    )}

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 16, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </div>
                      <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span>{p.profileType || 'Staff'}</span>
                        {p.vehicleNo && (
                          <span style={{ color: '#38bdf8', fontWeight: 700, background: 'rgba(56, 189, 248, 0.12)', padding: '1px 6px', borderRadius: 4 }}>
                            🚛 {p.vehicleNo}
                          </span>
                        )}
                        {p.phone && <span>• {p.phone}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Status Badges */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '4px 10px',
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 700,
                      background: hasFace ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                      color: hasFace ? '#10b981' : '#f87171',
                      border: `1px solid ${hasFace ? '#10b98140' : '#ef444440'}`,
                    }}>
                      <ScanFace size={13} />
                      {hasFace ? `Face Enrolled (${photoCount} ${photoCount > 1 ? 'angles' : 'photo'})` : 'No Face'}
                    </span>

                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '4px 10px',
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 700,
                      background: hasFp ? 'rgba(59, 130, 246, 0.15)' : 'rgba(148, 163, 184, 0.1)',
                      color: hasFp ? '#60a5fa' : '#94a3b8',
                      border: `1px solid ${hasFp ? '#3b82f640' : 'rgba(148, 163, 184, 0.2)'}`,
                    }}>
                      <Fingerprint size={13} />
                      {hasFp ? 'OTG Fingerprint Linked' : 'No Fingerprint'}
                    </span>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    {hasFace && (
                      <button
                        type="button"
                        className="adm-btn adm-btn--ghost adm-btn--sm"
                        style={{ flex: 1, justifyContent: 'center' }}
                        onClick={() => setViewingPhotoModal(p)}
                      >
                        <Eye size={14} />
                        View Angles ({photoCount})
                      </button>
                    )}
                    <button
                      type="button"
                      className="adm-btn adm-btn--ghost adm-btn--sm"
                      style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)', padding: '6px 10px' }}
                      onClick={() => handleDeleteProfile(p)}
                      title="Remove employee"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* PHOTO PREVIEW MODAL */}
      {viewingPhotoModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20,
        }}>
          <div style={{
            background: '#1e293b',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            borderRadius: 16,
            maxWidth: 600,
            width: '100%',
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#f8fafc' }}>
                  {viewingPhotoModal.name} — Enrolled Face Photos
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>
                  {viewingPhotoModal.photos?.length || 1} angles captured for biometric recognition
                </p>
              </div>
              <button
                type="button"
                className="adm-btn adm-btn--ghost adm-btn--sm"
                onClick={() => setViewingPhotoModal(null)}
              >
                Close
              </button>
            </div>

            {/* Gallery */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: 12,
            }}>
              {(viewingPhotoModal.photos && viewingPhotoModal.photos.length > 0
                ? viewingPhotoModal.photos
                : [viewingPhotoModal.photo]
              ).map((imgSrc, i) => (
                <div key={i} style={{ textAlign: 'center' }}>
                  <img
                    src={imgSrc}
                    alt={`Angle ${i + 1}`}
                    style={{
                      width: '100%',
                      height: 140,
                      objectFit: 'cover',
                      borderRadius: 10,
                      border: '1px solid rgba(148, 163, 184, 0.3)',
                    }}
                  />
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginTop: 6 }}>
                    Angle {i + 1}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ENROLL EMPLOYEE MODAL */}
      {isAddModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20,
        }}>
          <div style={{
            background: '#1e293b',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            borderRadius: 16,
            maxWidth: 480,
            width: '100%',
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                <ScanFace size={20} color="#10b981" />
                Enroll New Employee
              </h3>
              <button
                type="button"
                className="adm-btn adm-btn--ghost adm-btn--sm"
                onClick={() => setIsAddModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEmployee} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#cbd5e1', marginBottom: 4 }}>
                  Employee Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={addName}
                  onChange={e => setAddName(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#0f172a',
                    border: '1px solid rgba(148, 163, 184, 0.25)',
                    borderRadius: 8,
                    padding: '8px 12px',
                    color: '#f8fafc',
                    fontSize: 14,
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#cbd5e1', marginBottom: 4 }}>
                    Role / Category
                  </label>
                  <select
                    value={addRole}
                    onChange={e => setAddRole(e.target.value)}
                    style={{
                      width: '100%',
                      background: '#0f172a',
                      border: '1px solid rgba(148, 163, 184, 0.25)',
                      borderRadius: 8,
                      padding: '8px 12px',
                      color: '#f8fafc',
                      fontSize: 13,
                    }}
                  >
                    <option value="Staff">Staff</option>
                    <option value="Driver">Driver</option>
                    <option value="Labour">Labour</option>
                    <option value="Helper">Helper</option>
                    <option value="Manager">Manager</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#cbd5e1', marginBottom: 4 }}>
                    Phone (Optional)
                  </label>
                  <input
                    type="tel"
                    placeholder="9876543210"
                    value={addPhone}
                    onChange={e => setAddPhone(e.target.value)}
                    style={{
                      width: '100%',
                      background: '#0f172a',
                      border: '1px solid rgba(148, 163, 184, 0.25)',
                      borderRadius: 8,
                      padding: '8px 12px',
                      color: '#f8fafc',
                      fontSize: 14,
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#cbd5e1', marginBottom: 4 }}>
                  Assigned Vehicle / Truck Number {addRole === 'Driver' ? '(Linked for Driver Attendance)' : '(Optional)'}
                </label>
                <input
                  type="text"
                  placeholder="e.g. HR 55 AB 1234"
                  value={addVehicle}
                  onChange={e => setAddVehicle(e.target.value.toUpperCase())}
                  style={{
                    width: '100%',
                    background: '#0f172a',
                    border: '1px solid rgba(148, 163, 184, 0.25)',
                    borderRadius: 8,
                    padding: '8px 12px',
                    color: '#f8fafc',
                    fontSize: 14,
                    textTransform: 'uppercase',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#cbd5e1', marginBottom: 4 }}>
                  Face Photo (For Biometric AI Recognition)
                </label>
                <div style={{
                  border: '2px dashed rgba(148, 163, 184, 0.3)',
                  borderRadius: 10,
                  padding: 16,
                  textAlign: 'center',
                  background: 'rgba(15, 23, 42, 0.6)',
                }}>
                  {addPhoto ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                      <img
                        src={addPhoto}
                        alt="Preview"
                        style={{ width: 90, height: 90, borderRadius: '50%', objectFit: 'cover', border: '3px solid #10b981' }}
                      />
                      <button
                        type="button"
                        onClick={() => setAddPhoto(null)}
                        style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                      >
                        Change Photo
                      </button>
                    </div>
                  ) : (
                    <div>
                      <Upload size={28} color="#94a3b8" style={{ margin: '0 auto 8px', display: 'block' }} />
                      <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>Upload face portrait image</div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>JPG, PNG up to 5MB (auto-compressed)</div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoSelect}
                        style={{ marginTop: 10, fontSize: 12, color: '#94a3b8' }}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  className="adm-btn adm-btn--ghost"
                  onClick={() => setIsAddModalOpen(false)}
                  disabled={savingEmployee}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="adm-btn adm-btn--primary"
                  style={{ background: '#10b981', borderColor: '#059669' }}
                  disabled={savingEmployee}
                >
                  {savingEmployee ? 'Saving & Syncing...' : 'Save & Sync to Terminal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
