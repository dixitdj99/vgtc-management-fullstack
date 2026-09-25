import React, { useState, useEffect, useMemo } from 'react';
import {
  ScanFace, Fingerprint, Calendar, Search, Download,
  CheckCircle2, AlertCircle, Clock, RefreshCw,
  Eye, Smartphone, Plus, Trash2, Upload
} from 'lucide-react';
import ax from '../../api';
import TableScroll from '../../components/TableScroll';
import * as XLSX from 'xlsx';
import './admin.css';

const getTodayIST = () => {
  const d = new Date();
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  const ist = new Date(utc + (3600000 * 5.5));
  return ist.toISOString().slice(0, 10);
};

export default function TerminalBiometricsManager() {
  const [activeTab, setActiveTab] = useState('logs');
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Logs state
  const [logs, setLogs] = useState([]);
  const [selectedDate, setSelectedDate] = useState(getTodayIST);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');

  // Enrolled employees state
  const [profiles, setProfiles] = useState([]);
  const [roleFilter, setRoleFilter] = useState('all');
  const [enrolledSearch, setEnrolledSearch] = useState('');
  const [viewingPhotoModal, setViewingPhotoModal] = useState(null);

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

  const fetchLogs = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await ax.get(`attendance?from=${selectedDate}&to=${selectedDate}`);
      const rawRecords = Array.isArray(res.data) ? res.data : [];
      setLogs(rawRecords);
    } catch (err) {
      console.error('Failed to load attendance logs:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

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

  useEffect(() => {
    if (!autoRefresh || activeTab !== 'logs') return;
    const interval = setInterval(() => {
      fetchLogs(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedDate, autoRefresh, activeTab]);

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

  const stats = useMemo(() => {
    const presentCount = filteredLogs.filter(l => l.status === 'present').length;
    const halfDayCount = filteredLogs.filter(l => l.status === 'half_day').length;
    const absentCount = filteredLogs.filter(l => l.status === 'absent').length;
    const terminalCount = filteredLogs.filter(l => l.source === 'terminal' || l.terminalId || l.method === 'face' || l.method === 'fingerprint' || l.id?.startsWith('emp_')).length;
    const totalEnrolled = profiles.length;
    const faceEnrolledCount = profiles.filter(p => p.photo || (p.photos && p.photos.length > 0)).length;
    const fpEnrolledCount = profiles.filter(p => p.fingerprintEnrolled).length;
    return { presentCount, halfDayCount, absentCount, terminalCount, totalEnrolled, faceEnrolledCount, fpEnrolledCount };
  }, [filteredLogs, profiles]);

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
    <div className="adm adm-page" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Page Header ── */}
      <div className="adm-head" style={{ flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="adm-icon-tile" style={{ background: 'rgba(99,102,241,0.10)', color: '#6366f1' }}>
              <ScanFace size={20} />
            </span>
            Attendance Terminal &amp; Biometrics Hub
          </h1>
          <p>Real-time kiosk punch logs, OTG fingerprint events, and enrolled face profiles</p>
        </div>

        {/* Tab switchers */}
        <div className="adm-head-actions">
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-th)', padding: 4, borderRadius: 10, border: '1px solid var(--border)' }}>
            <button
              type="button"
              onClick={() => setActiveTab('logs')}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 700,
                background: activeTab === 'logs' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'logs' ? '#fff' : 'var(--text-muted)',
                transition: 'all 0.15s ease',
              }}
            >
              <Clock size={15} />
              Terminal Punch Logs ({filteredLogs.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('enrolled')}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 700,
                background: activeTab === 'enrolled' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'enrolled' ? '#fff' : 'var(--text-muted)',
                transition: 'all 0.15s ease',
              }}
            >
              <Fingerprint size={15} />
              Enrolled Biometrics ({profiles.length})
            </button>
          </div>
        </div>
      </div>

      {/* ── KPI Stats Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        {activeTab === 'logs' ? (
          <>
            <div className="adm-card" style={{ padding: '14px 18px', borderLeft: '3px solid #6366f1' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Terminal Punches</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', marginTop: 5 }}>{stats.terminalCount}</div>
            </div>
            <div className="adm-card" style={{ padding: '14px 18px', borderLeft: '3px solid #10b981' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Present</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#10b981', marginTop: 5 }}>{stats.presentCount}</div>
            </div>
            <div className="adm-card" style={{ padding: '14px 18px', borderLeft: '3px solid var(--warn)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Half Day</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--warn)', marginTop: 5 }}>{stats.halfDayCount}</div>
            </div>
            <div className="adm-card" style={{ padding: '14px 18px', borderLeft: '3px solid var(--danger)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Absent / Leave</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--danger)', marginTop: 5 }}>{stats.absentCount}</div>
            </div>
          </>
        ) : (
          <>
            <div className="adm-card" style={{ padding: '14px 18px', borderLeft: '3px solid var(--primary)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Enrolled</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', marginTop: 5 }}>{stats.totalEnrolled}</div>
            </div>
            <div className="adm-card" style={{ padding: '14px 18px', borderLeft: '3px solid #10b981' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Face Enrolled</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#10b981', marginTop: 5 }}>{stats.faceEnrolledCount} / {stats.totalEnrolled}</div>
            </div>
            <div className="adm-card" style={{ padding: '14px 18px', borderLeft: '3px solid #3b82f6' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fingerprint (OTG)</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#3b82f6', marginTop: 5 }}>{stats.fpEnrolledCount}</div>
            </div>
          </>
        )}
      </div>

      {/* ── Filter Bar ── */}
      <div className="adm-panel" style={{ overflow: 'visible' }}>
        <div className="adm-panel-bd" style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {activeTab === 'logs' ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Calendar size={15} color="var(--text-muted)" />
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="adm-input"
                    style={{ padding: '5px 10px', fontSize: 13, width: 'auto' }}
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="adm-select"
                  style={{ padding: '5px 10px', fontSize: 13 }}
                >
                  <option value="all">All Statuses</option>
                  <option value="present">Present Only</option>
                  <option value="half_day">Half Day Only</option>
                  <option value="absent">Absent Only</option>
                </select>
                <select
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                  className="adm-select"
                  style={{ padding: '5px 10px', fontSize: 13 }}
                >
                  <option value="all">All Sources (Kiosk + Web)</option>
                  <option value="terminal">Kiosk Terminal Only</option>
                </select>
                <div style={{ position: 'relative' }}>
                  <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    placeholder="Search employee..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="adm-input"
                    style={{ paddingLeft: 30, fontSize: 13, width: 180 }}
                  />
                </div>
              </>
            ) : (
              <>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="adm-select"
                  style={{ padding: '5px 10px', fontSize: 13 }}
                >
                  <option value="all">All Roles</option>
                  <option value="Staff">Staff</option>
                  <option value="Driver">Driver</option>
                  <option value="Labour">Labour</option>
                  <option value="Helper">Helper</option>
                  <option value="Manager">Manager</option>
                </select>
                <div style={{ position: 'relative' }}>
                  <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    placeholder="Search enrolled staff..."
                    value={enrolledSearch}
                    onChange={(e) => setEnrolledSearch(e.target.value)}
                    className="adm-input"
                    style={{ paddingLeft: 30, fontSize: 13, width: 200 }}
                  />
                </div>
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {activeTab === 'logs' && (
              <button
                type="button"
                onClick={() => setAutoRefresh(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 7,
                  border: `1px solid ${autoRefresh ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
                  background: autoRefresh ? 'rgba(16,185,129,0.08)' : 'var(--bg-th)',
                  color: autoRefresh ? '#10b981' : 'var(--text-muted)',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >
                <span style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: autoRefresh ? '#10b981' : 'var(--text-muted)',
                  boxShadow: autoRefresh ? '0 0 6px #10b981' : 'none',
                  display: 'inline-block',
                }} />
                {autoRefresh ? 'Live Sync (5s)' : 'Live Paused'}
              </button>
            )}
            {activeTab === 'enrolled' && (
              <button
                type="button"
                className="adm-btn adm-btn--primary adm-btn--sm"
                onClick={() => setIsAddModalOpen(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Plus size={14} />
                Enroll Employee
              </button>
            )}
            <button
              type="button"
              className="adm-btn adm-btn--sm"
              onClick={activeTab === 'logs' ? () => fetchLogs(false) : fetchProfiles}
              disabled={loading}
            >
              <RefreshCw size={13} className={loading ? 'adm-spin' : ''} />
              Refresh
            </button>
            <button
              type="button"
              className="adm-btn adm-btn--primary adm-btn--sm"
              onClick={handleExportExcel}
            >
              <Download size={13} />
              Export Excel
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════════════ CONTENT AREA ══════════════════════ */}

      {activeTab === 'logs' ? (
        /* ── Punch Logs Table ── */
        <div className="adm-panel" style={{ overflow: 'hidden' }}>
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
                    <td colSpan={6} style={{ textAlign: 'center', padding: '44px 0', color: 'var(--text-muted)' }}>
                      <Clock size={34} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.4 }} />
                      No terminal punch logs recorded for {selectedDate}.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log, idx) => {
                    const statusColor =
                      log.status === 'present' ? '#10b981' :
                      log.status === 'half_day' ? 'var(--warn)' : 'var(--danger)';

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
                        <td style={{ fontWeight: 700 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Clock size={13} color="var(--text-muted)" />
                            {punchTime}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {photoUrl ? (
                              <img
                                src={photoUrl}
                                alt=""
                                style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: '2px solid #6366f1', flexShrink: 0 }}
                              />
                            ) : (
                              <div style={{
                                width: 32, height: 32, borderRadius: '50%',
                                background: 'rgba(99,102,241,0.12)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: 800, color: '#818cf8', fontSize: 13, flexShrink: 0,
                              }}>
                                {(log.profileName || 'U').charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <div style={{ fontWeight: 700 }}>{log.profileName}</div>
                              {assignedVeh && (
                                <div style={{ fontSize: 11, color: '#3b82f6', fontWeight: 600 }}>🚛 {assignedVeh}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <div style={{ color: 'var(--text)' }}>{log.profileType || 'Staff'}</div>
                          {assignedVeh && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{assignedVeh}</div>}
                        </td>
                        <td>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                            background: `${log.status === 'present' ? '#10b981' : log.status === 'half_day' ? '#f59e0b' : '#ef4444'}1A`,
                            color: statusColor,
                            border: `1px solid ${log.status === 'present' ? '#10b981' : log.status === 'half_day' ? '#f59e0b' : '#ef4444'}4D`,
                          }}>
                            {log.status === 'present' ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                            {(log.status || 'present').toUpperCase()}
                          </span>
                        </td>
                        <td>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                            background: isTerminal ? 'rgba(59,130,246,0.10)' : 'var(--bg-th)',
                            color: isTerminal ? '#3b82f6' : 'var(--text-muted)',
                            border: '1px solid var(--border)',
                          }}>
                            <Smartphone size={12} />
                            {isTerminal ? 'VGTC Terminal Kiosk' : 'Web Manual'}
                          </span>
                        </td>
                        <td>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12,
                            color: log.method === 'fingerprint' ? '#10b981' : '#6366f1',
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
        /* ── Enrolled Profiles Grid ── */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {filteredProfiles.length === 0 ? (
            <div style={{
              gridColumn: '1 / -1', textAlign: 'center', padding: '60px 20px',
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
            }}>
              <Fingerprint size={44} style={{ opacity: 0.3, margin: '0 auto 12px', display: 'block' }} />
              <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text)' }}>No Enrolled Employees Found</h3>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
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
                  className="adm-card"
                  style={{
                    padding: 18, display: 'flex', flexDirection: 'column', gap: 14,
                    border: '1px solid var(--border)', borderRadius: 12,
                    transition: 'box-shadow 0.18s ease',
                  }}
                >
                  {/* Avatar + Name Row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    {primaryPhoto ? (
                      <img
                        src={primaryPhoto}
                        alt={p.name}
                        style={{
                          width: 52, height: 52, borderRadius: '50%', objectFit: 'cover',
                          border: '2px solid rgba(99,102,241,0.4)', flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div style={{
                        width: 52, height: 52, borderRadius: '50%',
                        background: 'rgba(99,102,241,0.10)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#6366f1', fontSize: 20, fontWeight: 800, flexShrink: 0,
                      }}>
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span>{p.profileType || 'Staff'}</span>
                        {p.vehicleNo && (
                          <span style={{
                            color: '#3b82f6', fontWeight: 700,
                            background: 'rgba(59,130,246,0.09)', padding: '1px 7px',
                            borderRadius: 5, border: '1px solid rgba(59,130,246,0.2)',
                          }}>
                            🚛 {p.vehicleNo}
                          </span>
                        )}
                        {p.phone && <span>• {p.phone}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Status Badges */}
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    <span className={hasFace ? 'adm-chip adm-chip--success' : 'adm-chip adm-chip--danger'} style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <ScanFace size={12} />
                      {hasFace ? `Face Enrolled (${photoCount} ${photoCount > 1 ? 'angles' : 'photo'})` : 'No Face'}
                    </span>
                    <span className={hasFp ? 'adm-chip adm-chip--success' : 'adm-chip adm-chip--muted'} style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <Fingerprint size={12} />
                      {hasFp ? 'OTG Fingerprint Linked' : 'No Fingerprint'}
                    </span>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    {hasFace && (
                      <button
                        type="button"
                        className="adm-btn adm-btn--sm"
                        style={{ flex: 1, justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 6 }}
                        onClick={() => setViewingPhotoModal(p)}
                      >
                        <Eye size={13} />
                        View Angles ({photoCount})
                      </button>
                    )}
                    <button
                      type="button"
                      className="adm-btn adm-btn--sm"
                      style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 5, color: 'var(--danger)', borderColor: 'rgba(180,35,24,0.3)' }}
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

      {/* ── Photo Preview Modal ── */}
      {viewingPhotoModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: 20,
        }}>
          <div className="adm-panel" style={{ maxWidth: 620, width: '100%', borderRadius: 16 }}>
            <div className="adm-panel-hd">
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>
                  {viewingPhotoModal.name} — Enrolled Face Photos
                </h3>
                <p className="adm-sub">{viewingPhotoModal.photos?.length || 1} angles captured for biometric recognition</p>
              </div>
              <button type="button" className="adm-btn adm-btn--sm" onClick={() => setViewingPhotoModal(null)}>
                Close
              </button>
            </div>
            <div className="adm-panel-bd">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
                {(viewingPhotoModal.photos && viewingPhotoModal.photos.length > 0
                  ? viewingPhotoModal.photos
                  : [viewingPhotoModal.photo]
                ).map((imgSrc, i) => (
                  <div key={i} style={{ textAlign: 'center' }}>
                    <img
                      src={imgSrc}
                      alt={`Angle ${i + 1}`}
                      style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)' }}
                    />
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginTop: 6 }}>Angle {i + 1}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Enroll Employee Modal ── */}
      {isAddModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: 20,
        }}>
          <div className="adm-panel" style={{ maxWidth: 480, width: '100%', borderRadius: 16 }}>
            <div className="adm-panel-hd">
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <ScanFace size={20} color="#10b981" />
                Enroll New Employee
              </h3>
              <button type="button" className="adm-btn adm-btn--sm" onClick={() => setIsAddModalOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleSaveEmployee} className="adm-panel-bd" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="adm-field">
                <label htmlFor="add-name">Employee Full Name *</label>
                <input
                  id="add-name"
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={addName}
                  onChange={e => setAddName(e.target.value)}
                  className="adm-input"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="adm-field">
                  <label htmlFor="add-role">Role / Category</label>
                  <select id="add-role" value={addRole} onChange={e => setAddRole(e.target.value)} className="adm-select">
                    <option value="Staff">Staff</option>
                    <option value="Driver">Driver</option>
                    <option value="Labour">Labour</option>
                    <option value="Helper">Helper</option>
                    <option value="Manager">Manager</option>
                  </select>
                </div>
                <div className="adm-field">
                  <label htmlFor="add-phone">Phone (Optional)</label>
                  <input
                    id="add-phone"
                    type="tel"
                    placeholder="9876543210"
                    value={addPhone}
                    onChange={e => setAddPhone(e.target.value)}
                    className="adm-input"
                  />
                </div>
              </div>

              <div className="adm-field">
                <label htmlFor="add-vehicle">
                  Assigned Vehicle / Truck Number {addRole === 'Driver' ? '(Linked for Driver Attendance)' : '(Optional)'}
                </label>
                <input
                  id="add-vehicle"
                  type="text"
                  placeholder="e.g. HR 55 AB 1234"
                  value={addVehicle}
                  onChange={e => setAddVehicle(e.target.value.toUpperCase())}
                  className="adm-input"
                  style={{ textTransform: 'uppercase' }}
                />
              </div>

              <div className="adm-field">
                <label>Face Photo (For Biometric AI Recognition)</label>
                <div style={{
                  border: '2px dashed var(--border)',
                  borderRadius: 10, padding: 16, textAlign: 'center',
                  background: 'var(--bg-th)',
                }}>
                  {addPhoto ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                      <img src={addPhoto} alt="Preview" style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', border: '3px solid #10b981' }} />
                      <button
                        type="button"
                        onClick={() => setAddPhoto(null)}
                        style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                      >
                        Change Photo
                      </button>
                    </div>
                  ) : (
                    <div>
                      <Upload size={26} style={{ margin: '0 auto 8px', display: 'block', color: 'var(--text-muted)' }} />
                      <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>Upload face portrait image</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>JPG, PNG up to 5MB (auto-compressed)</div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoSelect}
                        style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                <button type="button" className="adm-btn" onClick={() => setIsAddModalOpen(false)} disabled={savingEmployee}>
                  Cancel
                </button>
                <button type="submit" className="adm-btn adm-btn--primary" disabled={savingEmployee}>
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
