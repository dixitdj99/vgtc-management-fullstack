import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api';
import { Truck, LogIn, LogOut, Volume2, CheckCircle, Clock, RefreshCw, Bell, BellOff, Mic, MicOff, Play, Pause, MessageSquare, User, Lock, Eye, EyeOff, AlertCircle, Download, X, Share, MoreVertical } from 'lucide-react';

// Add global styles for animations
const style = document.createElement('style');
style.innerHTML = `
  @keyframes softPulse {
    0% { opacity: 0.8; transform: scale(1); }
    50% { opacity: 1; transform: scale(1.02); }
    100% { opacity: 0.8; transform: scale(1); }
  }
`;
document.head.appendChild(style);

const TRANSLATIONS = {
  en: {
    portal_title: "Labour Portal",
    loading_status: "Loading Status",
    pending: "pending",
    refresh: "Refresh",
    truck_no: "Truck No",
    lr_no: "LR No",
    party: "Party",
    materials_breakdown: "Materials",
    bags: "Bags",
    wait_time: "Wait Time",
    status: "Status",
    started_btn: "Started",
    loaded_btn: "Loaded",
    reopen_btn: "Re-open",
    instructor_note: "Instructor Note",
    voice_instruction: "Voice Instruction",
    priority: "Priority / Next Pick",
    no_loadings: "No pending loadings",
    no_loadings_date: "No loadings for this date",
    sign_in: "Sign In",
    username: "Username",
    password: "Password / PIN",
    signing_in: "Signing in...",
    loading_vehicles: "Loading vehicles...",
    contact_supervisor: "Contact your supervisor for login details",
    install_app: "Install App",
    install_desc: "Install this portal on your phone for one-tap access like a regular app!",
    android_guide: "Android (Chrome)",
    ios_guide: "iPhone (Safari)",
    got_it: "Got it!",
    heard_by: "Heard by",
    play: "Play",
    playing: "Playing...",
    mark_heard: "Mark Heard",
    voice_msg: "Voice Message",
    first_queue: "First in Queue",
    re_record: "Re-record",
    loading: "Loading...",
    ago: "ago",
    bags_text: "bags"
  },
  hi: {
    portal_title: "लेबर पोर्टल",
    loading_status: "लोडिंग स्थिति",
    pending: "बाकी",
    refresh: "रिफ्रेश",
    truck_no: "ट्रक नंबर",
    lr_no: "एलआर नंबर",
    party: "पार्टी",
    materials_breakdown: "माल का विवरण",
    bags: "कट्टे",
    wait_time: "प्रतीक्षा समय",
    status: "स्थिति",
    started_btn: "शुरू किया",
    loaded_btn: "लोड हो गया",
    reopen_btn: "फिर से खोलें",
    instructor_note: "नोट",
    voice_instruction: "आवाज निर्देश",
    priority: "प्राथमिकता / अगला",
    no_loadings: "कोई लोडिंग बाकी नहीं",
    no_loadings_date: "इस तारीख के लिए कोई लोडिंग नहीं",
    sign_in: "साइन इन",
    username: "यूज़रनेम",
    password: "पासवर्ड / पिन",
    signing_in: "साइन इन हो रहा है...",
    loading_vehicles: "लोडिंग चेक हो रही है...",
    contact_supervisor: "लॉगिन आईडी के लिए अपने सुपरवाइजर से बात करें",
    install_app: "ऐप इंस्टॉल करें",
    install_desc: "आसानी से इस्तेमाल करने के लिए इसे अपने फोन पर ऐप की तरह इंस्टॉल करें!",
    android_guide: "एंड्रॉइड (क्रोम)",
    ios_guide: "आईफ़ोन (सफ़ारी)",
    got_it: "ठीक है",
    heard_by: "सुना गया",
    play: "सुनें",
    playing: "बज रहा है...",
    mark_heard: "सुना हुआ मार्क करें",
    voice_msg: "आवाज संदेश",
    first_queue: "लाइन में सबसे पहले",
    re_record: "फिर रिकॉर्ड करें",
    loading: "लोड हो रहा है...",
    ago: "पहले",
    bags_text: "कट्टे"
  }
};

const getT = (lang) => {
  const l = lang === 'hi' ? 'hi' : 'en';
  return (key) => TRANSLATIONS[l][key] || key;
};

const parseDate = (d) => {
  if (!d) return null;
  if (d instanceof Date) return d;
  if (typeof d === 'object' && d._seconds) return new Date(d._seconds * 1000);
  if (typeof d === 'string' && d.includes('/')) {
    const [day, month, year] = d.split('/');
    return new Date(`${year}-${month}-${day}`);
  }
  return new Date(d);
};

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
    try {
      // Robust base64 handling: strip data URL prefix if present
      const cleanB64 = base64Audio.includes('base64,') 
        ? base64Audio.split('base64,')[1] 
        : base64Audio;

      const byteChars = atob(cleanB64);
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
      audio.onerror = () => { 
        setPlaying(false); 
        URL.revokeObjectURL(url);
        alert('Could not play audio. File might be corrupted.');
      };
    } catch (err) {
      console.error('Audio playback error:', err);
      alert('Error playing audio message.');
    }
  }, [base64Audio]);

  const t = getT(localStorage.getItem('vgtc-labour-lang') || 'en');

  return (
    <div style={{ marginTop: '10px', padding: '10px', background: '#f0f9ff', borderRadius: '10px', border: '1px solid #bae6fd' }}>
      <div style={{ fontSize: '11px', fontWeight: 800, color: '#0369a1', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Volume2 size={13} /> {t('voice_msg')}
        {alreadyHeard && (
          <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#10b981', fontWeight: 700 }}>
            ✓ {t('heard_by')} {heardBy || 'labour'}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button onClick={playAudio} disabled={playing}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', border: 'none', background: playing ? '#94a3b8' : '#0ea5e9', color: 'white', fontWeight: 700, fontSize: '13px', cursor: playing ? 'not-allowed' : 'pointer' }}>
          {playing ? <><Pause size={14} /> {t('playing')}</> : <><Play size={14} /> {t('play')}</>}
        </button>
        {hasPlayed && !alreadyHeard && (
          <button onClick={onHeard}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#10b981', color: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
            <CheckCircle size={14} /> {t('mark_heard')}
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

  const t = getT(localStorage.getItem('vgtc-labour-lang') || 'en');

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
    <div style={{ height: '100dvh', overflowY: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#0f172a,#1e293b)', padding: '20px', fontFamily: 'system-ui, sans-serif', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '18px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 8px 32px rgba(99,102,241,0.4)' }}>
            <Truck size={32} color="white" />
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: 'white' }}>{t('portal_title')}</div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px', fontWeight: 600 }}>Vikas Goods Transport Co.</div>
        </div>

        {/* Card */}
        <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '28px', boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>
          <div style={{ fontSize: '16px', fontWeight: 800, color: 'white', marginBottom: '20px' }}>{t('sign_in')}</div>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: '6px' }}>{t('username')}</label>
              <div style={{ position: 'relative' }}>
                <User size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. ramu_kosli" required autoFocus
                  style={{ width: '100%', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '11px 12px 11px 36px', color: 'white', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: '6px' }}>{t('password')}</label>
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
              <LogIn size={16} /> {loading ? t('signing_in') : t('sign_in')}
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
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [lang, setLang] = useState(() => localStorage.getItem('vgtc-labour-lang') || 'en');
  const t = getT(lang);

  useEffect(() => {
    localStorage.setItem('vgtc-labour-lang', lang);
  }, [lang]);

  const knownIdsRef = useRef(new Set());
  const isFirstFetch = useRef(true);

  const token = localStorage.getItem('vgtc-labour-token');

  // ── Fetch today's LRs ──────────────────────────────────────
  const fetchData = useCallback(async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);
    try {
      const res = await api.get(`/labour/today?date=${selectedDate}`, {
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
      setReceipts(data);
    } catch (e) {
      if (e.response?.status === 401) { handleLogout(); return; }
      console.error('Labour fetch error:', e);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [token, selectedDate]);

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
    <div style={{ backgroundColor: '#f1f5f9', height: '100dvh', overflowY: 'auto', fontFamily: 'system-ui, sans-serif', WebkitOverflowScrolling: 'touch' }}>

      {/* Install Guide */}
      {showInstallGuide && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setShowInstallGuide(false)}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', maxWidth: '360px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ fontWeight: 800, fontSize: '16px' }}>📲 {t('install_app')}</span>
              <button onClick={() => setShowInstallGuide(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer' }}><X size={14} /></button>
            </div>
            <div style={{ fontSize: '13px', color: '#475569', marginBottom: '16px' }}>{t('install_desc')}</div>
            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', marginBottom: '12px' }}>
              <strong style={{ fontSize: '13px' }}>📱 {t('android_guide')}:</strong>
              <ol style={{ margin: '8px 0 0', paddingLeft: '18px', fontSize: '12px', color: '#475569', lineHeight: 1.6 }}>
                <li>Tap the 3-dot menu <MoreVertical size={11} style={{ verticalAlign: 'middle' }} /></li>
                <li>Tap "Install app" or "Add to Home screen"</li>
                <li>Tap <b>Add</b></li>
              </ol>
            </div>
            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px' }}>
              <strong style={{ fontSize: '13px' }}>🍎 {t('ios_guide')}:</strong>
              <ol style={{ margin: '8px 0 0', paddingLeft: '18px', fontSize: '12px', color: '#475569', lineHeight: 1.6 }}>
                <li>Tap the Share button <Share size={11} style={{ verticalAlign: 'middle' }} /></li>
                <li>Tap "Add to Home Screen"</li>
                <li>Tap <b>Add</b></li>
              </ol>
            </div>
            <button onClick={() => setShowInstallGuide(false)} style={{ width: '100%', marginTop: '16px', background: '#6366f1', color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: 800, cursor: 'pointer' }}>{t('got_it')}</button>
          </div>
        </div>
      )}

      {/* Sticky Header */}
      <div style={{ backgroundColor: '#0f172a', color: 'white', padding: '14px 16px', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '17px', fontWeight: 900 }}>
              <Truck size={20} /> {t('loading_status')}
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
              👷 {worker.name} — <span style={{ color: '#6366f1', fontWeight: 700 }}>{(lang === 'hi' && worker.godown === 'jkl') ? 'जेके लक्ष्मी' : (GODOWN_LABEL[worker.godown] || worker.godown)}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {/* Lang Toggle */}
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.08)', padding: '2px', borderRadius: '8px', marginRight: '4px' }}>
              <button onClick={() => setLang('en')} style={{ padding: '4px 8px', fontSize: '10px', fontWeight: 800, border: 'none', borderRadius: '6px', background: lang === 'en' ? '#f59e0b' : 'transparent', color: lang === 'en' ? '#000' : '#94a3b8', cursor: 'pointer' }}>EN</button>
              <button onClick={() => setLang('hi')} style={{ padding: '4px 8px', fontSize: '10px', fontWeight: 800, border: 'none', borderRadius: '6px', background: lang === 'hi' ? '#f59e0b' : 'transparent', color: lang === 'hi' ? '#000' : '#94a3b8', cursor: 'pointer' }}>HI</button>
            </div>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: 'white', fontSize: '12.5px', padding: '6px 10px', outline: 'none', appearance: 'none', WebkitAppearance: 'none' }} />
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
              {(() => {
                const filtered = receipts.filter(r => selectedDate !== todayStr || r.status !== 'Loaded');
                return `${filtered.length} ${t('pending')}`;
              })()}
            </div>
          </div>
          <button onClick={() => fetchData()} style={{ background: 'rgba(99,102,241,0.1)', border: 'none', color: '#818cf8', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700 }}>
            <RefreshCw size={14} /> {t('refresh')}
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '16px', paddingBottom: '40px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
            <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
            <div>{t('loading_vehicles')}</div>
          </div>
        ) : receipts.filter(r => selectedDate !== todayStr || r.status !== 'Loaded').length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', background: 'white', borderRadius: '16px', border: '1px dashed #cbd5e1', color: '#94a3b8' }}>
            <Truck size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
            <div style={{ fontWeight: 700 }}>
              {selectedDate === todayStr ? t('no_loadings') : t('no_loadings_date')}
            </div>
            <div style={{ fontSize: '12px', marginTop: '6px' }}>{lang === 'hi' ? 'कैलेंडर से दूसरी तारीख चुनें' : 'Try selecting a different date from the calendar'}</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {receipts
              .filter(r => selectedDate !== todayStr || r.status !== 'Loaded')
              .map((r, index) => {
                const isLoaded = r.status === 'Loaded';
                return (
                <div key={r.id} style={{ background: 'white', borderRadius: '14px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: isLoaded ? '1px solid #bbf7d0' : '1px solid #e2e8f0' }}>
                  {/* Header row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ background: isLoaded ? '#dcfce7' : '#f1f5f9', color: isLoaded ? '#166534' : '#475569', padding: '2px 7px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>#{index + 1}</span>
                        <span style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>{r.truckNo || '—'}</span>
                      </div>
                      <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px', fontWeight: 700 }}>
                        {t('lr_no')} #{r.lrNo} • {r.partyName || '—'}
                      </div>
                    </div>
                    {isLoaded ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#10b981', fontSize: '13px', fontWeight: 800 }}>
                        <CheckCircle size={16} /> {t('loaded_btn')}
                      </div>
                    ) : (
                      <span style={{ background: r.status === 'Started' ? '#dbeafe' : '#fef3c7', color: r.status === 'Started' ? '#1d4ed8' : '#92400e', padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 800 }}>
                        {r.status === 'Started' ? t('started_btn') : (r.status || t('pending'))}
                      </span>
                    )}
                  </div>

                    <div style={{ gridColumn: '1 / -1', marginBottom: '12px' }}>
                      <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 800, letterSpacing: '0.05em', marginBottom: '6px' }}>{t('materials_breakdown')}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {r._materials ? r._materials.map((m, idx) => (
                          <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>{m.material}</span>
                            <span style={{ fontSize: '15px', fontWeight: 900, color: '#6366f1' }}>{m.bags} {t('bags_text')}</span>
                          </div>
                        )) : (
                          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>{r.material}</span>
                            <span style={{ fontSize: '15px', fontWeight: 900, color: '#6366f1' }}>{r.totalBags} {t('bags_text')}</span>
                          </div>
                        )}
                      </div>
                    </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Clock size={14} color="#64748b" />
                      <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 700 }}>{t('wait_time')}:</span>
                      <span style={{ fontSize: '13px', color: r.status === 'Started' ? '#3b82f6' : '#0f172a', fontWeight: 900 }}>
                        {(() => {
                          const created = parseDate(r.createdAt || r.date);
                          const loaded = parseDate(r.loadedAt);
                          if (!created || isNaN(created.getTime())) return '—';
                          const ms = Math.max(0, (loaded && !isNaN(loaded.getTime()) ? loaded : now) - created);
                          const h = Math.floor(ms / 3600000);
                          const m = Math.floor((ms % 3600000) / 60000);
                          return h > 0 ? `${h}h ${m}m` : `${m}m ${t('ago')}`;
                        })()}
                      </span>
                    </div>
                  </div>

                   {/* Priority Indicator for First Item */}
                  {index === 0 && !isLoaded && (
                    <div style={{ marginBottom: '12px', padding: '8px 12px', background: 'linear-gradient(90deg, #fef3c7, #fff)', borderLeft: '4px solid #f59e0b', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', animation: 'softPulse 2s infinite' }}>
                       <AlertCircle size={14} color="#d97706" />
                       <span style={{ fontSize: '12px', fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.02em' }}>{t('priority')}</span>
                    </div>
                  )}

                  {/* Note - Enhanced Visibility */}
                  {r.note && (
                    <div style={{ marginBottom: '12px', padding: '14px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '12px', boxShadow: '0 4px 12px rgba(251,191,36,0.1)' }}>
                      <div style={{ fontSize: '11px', fontWeight: 900, color: '#92400e', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <MessageSquare size={14} /> {t('instructor_note')}
                      </div>
                      <div style={{ fontSize: '15px', color: '#78350f', fontWeight: 600, lineHeight: 1.5, background: 'rgba(255,255,255,0.5)', padding: '8px', borderRadius: '8px' }}>
                        {r.note}
                      </div>
                    </div>
                  )}

                  {/* Voice Message - Enhanced Visibility */}
                  {r.voiceMessageBase64 && (
                    <div style={{ marginBottom: '12px', padding: '14px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '12px', boxShadow: '0 4px 12px rgba(14,165,233,0.1)' }}>
                      <div style={{ fontSize: '11px', fontWeight: 900, color: '#0369a1', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <Volume2 size={14} /> {t('voice_instruction')}
                      </div>
                      <VoicePlayer
                        base64Audio={r.voiceMessageBase64}
                        alreadyHeard={!!r.voiceHeard}
                        heardBy={r.voiceHeardBy}
                        onHeard={() => markHeard(r)}
                      />
                    </div>
                  )}

                  {/* Progress bar for started items */}
                  {r.status === 'Started' && (
                    <div style={{ marginBottom: '12px' }}>
                      <ProgressBar status={r.status} startedAt={r.startedAt} now={now} />
                    </div>
                  )}

                  {/* Status Buttons */}
                  {!isLoaded && (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                      <button onClick={() => updateStatus(r, 'Started')} disabled={r.status === 'Started'}
                        style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '10px', fontWeight: 800, fontSize: '14px', cursor: r.status === 'Started' ? 'not-allowed' : 'pointer', background: r.status === 'Started' ? '#f1f5f9' : '#3b82f6', color: r.status === 'Started' ? '#94a3b8' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', boxShadow: r.status === 'Started' ? 'none' : '0 4px 12px rgba(59,130,246,0.3)' }}>
                        <Clock size={16} /> {t('started_btn')}
                      </button>
                      <button onClick={() => updateStatus(r, 'Loaded')}
                        style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '10px', fontWeight: 800, fontSize: '14px', cursor: 'pointer', background: '#10b981', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', boxShadow: '0 4px 12px rgba(16,185,129,0.3)' }}>
                        <CheckCircle size={16} /> {t('loaded_btn')}
                      </button>
                    </div>
                  )}
                  {isLoaded && (
                    <button onClick={() => updateStatus(r, 'Started')}
                      style={{ width: '100%', marginTop: '8px', padding: '8px', border: 'none', borderRadius: '8px', background: '#f1f5f9', color: '#64748b', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                      {t('reopen_btn')}
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
