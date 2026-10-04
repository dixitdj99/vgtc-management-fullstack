import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ScanFace, Fingerprint, Calendar, Search, Download,
  CheckCircle2, AlertCircle, Clock, RefreshCw,
  Eye, Smartphone, ChevronLeft, ChevronRight, Cpu,
  Truck, UserCheck, UserX, Home, Check, CheckCheck, MapPin,
  Key, Copy, Trash2, UserPlus, Power, Play
} from 'lucide-react';
import ax, { invalidateCache } from '../../api';
import TableScroll from '../../components/TableScroll';
import AttendanceTimelineModal from '../../components/AttendanceTimelineModal';
import EnrollmentImage from '../../components/EnrollmentImage';
import * as XLSX from 'xlsx';
import './admin.css';

const getTodayIST = () => {
  const d = new Date();
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  const ist = new Date(utc + (3600000 * 5.5));
  return ist.toISOString().slice(0, 10);
};

const formatPunchTime = (value) => {
  if (!value) return 'Logged';
  if (typeof value === 'string' && /^\d{1,2}:\d{2}(:\d{2})?\s?(AM|PM)$/i.test(value.trim())) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
};

const imageUrl = (value) => {
  if (!value) return null;
  if (/^(data:|https?:\/\/)/i.test(value)) return value;
  // Capacitor serves the UI from localhost; API files live on the remote host.
  if (value.startsWith('/api/')) {
    return new URL(value, new URL(ax.defaults.baseURL, window.location.origin).origin).href;
  }
  return `${window.location.origin}${value.startsWith('/') ? value : `/${value}`}`;
};

const enrollmentPhotos = (profile) => [...new Set([
  profile?.facePhoto || profile?.photo || profile?.photoUrl,
  ...(Array.isArray(profile?.photos) ? profile.photos : []),
].filter(value => typeof value === 'string' && value))];

const formatTimelineDate = (value) => {
  if (!value) return 'Unknown time';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

export default function TerminalBiometricsManager() {
  // Tabs: 'presence' | 'logs' | 'enrolled'
  const [activeTab, setActiveTab] = useState('presence');
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [liveConnected, setLiveConnected] = useState(false);
  const [timelineProfile, setTimelineProfile] = useState(null);

  // Common Date Selector
  const [selectedDate, setSelectedDate] = useState(getTodayIST);

  // ── Presence & Roster state ──
  const [roster, setRoster] = useState(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [vehicles, setVehicles] = useState([]);
  const [markingId, setMarkingId] = useState(null);
  const [presenceStatusFilter, setPresenceStatusFilter] = useState('all');
  const [presenceRoleFilter, setPresenceRoleFilter] = useState('all');
  const [presenceSearch, setPresenceSearch] = useState('');

  // ── Logs state ──
  const [logs, setLogs] = useState([]);
  const [stoppedAttempts, setStoppedAttempts] = useState([]);
  const [attemptsError, setAttemptsError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');

  // ── Enrolled employees state ──
  const [profiles, setProfiles] = useState([]);
  const [selectedProfileIds, setSelectedProfileIds] = useState([]);
  const [attendanceControlBusy, setAttendanceControlBusy] = useState(false);
  const [attendanceControlMessage, setAttendanceControlMessage] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [enrolledSearch, setEnrolledSearch] = useState('');
  const [terminalKey, setTerminalKey] = useState('VGTC-TERMINAL-TOKEN-KEY');
  const [keyCopied, setKeyCopied] = useState(false);
  const [keyBusy, setKeyBusy] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedAddProfileId, setSelectedAddProfileId] = useState('');

  const fetchTerminalConfig = async () => {
    try {
      const res = await ax.get('terminal/config', { _skipCache: true });
      if (res.data?.terminalKey) setTerminalKey(res.data.terminalKey);
    } catch (_) {}
  };

  const handleGenerateKey = async () => {
    if (!window.confirm('Generate a new Terminal API Key? You will need to enter this key in your Android terminal settings to connect.')) return;
    setKeyBusy(true);
    try {
      const res = await ax.post('terminal/config', {});
      if (res.data?.terminalKey) {
        setTerminalKey(res.data.terminalKey);
        setAttendanceControlMessage(`✓ New Terminal API Key generated: ${res.data.terminalKey}`);
      }
    } catch (e) {
      alert('Failed to generate key: ' + (e.response?.data?.error || e.message));
    } finally {
      setKeyBusy(false);
    }
  };

  const copyKeyToClipboard = () => {
    navigator.clipboard?.writeText(terminalKey);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2500);
  };

  const handleStopAll = () => {
    if (!filteredProfiles.length) return;
    if (window.confirm(`Stop attendance for all ${filteredProfiles.length} displayed profiles? Terminal will block attendance scans for them until resumed.`)) {
      changeAttendanceAccess(filteredProfiles.map(p => p.id), false);
    }
  };

  const handleResumeAll = () => {
    if (!filteredProfiles.length) return;
    if (window.confirm(`Resume attendance for all ${filteredProfiles.length} displayed profiles?`)) {
      changeAttendanceAccess(filteredProfiles.map(p => p.id), true);
    }
  };

  const handleDeleteProfile = async (profile) => {
    if (!window.confirm(`Permanently delete profile "${profile.name}" from VGTC? This will remove the employee from both portal and terminal.`)) return;
    try {
      await ax.delete(`profiles/${profile.id}`);
      setProfiles(prev => prev.filter(p => p.id !== profile.id));
      setAttendanceControlMessage(`✓ Profile "${profile.name}" deleted.`);
    } catch (e) {
      alert('Failed to delete profile: ' + (e.response?.data?.error || e.message));
    }
  };

  const handleAddFromVgtc = async () => {
    if (!selectedAddProfileId) return;
    try {
      await changeAttendanceAccess([selectedAddProfileId], true);
      setShowAddModal(false);
      setSelectedAddProfileId('');
    } catch (e) {
      alert('Failed to add profile: ' + (e.response?.data?.error || e.message));
    }
  };

  const [viewingPhotoModal, setViewingPhotoModal] = useState(null);
  const photoCloseRef = useRef(null);
  const photoModalOpen = !!viewingPhotoModal;

  useEffect(() => {
    if (!photoModalOpen) return undefined;
    const previousFocus = document.activeElement;
    photoCloseRef.current?.focus();
    const onKeyDown = event => {
      if (event.key === 'Escape') setViewingPhotoModal(null);
      // The gallery's only interactive control is Close.
      if (event.key === 'Tab') {
        event.preventDefault();
        photoCloseRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [photoModalOpen]);

  const fetchRoster = async (silent = false) => {
    if (!silent) setRosterLoading(true);
    try {
      const [rosRes, vehRes] = await Promise.all([
        ax.get(`attendance/roster?date=${selectedDate}`, { _skipCache: true }),
        ax.get('vehicles', { _skipCache: true }).catch(() => ({ data: [] })),
      ]);
      setRoster(rosRes.data || null);
      if (Array.isArray(vehRes.data)) setVehicles(vehRes.data);
    } catch (err) {
      console.error('Failed to load roster / vehicles:', err);
    } finally {
      if (!silent) setRosterLoading(false);
    }
  };

  const fetchLogs = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await ax.get(`attendance?from=${selectedDate}&to=${selectedDate}`, { _skipCache: true });
      const rawRecords = Array.isArray(res.data) ? res.data : [];
      setLogs(rawRecords);
      if (activeTab !== 'enrolled') try {
        const attempts = await ax.get('terminal/attempts', { _skipCache: true });
        setStoppedAttempts((attempts.data?.events || []).filter(event => event.date === selectedDate));
        setAttemptsError('');
      } catch (error) {
        setStoppedAttempts([]);
        setAttemptsError('Stopped scan attempts could not be loaded. Refresh to retry.');
      }
    } catch (err) {
      console.error('Failed to load attendance logs:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchProfiles = async () => {
    try {
      const res = await ax.get('profiles', { _skipCache: true });
      const nextProfiles = Array.isArray(res.data) ? res.data : [];
      setProfiles(nextProfiles);
      setSelectedProfileIds(previous => previous.filter(id => nextProfiles.some(p => p.id === id)));
      setViewingPhotoModal(previous => previous ? nextProfiles.find(p => p.id === previous.id) || null : null);
      setTimelineProfile(previous => previous ? nextProfiles.find(p => p.id === previous.id) || null : null);
    } catch (err) {
      console.error('Failed to load profiles:', err);
    }
  };

  const changeAttendanceAccess = async (profileIds, attendanceEnabled) => {
    if (!profileIds.length || attendanceControlBusy) return;
    setAttendanceControlBusy(true);
    setAttendanceControlMessage('');
    let updated = 0;
    try {
      // Firestore batches are bounded; a large portal roster is sent in chunks.
      for (let index = 0; index < profileIds.length; index += 400) {
        const batch = profileIds.slice(index, index + 400);
        const response = await ax.post('terminal/attendance-control', { profileIds: batch, attendanceEnabled }, { _requireOnline: true });
        if (response.data?._queued) throw new Error('Connect to the internet to change attendance access.');
        updated += batch.length;
      }
      setAttendanceControlMessage(`Attendance ${attendanceEnabled ? 'started' : 'stopped'} for ${updated} profiles.`);
    } catch (error) {
      setAttendanceControlMessage(`${updated ? `${updated} profiles updated. ` : ''}${error.response?.data?.error || error.message || 'Unable to update attendance access.'}`);
    } finally {
      await Promise.all([fetchProfiles(), fetchRoster(true)]);
      setAttendanceControlBusy(false);
    }
  };

  useEffect(() => {
    fetchRoster();
    fetchLogs();
    fetchProfiles();
    fetchTerminalConfig();
  }, [selectedDate]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      if (document.hidden) return;
      if (activeTab === 'presence') fetchRoster(true);
      else if (activeTab === 'logs') fetchLogs(true);
      fetchProfiles();
    }, 60000);
    return () => clearInterval(interval);
  }, [selectedDate, autoRefresh, activeTab, liveConnected]);

  // Server-sent events make Android terminal punches appear immediately. The
  // one-minute uncached interval remains as a cross-instance/network fallback.
  useEffect(() => {
    if (!autoRefresh) {
      setLiveConnected(false);
      return undefined;
    }

    let active = true;
    let reconnectTimer;
    const controller = new AbortController();

    const refreshAttendance = () => {
      invalidateCache('/attendance');
      fetchRoster(true);
      fetchLogs(true);
    };

    const connect = async () => {
      try {
        const token = localStorage.getItem('vgtc-token');
        const apiBase = new URL(ax.defaults.baseURL, window.location.origin).href.replace(/\/$/, '');
        const response = await fetch(`${apiBase}/attendance/live`, {
          headers: {
            Accept: 'text/event-stream',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error(`Live stream unavailable (${response.status})`);
        setLiveConnected(true);
        // Reconcile changes missed while the internet connection was unavailable.
        fetchProfiles();
        refreshAttendance();
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (active) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const packets = buffer.split('\n\n');
          buffer = packets.pop() || '';
          packets.forEach(packet => {
            const dataLine = packet.split('\n').find(line => line.startsWith('data:'));
            if (!dataLine) return;
            try {
              const event = JSON.parse(dataLine.slice(5).trim());
              if (event.type === 'attendance.changed') {
                window.dispatchEvent(new CustomEvent('attendance-realtime', { detail: event }));
                refreshAttendance();
              }
              if (event.type === 'profiles.changed') {
                invalidateCache('profiles');
                fetchProfiles();
                refreshAttendance();
              }
            } catch (_) { /* Ignore malformed keep-alive packets. */ }
          });
        }
      } catch (err) {
        if (active && err.name !== 'AbortError') console.warn('Attendance live sync reconnecting:', err.message);
      } finally {
        if (active) {
          setLiveConnected(false);
          reconnectTimer = setTimeout(connect, 4000);
        }
      }
    };

    connect();
    return () => {
      active = false;
      clearTimeout(reconnectTimer);
      controller.abort();
      setLiveConnected(false);
    };
  }, [selectedDate, autoRefresh, activeTab]);

  // ── Quick Mark Attendance ──
  const handleQuickMark = async (profile, newStatus) => {
    setMarkingId(profile.profileId);
    try {
      await ax.post('attendance/bulk', {
        date: selectedDate,
        records: [{
          profileId: profile.profileId,
          profileName: profile.name,
          profileType: profile.type || 'Staff',
          status: newStatus,
          source: 'manual',
          note: `Marked as ${newStatus} via Terminal Hub`,
        }],
      });
      // Optimistic update
      setRoster(prev => {
        if (!prev || !prev.rows) return prev;
        return {
          ...prev,
          rows: prev.rows.map(r => r.profileId === profile.profileId ? { ...r, status: newStatus } : r),
        };
      });
      await fetchRoster(true);
    } catch (err) {
      console.error('Failed to mark attendance:', err);
      alert(err.response?.data?.error || err.message || 'Failed to mark attendance');
    } finally {
      setMarkingId(null);
    }
  };

  // ── Bulk Mark Unmarked as Present ──
  const handleMarkAllUnmarkedPresent = async () => {
    if (!roster?.rows) return;
    const unmarked = presenceList.filter(r => !r.status && r.attendanceEnabled);
    if (unmarked.length === 0) {
      alert('All personnel on the roster already have attendance marked for this date.');
      return;
    }
    if (!window.confirm(`Mark remaining ${unmarked.length} unmarked personnel as "Present in Yard"?`)) return;
    setRosterLoading(true);
    try {
      const records = unmarked.map(r => ({
        profileId: r.profileId,
        profileName: r.name,
        profileType: r.type || 'Staff',
        status: 'present',
        source: 'manual',
        note: 'Bulk marked as present via Terminal Hub',
      }));
      await ax.post('attendance/bulk', { date: selectedDate, records });
      await fetchRoster(true);
    } catch (err) {
      console.error('Failed bulk mark:', err);
      alert('Failed to mark remaining personnel');
    } finally {
      setRosterLoading(false);
    }
  };

  // ── Computed Presence List ──
  const presenceList = useMemo(() => {
    if (!roster?.rows) return [];
    const rosterById = new Map(roster.rows.map(row => [row.profileId, row]));
    // Payroll rosters can exclude categories. Terminal controls cover every
    // existing master profile, including profiles with no attendance history.
    return profiles.map(profile => {
      const r = { profileId: profile.id, name: profile.name, type: profile.profileType || profile.type || 'Staff', phone: profile.phone, vehicleNo: profile.vehicleNo, ...rosterById.get(profile.id) };
      const attendanceEnabled = (profiles.find(p => p.id === r.profileId)?.attendanceEnabled ?? r.attendanceEnabled) !== false;
      const cleanTruck = (r.vehicleNo || '').toUpperCase().replace(/\s+/g, '');
      const matchedVeh = vehicles.find(v => (v.truckNo || '').toUpperCase().replace(/\s+/g, '') === cleanTruck);

      const isOnTrip = !!(r.activeDuty || r.dutyState === 'in_duty' || matchedVeh?.status === 'ON_TRIP' || r.suggestedBy === 'trip_data');
      const isLoaded = matchedVeh?.status === 'LOADED';

      let dutyText = r.vehicleNo ? 'Free in Yard (Idle)' : '—';
      if (isOnTrip) {
        const dest = matchedVeh?.activeTrip?.destination || r.evidence?.find(e => e.type === 'voucher')?.detail || 'On Active Trip';
        dutyText = `On Trip: ${dest}`;
      } else if (isLoaded) {
        dutyText = 'Loaded in Yard';
      }

      let liveStatus = 'unmarked';
      let liveLabel = 'Unmarked';
      let liveColor = 'var(--text-muted)';

      if (r.status === 'present') {
        if (isOnTrip) {
          liveStatus = 'trip';
          liveLabel = 'On Trip / Duty';
          liveColor = '#3b82f6';
        } else {
          liveStatus = 'present';
          liveLabel = 'Present in Yard';
          liveColor = '#10b981';
        }
      } else if (r.status === 'half_day') {
        liveStatus = 'half_day';
        liveLabel = 'Half Day';
        liveColor = '#f59e0b';
      } else if (r.status === 'leave') {
        liveStatus = 'leave';
        liveLabel = 'On Leave';
        liveColor = '#8b5cf6';
      } else if (r.status === 'absent') {
        liveStatus = 'absent';
        liveLabel = 'Absent / At Home';
        liveColor = '#ef4444';
      } else {
        if (isOnTrip) {
          liveStatus = 'trip';
          liveLabel = 'On Trip (Auto)';
          liveColor = '#3b82f6';
        } else {
          liveStatus = 'unmarked';
          liveLabel = 'Unmarked (Pending)';
          liveColor = 'var(--text-muted)';
        }
      }

      const rawTime = r.punchTime || r.inTime || r.markedAt;
      const punchTimeFormatted = rawTime
        ? new Date(rawTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
        : (r.inTime || (r.status ? 'Marked' : '—'));

      const isTerminal = r.source === 'terminal' || r.terminalId || r.method === 'face' || r.method === 'fingerprint';
      const punchMethod = r.method === 'fingerprint' ? 'OTG Fingerprint' :
                          r.method === 'face' ? 'Face Verification' :
                          (isTerminal ? 'Terminal Kiosk' : (r.source === 'derived' ? 'Trip Voucher' : (r.status ? 'Supervisor Mark' : 'No punch')));

      return {
        ...r,
        attendanceEnabled,
        matchedVeh,
        isOnTrip,
        dutyText,
        liveStatus,
        liveLabel,
        liveColor,
        punchTimeFormatted,
        isTerminal,
        punchMethod,
      };
    });
  }, [roster, vehicles, profiles]);

  const filteredPresence = useMemo(() => {
    return presenceList.filter(row => {
      if (presenceRoleFilter !== 'all' && (row.type || 'Staff') !== presenceRoleFilter) return false;
      if (presenceStatusFilter !== 'all') {
        if (presenceStatusFilter === 'stopped' && row.attendanceEnabled) return false;
        if (presenceStatusFilter === 'present' && row.liveStatus !== 'present') return false;
        if (presenceStatusFilter === 'trip' && row.liveStatus !== 'trip') return false;
        if (presenceStatusFilter === 'leave' && row.liveStatus !== 'leave') return false;
        if (presenceStatusFilter === 'absent' && row.liveStatus !== 'absent') return false;
        if (presenceStatusFilter === 'half_day' && row.liveStatus !== 'half_day') return false;
        if (presenceStatusFilter === 'unmarked' && row.liveStatus !== 'unmarked') return false;
      }
      if (presenceSearch.trim()) {
        const q = presenceSearch.toLowerCase();
        const name = (row.name || '').toLowerCase();
        const truck = (row.vehicleNo || '').toLowerCase();
        const role = (row.type || '').toLowerCase();
        const phone = (row.phone || '').toLowerCase();
        if (!name.includes(q) && !truck.includes(q) && !role.includes(q) && !phone.includes(q)) return false;
      }
      return true;
    });
  }, [presenceList, presenceRoleFilter, presenceStatusFilter, presenceSearch]);

  const presenceStats = useMemo(() => {
    const total = presenceList.length;
    const presentYard = presenceList.filter(p => p.liveStatus === 'present').length;
    const onTrip = presenceList.filter(p => p.liveStatus === 'trip').length;
    const onLeave = presenceList.filter(p => p.liveStatus === 'leave').length;
    const absent = presenceList.filter(p => p.liveStatus === 'absent').length;
    const halfDay = presenceList.filter(p => p.liveStatus === 'half_day').length;
    const unmarked = presenceList.filter(p => p.liveStatus === 'unmarked' && p.attendanceEnabled).length;
    return { total, presentYard, onTrip, onLeave, absent, halfDay, unmarked };
  }, [presenceList]);

  const filteredLogs = useMemo(() => {
    // 1. Separate individual punch records from daily summaries
    const punchLogs = logs.filter(l => l.isPunchLog || (l.id && l.id.startsWith('punch_')));
    const punchedProfileDates = new Set(punchLogs.map(l => `${l.profileId || l.id}_${l.date}`));

    // 2. Include other records (e.g. manual portal roll-calls) only if no terminal punch exists for that person/day
    const otherLogs = logs.filter(l => {
      if (l.isPunchLog || (l.id && l.id.startsWith('punch_'))) return false;
      // Skip duplicate backward-compatible summary documents
      if (l.id && l.date && l.id.startsWith(l.date + '_')) return false;
      if (l.isDailySummary && punchedProfileDates.has(`${l.profileId || l.id}_${l.date}`)) return false;
      return true;
    });

    // 3. Deduplicate by unique punch signature: profileId + terminalTime/punchTime + status
    const seen = new Set();
    const uniqueLogs = [];
    for (const log of [...punchLogs, ...otherLogs]) {
      const pId = log.profileId || log.id || '';
      const pTime = log.punchTime || log.terminalTime || log.inTime || log.createdAt || '';
      const key = log.isPunchLog ? log.id : `${pId}_${log.date}_${pTime}_${log.status}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueLogs.push(log);
      }
    }

    return uniqueLogs.filter(log => {
      const isTerminal = log.source === 'terminal' || log.terminalId || log.method === 'face' || log.method === 'fingerprint' || log.id?.startsWith('emp_') || log.isPunchLog;
      if (sourceFilter === 'terminal' && !isTerminal) return false;
      if (statusFilter !== 'all' && log.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const name = (log.profileName || '').toLowerCase();
        const role = (log.profileType || '').toLowerCase();
        if (!name.includes(q) && !role.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      const timeA = a.punchTime || a.terminalTime || a.inTime || a.createdAt || '';
      const timeB = b.punchTime || b.terminalTime || b.inTime || b.createdAt || '';
      return String(timeB).localeCompare(String(timeA));
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
    const absentCount = filteredLogs.filter(l => l.status === 'absent' || l.status === 'leave').length;
    const terminalCount = filteredLogs.filter(l => l.source === 'terminal' || l.terminalId || l.method === 'face' || l.method === 'fingerprint' || l.id?.startsWith('emp_') || l.isPunchLog).length;
    const totalEnrolled = profiles.length;
    const faceEnrolledCount = profiles.filter(p => p.facePhoto || p.photo || p.photoUrl || p.faceEnrolled || (p.photos && p.photos.length > 0) || (p.faceEmbedding && p.faceEmbedding.length > 0)).length;
    const fpEnrolledCount = profiles.filter(p => p.fingerprintEnrolled || p.fingerprintSlotId != null).length;
    return { presentCount, halfDayCount, absentCount, terminalCount, totalEnrolled, faceEnrolledCount, fpEnrolledCount };
  }, [filteredLogs, profiles]);

  const handleExportExcel = () => {
    if (activeTab === 'presence') {
      const exportData = filteredPresence.map((r, i) => ({
        'S.No': i + 1,
        'Date': selectedDate,
        'Employee Name': r.name || 'Unknown',
        'Role/Department': r.type || 'Staff',
        'Phone': r.phone || '-',
        'Assigned Truck': r.vehicleNo || 'None',
        'Truck Status & Duty': r.dutyText || '-',
        'Presence Status': r.liveLabel || 'Unmarked',
        'Kiosk Punch Time': r.punchTimeFormatted || '-',
        'Punch Method': r.punchMethod || '-',
        'Supervisor Mark': r.status ? r.status.toUpperCase() : 'UNMARKED',
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `Presence_${selectedDate}`);
      XLSX.writeFile(wb, `VGTC_Presence_Attendance_${selectedDate}.xlsx`);
    } else if (activeTab === 'logs') {
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
        'Face Enrolled': (p.facePhoto || p.photo || p.faceEnrolled) ? 'Yes (Photo Saved)' : 'No',
        'Photos Count': p.photos ? p.photos.length : ((p.facePhoto || p.photo) ? 1 : 0),
        'Fingerprint Enrolled': p.fingerprintEnrolled ? 'Yes (Linked)' : 'No',
        'Attendance Access': p.attendanceEnabled === false ? 'Stopped' : 'Enabled',
        'Phone': p.phone || '-',
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Enrolled_Biometrics');
      XLSX.writeFile(wb, 'VGTC_Biometric_Enrollment_List.xlsx');
    }
  };

  const changeDateBy = (delta) => {
    const parts = (selectedDate || getTodayIST()).split('-').map(Number);
    const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    d.setUTCDate(d.getUTCDate() + delta);
    setSelectedDate(d.toISOString().slice(0, 10));
  };
  const isToday = selectedDate === getTodayIST();

  return (
    <div className="adm adm-page" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Page Header ── */}
      <div className="adm-head" style={{ flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="adm-icon-tile" style={{ background: 'rgba(99,102,241,0.12)', color: '#6366f1', borderRadius: '12px', padding: '8px' }}>
              <ScanFace size={22} />
            </span>
            Attendance Terminal &amp; Biometrics Hub
          </h1>
          <p style={{ marginTop: '4px', fontSize: '13px', color: 'var(--text-muted)' }}>
            Unified live workforce presence, duty tracking, biometric kiosk punches &amp; face enrollment
          </p>
        </div>

        {/* Tab switchers */}
        <div className="adm-head-actions">
          <div style={{ display: 'flex', gap: 6, background: 'var(--bg-th)', padding: 5, borderRadius: 12, border: '1px solid var(--border)' }}>
            <button
              type="button"
              onClick={() => { setActiveTab('presence'); fetchRoster(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 16px', borderRadius: 9, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 700,
                background: activeTab === 'presence' ? 'var(--primary, #6366f1)' : 'transparent',
                color: activeTab === 'presence' ? '#fff' : 'var(--text-muted)',
                boxShadow: activeTab === 'presence' ? '0 2px 8px rgba(99,102,241,0.3)' : 'none',
                transition: 'all 0.18s ease',
              }}
            >
              <UserCheck size={16} />
              Daily Presence &amp; Attendance ({presenceList.length})
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('logs'); fetchLogs(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 16px', borderRadius: 9, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 700,
                background: activeTab === 'logs' ? 'var(--primary, #6366f1)' : 'transparent',
                color: activeTab === 'logs' ? '#fff' : 'var(--text-muted)',
                boxShadow: activeTab === 'logs' ? '0 2px 8px rgba(99,102,241,0.3)' : 'none',
                transition: 'all 0.18s ease',
              }}
            >
              <Clock size={16} />
              Terminal Punch Logs ({filteredLogs.length})
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('enrolled'); fetchProfiles(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 16px', borderRadius: 9, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 700,
                background: activeTab === 'enrolled' ? 'var(--primary, #6366f1)' : 'transparent',
                color: activeTab === 'enrolled' ? '#fff' : 'var(--text-muted)',
                boxShadow: activeTab === 'enrolled' ? '0 2px 8px rgba(99,102,241,0.3)' : 'none',
                transition: 'all 0.18s ease',
              }}
            >
              <Fingerprint size={16} />
              Profiles & Attendance ({profiles.length})
            </button>
          </div>
        </div>
      </div>

      {/* ── KPI Stats Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
        {activeTab === 'presence' ? (
          <>
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderTop: '3px solid #6366f1',
              borderRadius: '14px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Total Workforce
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--text)', marginTop: 4, letterSpacing: '-0.02em' }}>
                  {presenceStats.total}
                </div>
              </div>
              <div style={{
                width: 42, height: 42, borderRadius: 12,
                background: 'rgba(99,102,241,0.12)', color: '#6366f1',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <UserCheck size={22} />
              </div>
            </div>

            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderTop: '3px solid #10b981',
              borderRadius: '14px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Present in Yard
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#10b981', marginTop: 4, letterSpacing: '-0.02em' }}>
                  {presenceStats.presentYard}
                </div>
              </div>
              <div style={{
                width: 42, height: 42, borderRadius: 12,
                background: 'rgba(16,185,129,0.12)', color: '#10b981',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <CheckCircle2 size={22} />
              </div>
            </div>

            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderTop: '3px solid #3b82f6',
              borderRadius: '14px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  On Trip / Duty
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#3b82f6', marginTop: 4, letterSpacing: '-0.02em' }}>
                  {presenceStats.onTrip}
                </div>
              </div>
              <div style={{
                width: 42, height: 42, borderRadius: 12,
                background: 'rgba(59,130,246,0.12)', color: '#3b82f6',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Truck size={22} />
              </div>
            </div>

            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderTop: '3px solid #8b5cf6',
              borderRadius: '14px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  On Leave
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#8b5cf6', marginTop: 4, letterSpacing: '-0.02em' }}>
                  {presenceStats.onLeave}
                </div>
              </div>
              <div style={{
                width: 42, height: 42, borderRadius: 12,
                background: 'rgba(139,92,246,0.12)', color: '#8b5cf6',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Calendar size={22} />
              </div>
            </div>

            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderTop: '3px solid #ef4444',
              borderRadius: '14px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Absent / At Home
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#ef4444', marginTop: 4, letterSpacing: '-0.02em' }}>
                  {presenceStats.absent} {presenceStats.unmarked > 0 && <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>({presenceStats.unmarked} pending)</span>}
                </div>
              </div>
              <div style={{
                width: 42, height: 42, borderRadius: 12,
                background: 'rgba(239,68,68,0.12)', color: '#ef4444',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Home size={22} />
              </div>
            </div>
          </>
        ) : activeTab === 'logs' ? (
          <>
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderTop: '3px solid #6366f1',
              borderRadius: '14px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Terminal Punches
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--text)', marginTop: 4, letterSpacing: '-0.02em' }}>
                  {stats.terminalCount}
                </div>
              </div>
              <div style={{
                width: 42, height: 42, borderRadius: 12,
                background: 'rgba(99,102,241,0.12)', color: '#6366f1',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Smartphone size={22} />
              </div>
            </div>

            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderTop: '3px solid #10b981',
              borderRadius: '14px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Present
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#10b981', marginTop: 4, letterSpacing: '-0.02em' }}>
                  {stats.presentCount}
                </div>
              </div>
              <div style={{
                width: 42, height: 42, borderRadius: 12,
                background: 'rgba(16,185,129,0.12)', color: '#10b981',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <CheckCircle2 size={22} />
              </div>
            </div>

            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderTop: '3px solid #f59e0b',
              borderRadius: '14px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Half Day
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#f59e0b', marginTop: 4, letterSpacing: '-0.02em' }}>
                  {stats.halfDayCount}
                </div>
              </div>
              <div style={{
                width: 42, height: 42, borderRadius: 12,
                background: 'rgba(245,158,11,0.12)', color: '#f59e0b',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Clock size={22} />
              </div>
            </div>

            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderTop: '3px solid #ef4444',
              borderRadius: '14px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Absent / Leave
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#ef4444', marginTop: 4, letterSpacing: '-0.02em' }}>
                  {stats.absentCount}
                </div>
              </div>
              <div style={{
                width: 42, height: 42, borderRadius: 12,
                background: 'rgba(239,68,68,0.12)', color: '#ef4444',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <AlertCircle size={22} />
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderTop: '3px solid #6366f1',
              borderRadius: '14px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  VGTC Profiles
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--text)', marginTop: 4, letterSpacing: '-0.02em' }}>
                  {stats.totalEnrolled}
                </div>
              </div>
              <div style={{
                width: 42, height: 42, borderRadius: 12,
                background: 'rgba(99,102,241,0.12)', color: '#6366f1',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <ScanFace size={22} />
              </div>
            </div>

            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderTop: '3px solid #10b981',
              borderRadius: '14px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Face Enrolled
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#10b981', marginTop: 4, letterSpacing: '-0.02em' }}>
                  {stats.faceEnrolledCount} <span style={{ fontSize: 15, color: 'var(--text-muted)', fontWeight: 600 }}>/ {stats.totalEnrolled}</span>
                </div>
              </div>
              <div style={{
                width: 42, height: 42, borderRadius: 12,
                background: 'rgba(16,185,129,0.12)', color: '#10b981',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <ScanFace size={22} />
              </div>
            </div>

            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderTop: '3px solid #3b82f6',
              borderRadius: '14px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Fingerprint (OTG)
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#3b82f6', marginTop: 4, letterSpacing: '-0.02em' }}>
                  {stats.fpEnrolledCount} <span style={{ fontSize: 15, color: 'var(--text-muted)', fontWeight: 600 }}>/ {stats.totalEnrolled}</span>
                </div>
              </div>
              <div style={{
                width: 42, height: 42, borderRadius: 12,
                background: 'rgba(59,130,246,0.12)', color: '#3b82f6',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Fingerprint size={22} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Filter & Action Toolbar ── */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '14px',
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        {/* Left: Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1, minWidth: '320px' }}>
          {/* Common Date Navigator Pill for presence and logs */}
          {activeTab !== 'enrolled' && (
            <div style={{
              display: 'inline-flex', alignItems: 'center',
              background: 'var(--bg-th, rgba(255,255,255,0.04))',
              border: '1px solid var(--border)',
              borderRadius: '9px', padding: '2px 4px',
            }}>
              <button
                type="button"
                onClick={() => changeDateBy(-1)}
                title="Previous Day"
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  padding: '5px 8px', color: 'var(--text-muted)', borderRadius: '6px',
                  display: 'flex', alignItems: 'center',
                }}
              >
                <ChevronLeft size={16} />
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 4px' }}>
                <Calendar size={14} color="var(--primary, #6366f1)" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  style={{
                    border: 'none', background: 'transparent', color: 'var(--text)',
                    fontSize: '13px', fontWeight: 700, padding: '4px 2px',
                    outline: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => changeDateBy(1)}
                title="Next Day"
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  padding: '5px 8px', color: 'var(--text-muted)', borderRadius: '6px',
                  display: 'flex', alignItems: 'center',
                }}
              >
                <ChevronRight size={16} />
              </button>
              {!isToday && (
                <button
                  type="button"
                  onClick={() => setSelectedDate(getTodayIST())}
                  style={{
                    border: 'none', background: 'var(--primary, #6366f1)', color: '#fff',
                    fontSize: '11px', fontWeight: 800, padding: '3px 8px', borderRadius: '6px',
                    cursor: 'pointer', marginLeft: 4,
                  }}
                >
                  Today
                </button>
              )}
            </div>
          )}

          {activeTab === 'presence' ? (
            <>
              {/* Presence Status Filter */}
              <select
                value={presenceStatusFilter}
                onChange={(e) => setPresenceStatusFilter(e.target.value)}
                className="adm-select"
                style={{
                  width: 'auto', minWidth: 160, height: 38,
                  fontSize: 13, fontWeight: 600, paddingRight: 32,
                }}
              >
                <option value="all">All Statuses</option>
                <option value="present">Present in Yard</option>
                <option value="trip">On Trip / Duty</option>
                <option value="leave">On Leave</option>
                <option value="absent">Absent / At Home</option>
                <option value="half_day">Half Day</option>
                <option value="unmarked">Unmarked (Pending)</option>
                <option value="stopped">Attendance Stopped</option>
              </select>

              {/* Role Filter */}
              <select
                value={presenceRoleFilter}
                onChange={(e) => setPresenceRoleFilter(e.target.value)}
                className="adm-select"
                style={{
                  width: 'auto', minWidth: 130, height: 38,
                  fontSize: 13, fontWeight: 600, paddingRight: 32,
                }}
              >
                <option value="all">All Roles</option>
                <option value="Driver">Drivers</option>
                <option value="Staff">Staff</option>
                <option value="Labour">Labour</option>
                <option value="Helper">Helper</option>
                <option value="Manager">Manager</option>
              </select>

              {/* Search Box */}
              <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: '320px' }}>
                <Search size={15} color="var(--text-muted)" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input
                  type="text"
                  placeholder="Search name, truck, role, phone..."
                  value={presenceSearch}
                  onChange={(e) => setPresenceSearch(e.target.value)}
                  className="adm-input"
                  style={{
                    width: '100%', height: 38, paddingLeft: 34, paddingRight: 12,
                    fontSize: 13, fontWeight: 500, boxSizing: 'border-box',
                  }}
                />
              </div>
            </>
          ) : activeTab === 'logs' ? (
            <>
              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="adm-select"
                style={{
                  width: 'auto', minWidth: 140, height: 38,
                  fontSize: 13, fontWeight: 600, paddingRight: 32,
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
                className="adm-select"
                style={{
                  width: 'auto', minWidth: 175, height: 38,
                  fontSize: 13, fontWeight: 600, paddingRight: 32,
                }}
              >
                <option value="all">All Sources (Kiosk + Web)</option>
                <option value="terminal">Kiosk Terminal Only</option>
              </select>

              {/* Search Box */}
              <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: '320px' }}>
                <Search size={15} color="var(--text-muted)" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input
                  type="text"
                  placeholder="Search employee, role or truck..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="adm-input"
                  style={{
                    width: '100%', height: 38, paddingLeft: 34, paddingRight: 12,
                    fontSize: 13, fontWeight: 500, boxSizing: 'border-box',
                  }}
                />
              </div>
            </>
          ) : (
            <>
              {/* Enrolled Tab Role Filter */}
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="adm-select"
                style={{
                  width: 'auto', minWidth: 130, height: 38,
                  fontSize: 13, fontWeight: 600, paddingRight: 32,
                }}
              >
                <option value="all">All Roles</option>
                <option value="Staff">Staff</option>
                <option value="Driver">Driver</option>
                <option value="Labour">Labour</option>
                <option value="Helper">Helper</option>
                <option value="Manager">Manager</option>
              </select>

              {/* Enrolled Search */}
              <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: '340px' }}>
                <Search size={15} color="var(--text-muted)" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input
                  type="text"
                  placeholder="Search enrolled staff, vehicle, or phone..."
                  value={enrolledSearch}
                  onChange={(e) => setEnrolledSearch(e.target.value)}
                  className="adm-input"
                  style={{
                    width: '100%', height: 38, paddingLeft: 34, paddingRight: 12,
                    fontSize: 13, fontWeight: 500, boxSizing: 'border-box',
                  }}
                />
              </div>
            </>
          )}
        </div>

        {/* Right: Actions */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {activeTab === 'presence' && presenceStats.unmarked > 0 && (
            <button
              type="button"
              className="adm-btn"
              onClick={handleMarkAllUnmarkedPresent}
              disabled={rosterLoading}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, height: 38, padding: '0 14px', borderRadius: 9,
                background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)',
                fontWeight: 700, fontSize: 12.5,
              }}
              title="Mark all unmarked personnel as present in yard"
            >
              <CheckCheck size={15} />
              Mark All Unmarked ({presenceStats.unmarked})
            </button>
          )}

          {activeTab !== 'enrolled' && (
            <button
              type="button"
              onClick={() => setAutoRefresh(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, height: 38,
                padding: '0 14px', borderRadius: 9,
                border: `1px solid ${autoRefresh ? (liveConnected ? 'rgba(16,185,129,0.35)' : 'rgba(245,158,11,0.35)') : 'var(--border)'}`,
                background: autoRefresh ? (liveConnected ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)') : 'var(--bg-th)',
                color: autoRefresh ? (liveConnected ? '#10b981' : '#f59e0b') : 'var(--text-muted)',
                fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
              }}
            >
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: autoRefresh ? (liveConnected ? '#10b981' : '#f59e0b') : 'var(--text-muted)',
                boxShadow: autoRefresh ? `0 0 8px ${liveConnected ? '#10b981' : '#f59e0b'}` : 'none',
                display: 'inline-block',
              }} />
              {autoRefresh ? (liveConnected ? 'Live Sync Connected' : 'Live Sync Reconnecting') : 'Live Paused'}
            </button>
          )}


          {activeTab === 'enrolled' && (
            <>
              {selectedProfileIds.length > 0 ? (
                <>
                  <button
                    type="button"
                    className="adm-btn"
                    disabled={attendanceControlBusy}
                    onClick={() => changeAttendanceAccess(selectedProfileIds, false)}
                    style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', borderColor: '#ef4444', fontWeight: 700 }}
                  >
                    Stop Attendance ({selectedProfileIds.length})
                  </button>
                  <button
                    type="button"
                    className="adm-btn"
                    disabled={attendanceControlBusy}
                    onClick={() => changeAttendanceAccess(selectedProfileIds, true)}
                    style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', borderColor: '#10b981', fontWeight: 700 }}
                  >
                    Resume Attendance ({selectedProfileIds.length})
                  </button>
                  <button
                    type="button"
                    className="adm-btn"
                    onClick={() => setSelectedProfileIds([])}
                    style={{ fontSize: 12 }}
                  >
                    Clear ({selectedProfileIds.length})
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="adm-btn"
                    disabled={attendanceControlBusy || profiles.length === 0}
                    onClick={() => {
                      if (window.confirm(`Are you sure you want to STOP attendance for all ${profiles.length} profiles?`)) {
                        changeAttendanceAccess(profiles.map(p => p.id), false);
                      }
                    }}
                    style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', borderColor: 'rgba(239,68,68,0.35)', fontWeight: 700 }}
                    title="Stop attendance punches for every employee profile"
                  >
                    🚫 Stop All Attendance
                  </button>
                  <button
                    type="button"
                    className="adm-btn"
                    disabled={attendanceControlBusy || profiles.length === 0}
                    onClick={() => {
                      if (window.confirm(`Resume attendance for all ${profiles.length} profiles?`)) {
                        changeAttendanceAccess(profiles.map(p => p.id), true);
                      }
                    }}
                    style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981', borderColor: 'rgba(16,185,129,0.35)', fontWeight: 700 }}
                    title="Resume/allow attendance punches for all employee profiles"
                  >
                    ✓ Resume All Attendance
                  </button>
                </>
              )}
            </>
          )}

          <button
            type="button"
            className="adm-btn"
            onClick={activeTab === 'presence' ? () => fetchRoster(false) : (activeTab === 'logs' ? () => fetchLogs(false) : fetchProfiles)}
            disabled={loading || rosterLoading}
            style={{ display: 'flex', alignItems: 'center', gap: 7, height: 38, padding: '0 14px', borderRadius: 9 }}
          >
            <RefreshCw size={14} className={(loading || rosterLoading) ? 'adm-spin' : ''} />
            Refresh
          </button>

          <button
            type="button"
            className="adm-btn adm-btn--primary"
            onClick={handleExportExcel}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, height: 38,
              padding: '0 16px', borderRadius: 9,
              background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none',
              boxShadow: '0 2px 8px rgba(245,158,11,0.25)',
            }}
          >
            <Download size={14} />
            Export Excel
          </button>
        </div>
      </div>

      {/* ══════════════════════ CONTENT AREA ══════════════════════ */}

      {attendanceControlMessage && <p role="status" className="adm-sub">{attendanceControlMessage}</p>}
      {activeTab === 'enrolled' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 18 }}>
          <div className="adm-panel" style={{ padding: '16px 20px', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14 }}>
            {/* Quick Global Attendance Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="adm-btn"
                style={{ background: '#ef4444', color: '#fff', border: 'none', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 10, cursor: 'pointer' }}
                onClick={handleStopAll}
                disabled={attendanceControlBusy || filteredProfiles.length === 0}
                title="Stop attendance for all displayed profiles"
              >
                <Power size={16} /> Stop All Attendance ({filteredProfiles.length})
              </button>

              <button
                type="button"
                className="adm-btn"
                style={{ background: '#10b981', color: '#fff', border: 'none', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 10, cursor: 'pointer' }}
                onClick={handleResumeAll}
                disabled={attendanceControlBusy || filteredProfiles.length === 0}
                title="Resume attendance for all displayed profiles"
              >
                <Play size={16} /> Resume All Attendance
              </button>

              <button
                type="button"
                className="adm-btn"
                style={{ background: 'var(--primary, #6366f1)', color: '#fff', border: 'none', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, cursor: 'pointer' }}
                onClick={() => setShowAddModal(true)}
              >
                <UserPlus size={16} /> Add from VGTC Staff / Drivers
              </button>
            </div>

            {/* Terminal Device API Key Card */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-th, rgba(99,102,241,0.06))', padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}>
                <Key size={15} color="var(--primary)" />
                <span>Terminal API Key:</span>
                <code style={{ background: 'var(--bg-card)', padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12.5, fontWeight: 800, color: 'var(--primary)' }}>
                  {terminalKey}
                </code>
              </div>
              <button
                type="button"
                className="adm-btn adm-btn--sm"
                onClick={copyKeyToClipboard}
                title="Copy Terminal API key for Android app"
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px' }}
              >
                {keyCopied ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                {keyCopied ? 'Copied!' : 'Copy'}
              </button>
              <button
                type="button"
                className="adm-btn adm-btn--sm"
                onClick={handleGenerateKey}
                disabled={keyBusy}
                title="Generate new API key"
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px' }}
              >
                <RefreshCw size={13} className={keyBusy ? 'spin' : ''} />
                Generate
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'presence' ? (
        /* ── Daily Presence & Attendance Table ── */
        <div className="adm-table-wrap">
          <table className="adm-table" style={{ width: '100%', minWidth: '980px' }}>
            <thead>
              <tr>
                <th style={{ width: '22%' }}>Employee Details</th>
                <th style={{ width: '12%' }}>Role / Dept</th>
                <th style={{ width: '18%' }}>Assigned Truck &amp; Duty</th>
                <th style={{ width: '18%' }}>Live Presence Status</th>
                <th style={{ width: '14%' }}>Kiosk Punch / Time</th>
                <th style={{ width: '16%', textAlign: 'center' }}>Roll-Call Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPresence.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                    <UserCheck size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.35 }} />
                    <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text)' }}>
                      No personnel match the selected filters for {selectedDate}
                    </div>
                    <div style={{ fontSize: '12.5px', marginTop: '6px' }}>
                      Try clearing filters or changing the date.
                    </div>
                  </td>
                </tr>
              ) : (
                filteredPresence.map((row, idx) => {
                  const isDriver = (row.type || '').toLowerCase() === 'driver';
                  const matchedProfile = profiles.find(p => p.id === row.profileId || p.name?.toLowerCase() === row.name?.toLowerCase());
                  const photoUrl = row.photo || matchedProfile?.photo || (matchedProfile?.photos && matchedProfile.photos[0]);
                  const isBusy = markingId === row.profileId;

                  return (
                    <tr
                      key={row.profileId || idx}
                      onClick={() => setTimelineProfile({ ...matchedProfile, ...row, id: row.profileId, name: row.name, profileType: row.type || matchedProfile?.profileType })}
                      title="Open complete attendance timeline"
                      style={{ opacity: isBusy ? 0.6 : 1, cursor: 'pointer' }}
                    >
                      {/* Employee Details */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          {photoUrl ? (
                            <EnrollmentImage
                              src={photoUrl}
                              alt=""
                              style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(99,102,241,0.3)', flexShrink: 0 }}
                            />
                          ) : (
                            <div style={{
                              width: 40, height: 40, borderRadius: '50%',
                              background: isDriver ? 'rgba(139,92,246,0.12)' : 'rgba(99,102,241,0.12)',
                              color: isDriver ? '#8b5cf6' : '#6366f1',
                              fontWeight: 800, fontSize: 15,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              flexShrink: 0, border: '1px solid var(--border)'
                            }}>
                              {(row.name || 'U').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 800, fontSize: '13.5px', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {row.name}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 2 }}>
                              {row.phone ? `📞 ${row.phone}` : (row.department || 'General')}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role / Dept */}
                      <td>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center',
                          padding: '3px 9px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700,
                          background: isDriver ? 'rgba(139,92,246,0.12)' : 'rgba(59,130,246,0.12)',
                          color: isDriver ? '#8b5cf6' : '#3b82f6',
                          border: `1px solid ${isDriver ? 'rgba(139,92,246,0.25)' : 'rgba(59,130,246,0.25)'}`,
                        }}>
                          {row.type || 'Staff'}
                        </span>
                      </td>

                      {/* Assigned Truck & Duty */}
                      <td>
                        {row.vehicleNo ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <span style={{
                              fontWeight: 800, fontSize: '12px', color: 'var(--text)',
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                            }}>
                              🚛 {row.vehicleNo}
                            </span>
                            <span style={{
                              fontSize: '11px', fontWeight: 600,
                              color: row.isOnTrip ? '#3b82f6' : row.matchedVeh?.status === 'LOADED' ? '#f59e0b' : 'var(--text-muted)'
                            }}>
                              {row.dutyText}
                            </span>
                          </div>
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>

                      {/* Live Presence Status */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '4px 10px', borderRadius: 20, fontSize: '11.5px', fontWeight: 800,
                            background: `${row.liveColor}16`,
                            color: row.liveColor,
                            border: `1px solid ${row.liveColor}35`,
                          }}>
                            {row.liveStatus === 'present' && <CheckCircle2 size={13} />}
                            {row.liveStatus === 'trip' && <Truck size={13} />}
                            {row.liveStatus === 'half_day' && <Clock size={13} />}
                            {row.liveStatus === 'leave' && <Calendar size={13} />}
                            {row.liveStatus === 'absent' && <Home size={13} />}
                            {row.liveStatus === 'unmarked' && <AlertCircle size={13} />}
                            {row.liveLabel.toUpperCase()}
                          </span>
                          {row.idleWarning && (
                            <span style={{
                              fontSize: '10px', fontWeight: 700, color: '#f59e0b',
                              background: 'rgba(245,158,11,0.12)', padding: '2px 6px',
                              borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 3
                            }}>
                              ⚠️ {row.idleReason || 'Idle Warning'}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Kiosk Punch / Time */}
                      <td>
                        <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text)' }}>
                          {row.punchTimeFormatted}
                        </div>
                        <div style={{
                          fontSize: '10.5px', color: 'var(--text-muted)', marginTop: 2,
                          display: 'inline-flex', alignItems: 'center', gap: 4
                        }}>
                          {row.isTerminal ? <Smartphone size={11} color="var(--primary)" /> : null}
                          {row.punchMethod}
                        </div>
                      </td>

                      {/* Roll-Call Actions */}
                      <td style={{ textAlign: 'center' }}>
                        <button type="button" className="adm-btn adm-btn--sm" disabled={attendanceControlBusy}
                          onClick={event => { event.stopPropagation(); changeAttendanceAccess([row.profileId], !row.attendanceEnabled); }}
                          style={{ marginBottom: 6 }}>
                          {row.attendanceEnabled ? 'Stop attendance' : 'Start attendance'}
                        </button>
                        {!row.attendanceEnabled && <div style={{ color: '#dc2626', fontWeight: 700, marginBottom: 6 }}>Attendance stopped</div>}
                        <div style={{ display: 'inline-flex', gap: 4, background: 'var(--bg-th)', padding: 3, borderRadius: 8, border: '1px solid var(--border)' }}>
                          <button
                            type="button"
                            disabled={isBusy || !row.attendanceEnabled}
                            onClick={(event) => { event.stopPropagation(); handleQuickMark(row, 'present'); }}
                            title="Mark Present in Yard"
                            style={{
                              padding: '5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                              fontSize: 11, fontWeight: 800,
                              background: row.status === 'present' ? '#10b981' : 'transparent',
                              color: row.status === 'present' ? '#fff' : 'var(--text-muted)',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            P
                          </button>
                          <button
                            type="button"
                            disabled={isBusy || !row.attendanceEnabled}
                            onClick={(event) => { event.stopPropagation(); handleQuickMark(row, 'half_day'); }}
                            title="Mark Half Day"
                            style={{
                              padding: '5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                              fontSize: 11, fontWeight: 800,
                              background: row.status === 'half_day' ? '#f59e0b' : 'transparent',
                              color: row.status === 'half_day' ? '#fff' : 'var(--text-muted)',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            HD
                          </button>
                          <button
                            type="button"
                            disabled={isBusy || !row.attendanceEnabled}
                            onClick={(event) => { event.stopPropagation(); handleQuickMark(row, 'leave'); }}
                            title="Mark On Leave"
                            style={{
                              padding: '5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                              fontSize: 11, fontWeight: 800,
                              background: row.status === 'leave' ? '#8b5cf6' : 'transparent',
                              color: row.status === 'leave' ? '#fff' : 'var(--text-muted)',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            Leave
                          </button>
                          <button
                            type="button"
                            disabled={isBusy || !row.attendanceEnabled}
                            onClick={(event) => { event.stopPropagation(); handleQuickMark(row, 'absent'); }}
                            title="Mark Absent / At Home"
                            style={{
                              padding: '5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                              fontSize: 11, fontWeight: 800,
                              background: row.status === 'absent' ? '#ef4444' : 'transparent',
                              color: row.status === 'absent' ? '#fff' : 'var(--text-muted)',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            Abs
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Table Footer Summary */}
          {filteredPresence.length > 0 && (
            <div className="adm-table-footer">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span>Showing <strong>{filteredPresence.length}</strong> personnel on {selectedDate}</span>
                {filteredPresence.length !== presenceList.length && (
                  <span style={{ color: 'var(--text-muted)' }}>(filtered from {presenceList.length} total)</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981' }} />
                  {presenceStats.presentYard} In Yard
                </span>
                <span style={{ color: '#3b82f6', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3b82f6' }} />
                  {presenceStats.onTrip} On Trip
                </span>
                <span style={{ color: '#8b5cf6', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#8b5cf6' }} />
                  {presenceStats.onLeave} On Leave
                </span>
                <span style={{ color: '#ef4444', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444' }} />
                  {presenceStats.absent} Absent
                </span>
                {presenceStats.unmarked > 0 && (
                  <span style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--text-muted)' }} />
                    {presenceStats.unmarked} Pending
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      ) : activeTab === 'logs' ? (
        /* ── Punch Logs Table (Full Width & Responsive) ── */
        <div className="adm-table-wrap">
          <table className="adm-table" style={{ width: '100%', minWidth: '880px' }}>
            <thead>
              <tr>
                <th style={{ width: '16%' }}>Punch Time</th>
                <th style={{ width: '26%' }}>Employee Name</th>
                <th style={{ width: '14%' }}>Role / Dept</th>
                <th style={{ width: '14%' }}>Status &amp; Duty</th>
                <th style={{ width: '15%' }}>Punch Source</th>
                <th style={{ width: '15%' }}>Punch Method</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                    <Clock size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.35 }} />
                    <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text)' }}>
                      No punch logs recorded for {selectedDate}
                    </div>
                    <div style={{ fontSize: '12.5px', marginTop: '6px' }}>
                      Terminal punches or supervisor roll-calls for this day will appear here automatically.
                    </div>
                    {!isToday && (
                      <button
                        type="button"
                        onClick={() => setSelectedDate(getTodayIST())}
                        style={{
                          marginTop: '14px', padding: '6px 14px', borderRadius: '8px',
                          border: '1px solid var(--primary)', background: 'transparent',
                          color: 'var(--primary)', fontWeight: 700, fontSize: '12px', cursor: 'pointer',
                        }}
                      >
                        View Today's Punches
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log, idx) => {
                  const statusColor =
                    log.status === 'duty_continues' ? '#6366f1' :
                    log.status === 'present' ? '#10b981' :
                    log.status === 'half_day' ? '#f59e0b' : '#ef4444';

                  const rawTime = log.punchTime || log.terminalTime || log.inTime || log.markedAt || log.createdAt || (log.updatedAt?.seconds ? log.updatedAt.seconds * 1000 : log.updatedAt);
                  const punchTime = formatPunchTime(rawTime);

                  const isTerminal = log.source === 'terminal' || log.terminalId || log.method === 'face' || log.method === 'fingerprint' || log.id?.startsWith('emp_');

                  const punchMethod = log.method === 'fingerprint' ? 'OTG Fingerprint' :
                                      log.method === 'face' ? 'Face Verification' :
                                      log.method === 'manual' ? 'Terminal Direct' :
                                      (isTerminal ? 'Kiosk Auto-Punch' : 'Supervisor Roll-Call');

                  const matchedProfile = profiles.find(p => p.id === log.profileId || p.name?.toLowerCase() === log.profileName?.toLowerCase());
                  const photoUrl = imageUrl(log.photo || matchedProfile?.photo || matchedProfile?.facePhoto || matchedProfile?.photoUrl || (matchedProfile?.photos && matchedProfile.photos[0]));
                  const assignedVeh = log.vehicleNo || matchedProfile?.vehicleNo;
                  const roleType = log.profileType || matchedProfile?.profileType || 'Staff';
                  const isDriver = roleType.toLowerCase() === 'driver';

                  return (
                    <tr
                      key={log.id || idx}
                      onClick={() => setTimelineProfile({ ...matchedProfile, id: log.profileId, name: log.profileName || matchedProfile?.name, profileName: log.profileName, profileType: roleType, vehicleNo: assignedVeh })}
                      title="Open complete attendance timeline"
                      style={{ cursor: 'pointer' }}
                    >
                      {/* Punch Time */}
                      <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <Clock size={14} color="var(--primary, #6366f1)" />
                          <span style={{ fontSize: '13.5px', color: 'var(--text)' }}>{punchTime}</span>
                        </div>
                        {log.inTime && (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', marginLeft: '21px' }}>
                            In: {log.inTime} {log.outTime ? `| Out: ${log.outTime}` : ''}
                          </div>
                        )}
                      </td>

                      {/* Employee Name & Truck */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          {photoUrl ? (
                            <EnrollmentImage
                              src={photoUrl}
                              alt=""
                              style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(99,102,241,0.4)', flexShrink: 0 }}
                            />
                          ) : (
                            <div style={{
                              width: 38, height: 38, borderRadius: '50%',
                              background: 'rgba(99,102,241,0.12)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontWeight: 800, color: '#818cf8', fontSize: 14, flexShrink: 0,
                              border: '1px solid rgba(99,102,241,0.25)',
                            }}>
                              {(log.profileName || 'U').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 800, fontSize: '13.5px', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {log.profileName || 'Unknown Employee'}
                            </div>
                            {matchedProfile?.attendanceEnabled === false && <div style={{ color: '#dc2626', fontSize: 11, fontWeight: 700 }}>Attendance currently stopped</div>}
                            {assignedVeh && (
                              <div style={{ fontSize: '11px', color: '#3b82f6', fontWeight: 700, marginTop: '2px' }}>
                                🚛 {assignedVeh}
                              </div>
                            )}
                          </div>
                        </div>
                        <div style={{ fontSize: '11px', color: '#0d9488', fontWeight: 700, marginTop: 3 }}>
                          📍 {log.location || (isDriver ? 'Yard' : 'Office')}
                        </div>
                      </td>

                      {/* Role / Department */}
                      <td>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center',
                          padding: '3px 9px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700,
                          background: isDriver ? 'rgba(139,92,246,0.12)' : 'rgba(59,130,246,0.12)',
                          color: isDriver ? '#8b5cf6' : '#3b82f6',
                          border: `1px solid ${isDriver ? 'rgba(139,92,246,0.25)' : 'rgba(59,130,246,0.25)'}`,
                        }}>
                          {roleType}
                        </span>
                      </td>

                      {/* Status & Duty */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '3px 10px', borderRadius: 20, fontSize: '11.5px', fontWeight: 800,
                            background: `${statusColor}18`,
                            color: statusColor,
                            border: `1px solid ${statusColor}40`,
                          }}>
                            {log.status === 'present' ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                            {(log.status || 'present').toUpperCase()}
                          </span>
                          {(log.terminalEvent === 'EMERGENCY_EXIT' || log.dutyState === 'EMERGENCY_LEAVE' || log.dutyState === 'emergency_leave') ? (
                            <span style={{
                              fontSize: '10.5px', fontWeight: 800, color: '#dc2626',
                              background: 'rgba(239,68,68,0.12)', padding: '2px 7px',
                              borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: 3
                            }}>
                              🚨 Emergency Exit
                            </span>
                          ) : (log.terminalEvent === 'CHECK_OUT' || log.dutyState === 'COMPLETED' || log.dutyState === 'OFF_DUTY') ? (
                            <span style={{
                              fontSize: '10.5px', fontWeight: 800, color: '#2563eb',
                              background: 'rgba(37,99,235,0.12)', padding: '2px 7px',
                              borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: 3
                            }}>
                              🏁 Shift Complete
                            </span>
                          ) : log.terminalEvent === 'GATE_PASS' ? (
                            <span style={{
                              fontSize: '10.5px', fontWeight: 800, color: '#0d9488',
                              background: 'rgba(13,148,136,0.12)', padding: '2px 7px',
                              borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: 3
                            }}>
                              🚶 Gate Pass
                            </span>
                          ) : (log.dutyState === 'in_duty' || log.dutyState === 'IN_DUTY') && isDriver ? (
                            <span style={{
                              fontSize: '10.5px', fontWeight: 800, color: '#059669',
                              background: 'rgba(16,185,129,0.14)', padding: '2px 7px',
                              borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: 3
                            }}>
                              ⚡ Tour Active
                            </span>
                          ) : (log.terminalEvent === 'DUTY_CONTINUES' || log.status === 'duty_continues' || log.action === 'DUTY_CONTINUES') ? (
                            <span style={{
                              fontSize: '10.5px', fontWeight: 800, color: '#6366f1',
                              background: 'rgba(99,102,241,0.12)', padding: '2px 7px',
                              borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: 3
                            }}>
                              🔄 Duty Continues (Re-scan)
                            </span>
                          ) : log.terminalEvent === 'CHECK_IN' ? (
                            <span style={{
                              fontSize: '10.5px', fontWeight: 800, color: '#16a34a',
                              background: 'rgba(22,163,74,0.12)', padding: '2px 7px',
                              borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: 3
                            }}>
                              🟢 Shift In
                            </span>
                          ) : null}
                          {(log.note || log.overrideReason) && (
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.note || log.overrideReason}>
                              {log.note || log.overrideReason}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Punch Source */}
                      <td>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '4px 10px', borderRadius: 8, fontSize: '11.5px', fontWeight: 600,
                          background: isTerminal ? 'rgba(59,130,246,0.10)' : 'var(--bg-th)',
                          color: isTerminal ? '#3b82f6' : 'var(--text-muted)',
                          border: '1px solid var(--border)',
                        }}>
                          <Smartphone size={13} />
                          {isTerminal ? 'VGTC Terminal Kiosk' : 'Web Manual'}
                        </span>
                      </td>

                      {/* Punch Method */}
                      <td>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '12px',
                          color: log.method === 'fingerprint' ? '#10b981' : log.method === 'face' ? '#6366f1' : '#38bdf8',
                          fontWeight: 700,
                          background: log.method === 'fingerprint' ? 'rgba(16,185,129,0.08)' : log.method === 'face' ? 'rgba(99,102,241,0.08)' : 'rgba(56,189,248,0.08)',
                          padding: '4px 9px', borderRadius: '8px',
                          border: `1px solid ${log.method === 'fingerprint' ? 'rgba(16,185,129,0.2)' : log.method === 'face' ? 'rgba(99,102,241,0.2)' : 'rgba(56,189,248,0.2)'}`,
                        }}>
                          {log.method === 'fingerprint' ? <Fingerprint size={14} /> : log.method === 'face' ? <ScanFace size={14} /> : <Cpu size={14} />}
                          {punchMethod}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Table Footer Summary */}
          {filteredLogs.length > 0 && (
            <div className="adm-table-footer">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span>Showing <strong>{filteredLogs.length}</strong> punches on {selectedDate}</span>
                {filteredLogs.length !== logs.length && (
                  <span style={{ color: 'var(--text-muted)' }}>(filtered from {logs.length} total)</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981' }} />
                  {stats.presentCount} Present
                </span>
                {stats.halfDayCount > 0 && (
                  <span style={{ color: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b' }} />
                    {stats.halfDayCount} Half Day
                  </span>
                )}
                {stats.absentCount > 0 && (
                  <span style={{ color: '#ef4444', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444' }} />
                    {stats.absentCount} Absent
                  </span>
                )}
              </div>
            </div>
          )}
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
              <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text)' }}>No VGTC Profiles Found</h3>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                Use the VGTC Android Terminal app to enroll face photos and OTG fingerprints.
              </p>
            </div>
          ) : (
            filteredProfiles.map(p => {
              const primaryPhoto = imageUrl(enrollmentPhotos(p)[0]);
              const hasFace = !!(primaryPhoto || p.faceEnrolled || (p.faceEmbedding && p.faceEmbedding.length > 0));
              const photoCount = enrollmentPhotos(p).length;
              const hasFp = !!p.fingerprintEnrolled || p.fingerprintSlotId != null;

              return (
                <div
                  key={p.id}
                  className="adm-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => setTimelineProfile(p)}
                  onKeyDown={(event) => {
                    if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      setTimelineProfile(p);
                    }
                  }}
                  title="Open complete attendance timeline"
                  style={{
                    padding: 18, display: 'flex', flexDirection: 'column', gap: 14,
                    border: '1px solid var(--border)', borderRadius: 12,
                    transition: 'box-shadow 0.18s ease', cursor: 'pointer',
                  }}
                >
                  {/* Avatar + Name Row */}
                  <label onClick={event => event.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={selectedProfileIds.includes(p.id)}
                      onChange={event => setSelectedProfileIds(previous => event.target.checked ? [...new Set([...previous, p.id])] : previous.filter(id => id !== p.id))} />
                    Select {p.name}
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    {primaryPhoto ? (
                      <EnrollmentImage
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
                        {(p.name || '?').charAt(0).toUpperCase()}
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

                  {/* Attendance Active/Stopped Toggle Bar */}
                  <div
                    onClick={event => {
                      event.stopPropagation();
                      changeAttendanceAccess([p.id], p.attendanceEnabled === false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: 10,
                      background: p.attendanceEnabled === false ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                      border: `1.5px solid ${p.attendanceEnabled === false ? '#ef4444' : '#10b981'}`,
                      cursor: attendanceControlBusy ? 'wait' : 'pointer',
                      userSelect: 'none',
                      transition: 'all 0.15s ease'
                    }}
                    title={p.attendanceEnabled === false ? 'Click to Enable Attendance' : 'Click to Stop Attendance'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        width: 9, height: 9, borderRadius: '50%',
                        background: p.attendanceEnabled === false ? '#ef4444' : '#10b981',
                        boxShadow: `0 0 8px ${p.attendanceEnabled === false ? '#ef4444' : '#10b981'}`
                      }} />
                      <span style={{
                        fontWeight: 800, fontSize: '12px',
                        color: p.attendanceEnabled === false ? '#ef4444' : '#10b981'
                      }}>
                        {p.attendanceEnabled === false ? 'Attendance STOPPED' : 'Attendance ACTIVE'}
                      </span>
                    </div>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '3px 9px',
                      borderRadius: 6,
                      background: p.attendanceEnabled === false ? '#ef4444' : '#10b981',
                      color: '#fff'
                    }}>
                      {p.attendanceEnabled === false ? 'Resume' : 'Stop'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--primary, #6366f1)', fontSize: 11.5, fontWeight: 750 }}>
                    <Calendar size={13} />
                    Click card to view full attendance timeline
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    {photoCount > 0 && (
                      <button
                        type="button"
                        className="adm-btn adm-btn--sm"
                        style={{ flex: 1, justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 6 }}
                        onClick={(event) => { event.stopPropagation(); setViewingPhotoModal(p); }}
                      >
                        <Eye size={13} />
                        Photos ({photoCount})
                      </button>
                    )}
                    <button
                      type="button"
                      className="adm-btn adm-btn--sm"
                      style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px' }}
                      onClick={(event) => { event.stopPropagation(); handleDeleteProfile(p); }}
                      title="Permanently delete profile from VGTC"
                    >
                      <Trash2 size={13} />
                      Delete
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── Add from VGTC Staff / Drivers Modal ── */}
      {showAddModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: 20,
        }}>
          <div role="dialog" className="adm-panel" style={{ maxWidth: 540, width: '100%', borderRadius: 16 }}>
            <div className="adm-panel-hd">
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>
                  Add from VGTC Staff &amp; Drivers
                </h3>
                <p className="adm-sub">Select an existing VGTC person to activate for terminal attendance &amp; biometric enrollment.</p>
              </div>
              <button type="button" className="adm-btn adm-btn--sm" onClick={() => { setShowAddModal(false); setSelectedAddProfileId(''); }}>
                ✕
              </button>
            </div>
            <div className="adm-panel-bd" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 700 }}>
                  Select Staff / Driver:
                </label>
                <select
                  className="adm-input"
                  style={{ width: '100%', padding: '10px 12px', fontSize: 14 }}
                  value={selectedAddProfileId}
                  onChange={(e) => setSelectedAddProfileId(e.target.value)}
                >
                  <option value="">-- Choose employee from VGTC --</option>
                  {profiles
                    .filter(p => !p.type?.toLowerCase().includes('pump'))
                    .map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {p.profileType || p.department || p.type || 'Staff'} {p.vehicleNo ? `(🚛 ${p.vehicleNo})` : ''} {p.attendanceEnabled === false ? '[Attendance Stopped]' : '[Active]'}
                      </option>
                    ))}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button type="button" className="adm-btn" onClick={() => { setShowAddModal(false); setSelectedAddProfileId(''); }}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="adm-btn"
                  style={{ background: 'var(--primary, #6366f1)', color: '#fff', border: 'none', fontWeight: 700 }}
                  disabled={!selectedAddProfileId || attendanceControlBusy}
                  onClick={handleAddFromVgtc}
                >
                  Activate for Terminal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Photo Preview Modal ── */}
      {timelineProfile && (
        <AttendanceTimelineModal profile={timelineProfile} onClose={() => setTimelineProfile(null)} />
      )}

      {viewingPhotoModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: 20,
        }}>
          <div role="dialog" aria-modal="true" aria-labelledby="enrollment-photo-title" className="adm-panel" style={{ maxWidth: 720, width: '100%', maxHeight: '90vh', overflowY: 'auto', borderRadius: 16 }}>
            <div className="adm-panel-hd">
              <div>
                <h3 id="enrollment-photo-title" style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>
                  {viewingPhotoModal.name} — Enrolled Face Photos
                </h3>
                <p className="adm-sub">Synced from the terminal. First photo is the profile image.</p>
              </div>
              <button ref={photoCloseRef} type="button" className="adm-btn adm-btn--sm" onClick={() => setViewingPhotoModal(null)}>
                Close
              </button>
            </div>
            <div className="adm-panel-bd">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
                {enrollmentPhotos(viewingPhotoModal).map((imgSrc, i) => (
                  <div key={i} style={{ textAlign: 'center' }}>
                    <EnrollmentImage
                      src={imageUrl(imgSrc)}
                      alt={`${viewingPhotoModal.name} — ${i === 0 ? 'profile image' : `enrollment photo ${i + 1}`}`}
                      style={{ width: '100%', height: 220, objectFit: 'contain', borderRadius: 10, border: '1px solid var(--border)' }}
                    />
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginTop: 6 }}>{i === 0 ? 'Profile image' : `Enrollment photo ${i + 1}`}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
