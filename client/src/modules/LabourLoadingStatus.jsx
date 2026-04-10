import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api';
import { Truck, LogIn, LogOut, Volume2, CheckCircle, Clock, RefreshCw, Bell, BellOff, Mic, MicOff, Play, Pause, MessageSquare, User, Lock, Eye, EyeOff, AlertCircle, Download, X, Share, MoreVertical } from 'lucide-react';

// ── Beep Sound (Web Audio API) ─────────────────────────────────
function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
    // Play twice for a double-beep effect
    setTimeout(() => {
      try {
        const ctx2 = new (window.AudioContext || window.webkitAudioContext)();
        const osc2 = ctx2.createOscillator();
        const gain2 = ctx2.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx2.destination);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1100, ctx2.currentTime);
        gain2.gain.setValueAtTime(0.4, ctx2.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx2.currentTime + 0.4);
        osc2.start(ctx2.currentTime);
        osc2.stop(ctx2.currentTime + 0.4);
      } catch {}
    }, 500);
  } catch (e) {
    console.warn('Audio not supported:', e);
  }
}

// ── Browser Notification ───────────────────────────────────────
async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const perm = await Notification.requestPermission();
  return perm === 'granted';
}

function sendNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' });
  }
}

// ── Voice Message Player ───────────────────────────────────────
function VoicePlayer({ base64Audio, onHeard, alreadyHeard, heardBy }) {
  const [playing, setPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const audioRef = useRef(null);

  const playAudio = useCallback(() => {
    if (!base64Audio) return;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    // base64 → Blob → URL
    const byteChars = atob(base64Audio);
    const byteArr = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
    const blob = new Blob([byteArr], { type: 'audio/webm' });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.play();
    setPlaying(true);
    setHasPlayed(true);
    audio.onended = () => { setPlaying(false); URL.revokeObjectURL(url); };
    audio.onerror = () => { setPlaying(false); URL.revokeObjectURL(url); };
  }, [base64Audio]);

  return (
    <div style={{ marginTop: '10px', padding: '10px', background: '#f0f9ff', borderRadius: '10px', border: '1px solid #bae6fd' }}>
      <div style={{ fontSize: '11px', fontWeight: 800, color: '#0369a1', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Volume2 size={13} /> Voice Message
        {alreadyHeard && (
          <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#10b981', fontWeight: 700 }}>
            ✓ Heard by {heardBy || 'labour'}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button onClick={playAudio} disabled={playing}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', border: 'none', background: playing ? '#94a3b8' : '#0ea5e9', color: 'white', fontWeight: 700, fontSize: '13px', cursor: playing ? 'not-allowed' : 'pointer' }}>
          {playing ? <><Pause size={14} /> Playing...</> : <><Play size={14} /> Play</>}
        </button>
        {hasPlayed && !alreadyHeard && (
          <button onClick={onHeard}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#10b981', color: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
            <CheckCircle size={14} /> Mark Heard
          </button>
        )}
      </div>
    </div>
  );
}

// ── Progress Bar ──────────────────────────────────────────────
function ProgressBar({ status, startedAt, now }) {
  const isLoaded = status === 'Loaded';
  const isStarted = status === 'Started';
  const getWidth = () => {
    if (isLoaded) return 100;
    if (isStarted && startedAt) {
      const elapsed = Math.floor((now - new Date(startedAt).getTime()) / 60000);
      return Math.min(95, 15 + elapsed * 2.5);
    }
    return 10;
  };
  const width = getWidth();
  const color = isLoaded ? '#10b981' : isStarted ? '#3b82f6' : '#94a3b8';
  return (
    <div style={{ width: '100%' }}>
      <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ width: `${width}%`, height: '100%', background: color, transition: 'width 0.5s ease-out' }} />
      </div>
    </div>
  );
}

// ── Login Screen ──────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await api.post('/labour/login', { username, password });
      const data = res.data;
      localStorage.setItem('vgtc-labour-token', data.token);
      localStorage.setItem('vgtc-labour-worker', JSON.stringify(data.worker));
      onLogin(data.worker);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#0f172a,#1e293b)', padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '18px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 8px 32px rgba(99,102,241,0.4)' }}>
            <Truck size={32} color="white" />
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: 'white' }}>Labour Portal</div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px', fontWeight: 600 }}>Vikas Goods Transport Co.</div>
        </div>

        {/* Card */}
        <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '28px', boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>
          <div style={{ fontSize: '16px', fontWeight: 800, color: 'white', marginBottom: '20px' }}>Sign In</div>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: '6px' }}>Username</label>
              <div style={{ position: 'relative' }}>
                <User size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. ramu_kosli" required autoFocus
                  style={{ width: '100%', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '11px 12px 11px 36px', color: 'white', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: '6px' }}>Password / PIN</label>
              <div style={{ position: 'relative' }}>
                <Lock size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required
                  style={{ width: '100%', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '11px 36px 11px 36px', color: 'white', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
                <button type="button" onClick={() => setShowPass(s => !s)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0 }}>
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            {error && (
              <div style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.25)', borderRadius: '8px', padding: '10px 14px', fontSize: '12.5px', color: '#f43f5e', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={14} /> {error}
              </div>
            )}
            <button type="submit" disabled={loading}
              style={{ width: '100%', padding: '13px', borderRadius: '12px', border: 'none', background: loading ? '#334155' : 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: 'white', fontSize: '14px', fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <LogIn size={16} /> {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
        <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '11px', color: '#475569' }}>Contact your supervisor to get login credentials</div>
      </div>
    </div>
  );
}

// ── Main Labour Portal ────────────────────────────────────────
export default function LabourLoadingStatus() {
  const [worker, setWorker] = useState(() => {
    try { return JSON.parse(localStorage.getItem('vgtc-labour-worker')); } catch { return null; }
  });
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const knownIdsRef = useRef(new Set());
  const isFirstFetch = useRef(true);

  const token = localStorage.getItem('vgtc-labour-token');

  // ── Fetch today's LRs ──────────────────────────────────────
  const fetchData = useCallback(async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);
    try {
      const res = await api.get('/labour/today', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = res.data;

      // Detect new entries
      if (!isFirstFetch.current) {
        const newIds = data.filter(r => !knownIdsRef.current.has(r.id));
        if (newIds.length > 0) {
          playBeep();
          sendNotification('🚛 New Loading', `${newIds.length} new vehicle(s) added!`);
        }
      }

      data.forEach(r => knownIdsRef.current.add(r.id));
      isFirstFetch.current = false;
      setReceipts(data.reverse());
    } catch (e) {
      if (e.response?.status === 401) { handleLogout(); return; }
      console.error('Labour fetch error:', e);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!worker) return;
    fetchData();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => fetchData(true), 10000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [worker, fetchData]);

  // ── Notification permission ────────────────────────────────
  const toggleNotifications = async () => {
    if (!notifEnabled) {
      const granted = await requestNotificationPermission();
      setNotifEnabled(granted);
      if (!granted) alert('Please allow notifications from your browser settings to enable alerts.');
    } else {
      setNotifEnabled(false);
    }
  };

  // ── Update status ─────────────────────────────────────────
  const updateStatus = async (r, newStatus) => {
    try {
      await api.patch(`/labour/lr/${worker.godown}/${r.id}/status`,
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setReceipts(prev => prev.map(x => x.id === r.id ? { ...x, status: newStatus, ...(newStatus === 'Started' ? { startedAt: new Date().toISOString() } : {}), ...(newStatus === 'Loaded' ? { loadedAt: new Date().toISOString() } : {}) } : x));
    } catch (e) { alert('Status update failed'); }
  };

  // ── Mark voice heard ──────────────────────────────────────
  const markHeard = async (r) => {
    try {
      await api.patch(`/labour/lr/${worker.godown}/${r.id}/heard`, {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setReceipts(prev => prev.map(x => x.id === r.id ? { ...x, voiceHeard: true, voiceHeardBy: worker.name } : x));
    } catch (e) { alert('Failed to mark as heard'); }
  };

  const handleLogout = () => {
    localStorage.removeItem('vgtc-labour-token');
    localStorage.removeItem('vgtc-labour-worker');
    setWorker(null);
  };

  const handleLogin = (w) => setWorker(w);

  const GODOWN_LABEL = { kosli: 'Kosli Godown', jhajjar: 'Jhajjar Godown', jkl: 'JK Lakshmi' };

  if (!worker) return <LoginScreen onLogin={handleLogin} />;

  return (
    <div style={{ backgroundColor: '#f1f5f9', minHeight: '100dvh', fontFamily: 'system-ui, sans-serif' }}>

      {/* Install Guide */}
      {showInstallGuide && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setShowInstallGuide(false)}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', maxWidth: '360px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ fontWeight: 800, fontSize: '16px' }}>📲 Install App</span>
              <button onClick={() => setShowInstallGuide(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer' }}><X size={14} /></button>
            </div>
            <div style={{ fontSize: '13px', color: '#475569', marginBottom: '16px' }}>Install this portal on your phone for one-tap access like a regular app!</div>
            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', marginBottom: '12px' }}>
              <strong style={{ fontSize: '13px' }}>📱 Android (Chrome):</strong>
              <ol style={{ margin: '8px 0 0', paddingLeft: '18px', fontSize: '12px', color: '#475569', lineHeight: 1.6 }}>
                <li>Tap the 3-dot menu <MoreVertical size={11} style={{ verticalAlign: 'middle' }} /></li>
                <li>Tap "Install app" or "Add to Home screen"</li>
                <li>Tap <b>Add</b></li>
              </ol>
            </div>
            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px' }}>
              <strong style={{ fontSize: '13px' }}>🍎 iPhone (Safari):</strong>
              <ol style={{ margin: '8px 0 0', paddingLeft: '18px', fontSize: '12px', color: '#475569', lineHeight: 1.6 }}>
                <li>Tap the Share button <Share size={11} style={{ verticalAlign: 'middle' }} /></li>
                <li>Tap "Add to Home Screen"</li>
                <li>Tap <b>Add</b></li>
              </ol>
            </div>
            <button onClick={() => setShowInstallGuide(false)} style={{ width: '100%', marginTop: '16px', background: '#6366f1', color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: 800, cursor: 'pointer' }}>Got it!</button>
          </div>
        </div>
      )}

      {/* Sticky Header */}
      <div style={{ backgroundColor: '#0f172a', color: 'white', padding: '14px 16px', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '17px', fontWeight: 900 }}>
              <Truck size={20} /> Loading Status
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
              👷 {worker.name} — <span style={{ color: '#6366f1', fontWeight: 700 }}>{GODOWN_LABEL[worker.godown] || worker.godown}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={toggleNotifications} title={notifEnabled ? 'Notifications ON' : 'Enable Notifications'}
              style={{ background: notifEnabled ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.08)', border: 'none', color: notifEnabled ? '#818cf8' : '#94a3b8', padding: '7px', borderRadius: '8px', cursor: 'pointer', display: 'flex' }}>
              {notifEnabled ? <Bell size={16} /> : <BellOff size={16} />}
            </button>
            <button onClick={() => setShowInstallGuide(true)}
              style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#94a3b8', padding: '7px', borderRadius: '8px', cursor: 'pointer', display: 'flex' }}>
              <Download size={16} />
            </button>
            <button onClick={handleLogout}
              style={{ background: 'rgba(244,63,94,0.15)', border: 'none', color: '#f43f5e', padding: '7px', borderRadius: '8px', cursor: 'pointer', display: 'flex' }}>
              <LogOut size={16} />
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            {receipts.length} vehicle{receipts.length !== 1 ? 's' : ''} today
          </div>
          <button onClick={() => fetchData()} style={{ background: 'none', border: 'none', color: '#6366f1', padding: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 700 }}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '16px', paddingBottom: '40px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
            <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
            <div>Loading vehicles...</div>
          </div>
        ) : receipts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', background: 'white', borderRadius: '16px', border: '1px dashed #cbd5e1', color: '#94a3b8' }}>
            <Truck size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
            <div style={{ fontWeight: 700 }}>No vehicle loadings for today</div>
            <div style={{ fontSize: '12px', marginTop: '6px' }}>New entries will appear automatically</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {receipts.map((r, index) => {
              const isLoaded = r.status === 'Loaded';
              return (
                <div key={r.id} style={{ background: 'white', borderRadius: '14px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: isLoaded ? '1px solid #bbf7d0' : '1px solid #e2e8f0' }}>
                  {/* Header row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ background: isLoaded ? '#dcfce7' : '#f1f5f9', color: isLoaded ? '#166534' : '#475569', padding: '2px 7px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>#{index + 1}</span>
                        <span style={{ fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>{r.truckNo || '—'}</span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
                        LR #{r.lrNo} • {r.partyName || '—'}
                      </div>
                    </div>
                    {isLoaded ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#10b981', fontSize: '13px', fontWeight: 800 }}>
                        <CheckCircle size={16} /> Loaded
                      </div>
                    ) : (
                      <span style={{ background: r.status === 'Started' ? '#dbeafe' : '#fef3c7', color: r.status === 'Started' ? '#1d4ed8' : '#92400e', padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 700 }}>
                        {r.status || 'Pending'}
                      </span>
                    )}
                  </div>

                  {/* Material + Progress */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', background: '#f8fafc', padding: '10px', borderRadius: '8px', marginBottom: '12px' }}>
                    <div>
                      <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748b', fontWeight: 800 }}>Material</div>
                      <div style={{ fontSize: '13px', color: '#334155', fontWeight: 700, marginTop: '2px' }}>
                        {r._materials ? r._materials.map(m => m.material).join(', ') : (r.material || '—')}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748b', fontWeight: 800 }}>Progress</div>
                      <div style={{ marginTop: '6px' }}>
                        <ProgressBar status={r.status} startedAt={r.startedAt} now={now} />
                        <div style={{ fontSize: '10px', color: r.status === 'Started' ? '#3b82f6' : '#94a3b8', fontWeight: 700, marginTop: '3px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <Clock size={10} />
                          {r.startedAt ? (() => {
                            const ms = Math.max(0, (r.loadedAt ? new Date(r.loadedAt) : now) - new Date(r.startedAt));
                            const m = Math.floor(ms / 60000);
                            const s = Math.floor((ms % 60000) / 1000);
                            return `${m}m ${s}s`;
                          })() : 'Not started'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Note */}
                  {r.note && (
                    <div style={{ marginBottom: '10px', padding: '10px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 800, color: '#92400e', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <MessageSquare size={11} /> NOTE
                      </div>
                      <div style={{ fontSize: '13px', color: '#78350f', lineHeight: 1.5 }}>{r.note}</div>
                    </div>
                  )}

                  {/* Voice Message */}
                  {r.voiceMessageBase64 && (
                    <VoicePlayer
                      base64Audio={r.voiceMessageBase64}
                      alreadyHeard={!!r.voiceHeard}
                      heardBy={r.voiceHeardBy}
                      onHeard={() => markHeard(r)}
                    />
                  )}

                  {/* Status Buttons */}
                  {!isLoaded && (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                      <button onClick={() => updateStatus(r, 'Started')} disabled={r.status === 'Started'}
                        style={{ flex: 1, padding: '11px', border: 'none', borderRadius: '10px', fontWeight: 800, fontSize: '13px', cursor: r.status === 'Started' ? 'not-allowed' : 'pointer', background: r.status === 'Started' ? '#f1f5f9' : '#3b82f6', color: r.status === 'Started' ? '#94a3b8' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        <Clock size={15} /> Started
                      </button>
                      <button onClick={() => updateStatus(r, 'Loaded')}
                        style={{ flex: 1, padding: '11px', border: 'none', borderRadius: '10px', fontWeight: 800, fontSize: '13px', cursor: 'pointer', background: '#10b981', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        <CheckCircle size={15} /> Loaded
                      </button>
                    </div>
                  )}
                  {isLoaded && (
                    <button onClick={() => updateStatus(r, 'Started')}
                      style={{ width: '100%', marginTop: '8px', padding: '8px', border: 'none', borderRadius: '8px', background: '#f1f5f9', color: '#64748b', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                      Re-open
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
