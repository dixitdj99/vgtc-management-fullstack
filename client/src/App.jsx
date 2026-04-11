import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutDashboard, Receipt, FileText, BarChart3, BookOpen, Package, ChevronRight, Sun, Moon, Coffee, Shield, LogOut, Cloud, CloudRain, Menu, X } from 'lucide-react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import ax from './api';
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
import InvoiceModule from './modules/InvoiceModule';
import { Truck, Fuel, ShoppingCart, Gauge, Banknote } from 'lucide-react';
import MileageModule from './modules/MileageModule';
import AdminModule from './modules/AdminModule';
import CinematicWeather from './components/CinematicWeather';
import PayModule from './modules/PayModule';
import PublicReceipt from './pages/PublicReceipt';
import LabourLoadingStatus from './modules/LabourLoadingStatus';

const THEMES = [
  { id: 'dark', label: 'Dark', Icon: Moon },
  { id: 'light', label: 'Light', Icon: Sun },
  { id: 'sepia', label: 'Sepia', Icon: Coffee },
];

// Environment banner — shown in non-production environments only.
// Driven by VITE_APP_ENV (set in client .env files).
const APP_ENV = import.meta.env.VITE_APP_ENV || 'local';
const ENV_BANNER = APP_ENV === 'production' ? null
  : APP_ENV === 'beta'
    ? { label: 'BETA', bg: '#f97316', glow: 'rgba(249,115,22,0.4)' }
    : { label: 'LOCAL DEV', bg: '#eab308', glow: 'rgba(234,179,8,0.4)' };


function AppInner() {
  const { user, logout, ready, plant, godown } = useAuth();
  // Default to first module of the selected plant/godown
  // Persistence for navigation
  const [active, setActive] = useState(() => localStorage.getItem('vgtc-active') || (plant === 'jklakshmi' ? 'lr_jkl' : (godown === 'jhajjar' ? 'lr_jhajjar' : 'lr_kosli')));
  const [subActive, setSubActive] = useState(() => localStorage.getItem('vgtc-subactive') || '');
  const [expanded, setExpanded] = useState(() => {
    try {
      const saved = localStorage.getItem('vgtc-expanded');
      return saved ? JSON.parse(saved) : { [localStorage.getItem('vgtc-active')]: true };
    } catch { return {}; }
  });
  const [col, setCol] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('vgtc-theme') || 'sepia');
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const [isWakingUp, setIsWakingUp] = useState(false);
  const [weather, setWeather] = useState({ temp: null, cond: 'Clear', code: 1000, isDay: true, advice: 'Loading weather...' });
  const [currentHour, setCurrentHour] = useState(new Date().getHours());
  const city = 'Jharli, Jhajjar, Haryana';

  // Tick every minute to keep day/night animation in sync
  useEffect(() => {
    const tick = setInterval(() => setCurrentHour(new Date().getHours()), 60000);
    return () => clearInterval(tick);
  }, []);

  const HINDI_TAGLINES = {
    clear: [
      '✅ आसमान साफ है — ट्रकों की माइलेज और रफ्तार बढ़ाने के लिए बेहतरीन दिन!',
      '☀️ अच्छी धूप है — लोडिंग और अनलोडिंग का काम तेजी से पूरा करें।',
      '🚚 मौसम सुहाना है — लंबी दूरी की यात्रा के लिए गाड़ियां तैयार रखें।',
      '💪 आज सड़कें साफ हैं — समय पर माल पहुंचाने का लक्ष्य रखें!',
      '🛣️ शानदार मौसम! बिना रुके डिलीवरी का आदर्श समय है।'
    ],
    night: [
      '🌙 रात का सफर — हेडलाइट्स और इंडिकेटर चेक कर लें, सुरक्षित ड्राइव करें।',
      '✨ शांत रात — थकान महसूस हो तो सुरक्षित जगह रुककर आराम जरूर करें।',
      '🏘️ रात्रि लॉगिंग — शांतिपूर्ण माहौल में लंबी दूरी तय करने का सही समय।',
      '🌌 रात की ठंडी हवाएं — इंजन के लिए अच्छी हैं, पर नींद से सावधान रहें।'
    ],
    rain: [
      '🌧 बारिश का मौसम — तिरपाल (Tarp) कस कर बांधें, माल सुरक्षित रहना चाहिए!',
      '☔ फिसलन भरी सड़कें — ब्रेक का इस्तेमाल सावधानी से करें, दूरी बनाए रखें।',
      '🌧 भारी वर्षा — विजिबिलिटी कम होने पर गाड़ी सुरक्षित किनारे खड़ी करें।',
      '🌧 कीचड़ और पानी — टायर स्लिप हो सकते हैं, स्पीड पर नियंत्रण रखें!'
    ],
    mist: [
      '🌫 घना कोहरा — फॉग लाइट्स का प्रयोग करें और हमेशा लो-बीम पर चलें।',
      '🌫 सावधानी बरतें — कोहरे में ओवरटेकिंग से बचें, सुरक्षा ही सर्वोपरि है।',
      '☁️ खराब विजिबिलिटी — रिफ्लेक्टर टेप साफ रखें ताकि दूसरी गाड़ियां आपको देख सकें।',
      '🌁 धुंध भरा रास्ता — हार्न का प्रयोग करें, अपनी लेन में सुरक्षित चलें।'
    ],
    hot: [
      '🔥 भीषण गर्मी — टायर प्रेशर चेक करते रहें, ज्यादा गर्मी में टायर फटने का डर रहता है।',
      '☀️ तेज धूप — इंजन का कूलेंट लेवल चेक करें और ड्राइवरों को पर्याप्त पानी दें।',
      '🥤 गर्मी का अलर्ट — टायर ठंडे करने के लिए बीच-बीच में ब्रेक लेते रहें।',
      '🥵 लू का प्रकोप — केबिन को हवादार रखें और लगातार हाइड्रेटेड रहें!'
    ],
    cold: [
      '🥶 कड़ाके की ठंड — स्टार्ट करने से पहले इंजन को 5 मिनट वार्म-अप जरूर करें।',
      '❄️ शीत लहर — डीजल फिल्टर की जांच करें और बैटरी को चार्ज रखें।',
      '☕ ठंड का मौसम — एंटी-फ्रीज़ चेक करें और ड्राइवरों के लिए गर्म कपड़ों का ध्यान रखें।',
      '🧊 भारी ठंड — कोहरे की भी संभावना हो सकती है, हीटर चालू रखें और ध्यान से चलाएँ।'
    ],
    pleasant: [
      '🌤 सुहाना मौसम — गाड़ियों के इंजन और माइलेज के लिए सबसे अच्छा समय!',
      '🌿 ठंडी हवाएं — लंबी ड्राइव के लिए ड्राइवरों का मूड और स्वास्थ्य बढ़िया रहेगा।',
      '🙌 शुभ दिन — आज काम की रफ़्तार बढ़िया रहेगी, सुरक्षित सफर करें!',
      '🚀 बेहतरीन तापमान! गाड़ियों की परफॉरमेंस आज सबसे बढ़िया रहेगी।'
    ]
  };

  const fetchWeather = async () => {
    try {
      // Using WeatherAPI.com directly as requested
      const API_KEY = 'e98e8f62e87e49de8db164340262603';
      const city = 'Jharli, Jhajjar, Haryana';
      const res = await ax.get(`https://api.weatherapi.com/v1/current.json?key=${API_KEY}&q=${encodeURIComponent(city)}`);

      if (res.data && res.data.current) {
        const cur = res.data.current;
        const temp = cur.temp_c;
        const cond = cur.condition.text;
        const code = cur.condition.code;
        const isDay = cur.is_day === 1;

        let category = 'clear';

        // Rain takes top priority
        if (code >= 1063 && code <= 1246) {
          category = 'rain';
        }
        // Real fog/mist only matters if it's actually cold or explicitly dense fog
        else if ([1135, 1147].includes(code) || (code === 1030 && temp < 22)) {
          category = 'mist';
        }
        // Temperature based
        else if (temp >= 35) {
          category = 'hot';
        }
        else if (temp <= 15) {
          category = 'cold';
        }
        // Between 16 and 34 is nice/clear
        else {
          category = 'pleasant';
        }

        // Final override for night if it's clear/pleasant
        if (!isDay && (category === 'clear' || category === 'pleasant')) {
          category = 'night';
        }

        const variations = HINDI_TAGLINES[category] || HINDI_TAGLINES.clear;
        const advice = variations[Math.floor(Math.random() * variations.length)];

        setWeather({ temp, cond, code, isDay, advice });
      }
    } catch (err) {
      console.error('Weather fetch failed:', err.message);
    }
  };

  useEffect(() => {
    fetchWeather();
    const wInt = setInterval(fetchWeather, 300000);
    return () => clearInterval(wInt);
  }, []);

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
    { id: 'lr_kosli', label: 'Kosli LR', Icon: Receipt, color: '#6366f1', section: 'jksuper', permKey: 'lr_kosli' },
    { id: 'lr_jhajjar', label: 'Jhajjar LR', Icon: Receipt, color: '#6366f1', section: 'jksuper', permKey: 'lr_jhajjar' },
    {
      id: 'voucher_dump', label: 'Voucher', Icon: FileText, color: '#6366f1', section: 'jksuper', sub: [
        { id: 'Kosli_Bill', label: 'Kosli Bill', permKey: 'bill_kosli' },
        { id: 'Jajjhar_Bill', label: 'Jhajjar Bill', permKey: 'bill_jhajjar' },
        { id: 'JK_Super', label: 'JK Super Voucher', permKey: 'voucher_jksuper' },
      ]
    },
    {
      id: 'balance_dump', label: 'Balance Sheet', Icon: BarChart3, color: '#6366f1', section: 'jksuper', sub: [
        { id: 'Kosli_Bill', label: 'Kosli Bill', permKey: 'balance_kosli' },
        { id: 'Jajjhar_Bill', label: 'Jhajjar Bill', permKey: 'balance_jhajjar' },
        { id: 'JK_Super', label: 'JK Super Sheet', permKey: 'balance_jksuper' },
      ]
    },
    {
      id: 'stock_kosli', label: 'Kosli Stock', Icon: Package, color: '#6366f1', section: 'jksuper', permKey: 'stock_kosli', sub: [
        { id: 'overview', label: 'Overview' },
        { id: 'migo', label: 'MIGO (Stock Entry)' },
        { id: 'challan', label: 'Create Challan' },
        { id: 'history', label: 'History' },
      ]
    },
    {
      id: 'stock_jhajjar', label: 'Jhajjar Stock', Icon: Package, color: '#6366f1', section: 'jksuper', permKey: 'stock_jhajjar', sub: [
        { id: 'overview', label: 'Overview' },
        { id: 'migo', label: 'MIGO (Stock Entry)' },
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
    { id: 'mileage_dump', label: 'Mileage Tracker', Icon: Gauge, color: '#f59e0b', section: 'jksuper', permKey: 'mileage' },
    { id: 'pay_dump', label: 'Pay Vehicles', Icon: Banknote, color: '#10b981', section: 'jksuper', permKey: 'pay' },
    { id: 'sell_dump', label: 'Sell', Icon: ShoppingCart, color: '#ec4899', section: 'jksuper', permKey: 'sell' },
    { id: 'invoice_dump', label: 'Generate Invoice', Icon: FileText, color: '#10b981', section: 'jksuper', permKey: 'invoice' },
    { id: 'admin_loading_status_dump', label: 'Loading Realtime', Icon: LayoutDashboard, color: '#6366f1', section: 'jksuper', permKey: 'loading_status' },

    // ── JK Lakshmi ──
    { id: 'lr_jkl', label: 'Loading Receipt', Icon: Receipt, color: '#f59e0b', section: 'jklakshmi', permKey: 'lr_jkl' },
    {
      id: 'voucher_jkl', label: 'Voucher', Icon: FileText, color: '#f59e0b', section: 'jklakshmi', sub: [
        { id: 'Dump', label: 'Dump Voucher', permKey: 'voucher_jkl_dump' },
        { id: 'JK_Lakshmi', label: 'JK Lakshmi Voucher', permKey: 'voucher_jkl' },
      ]
    },
    {
      id: 'balance_jkl', label: 'Balance Sheet', Icon: BarChart3, color: '#f59e0b', section: 'jklakshmi', sub: [
        { id: 'Dump', label: 'Dump Sheet', permKey: 'balance_jkl_dump' },
        { id: 'JK_Lakshmi', label: 'JK Lakshmi Sheet', permKey: 'balance_jkl' },
      ]
    },
    {
      id: 'stock_jkl', label: 'JK Lakshmi Stock', Icon: Package, color: '#f59e0b', section: 'jklakshmi', permKey: 'stock_jkl', sub: [
        { id: 'overview', label: 'Overview' },
        { id: 'migo', label: 'MIGO (Stock Entry)' },
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
    { id: 'mileage_jkl', label: 'Mileage Tracker', Icon: Gauge, color: '#f59e0b', section: 'jklakshmi', permKey: 'mileage' },
    { id: 'pay_jkl', label: 'Pay Vehicles', Icon: Banknote, color: '#10b981', section: 'jklakshmi', permKey: 'pay' },
    { id: 'sell_jkl', label: 'Sell', Icon: ShoppingCart, color: '#ec4899', section: 'jklakshmi', permKey: 'sell' },
    { id: 'invoice_jkl', label: 'Generate Invoice', Icon: FileText, color: '#f59e0b', section: 'jklakshmi', permKey: 'invoice' },
    { id: 'admin_loading_status_jkl', label: 'Loading Realtime', Icon: LayoutDashboard, color: '#f59e0b', section: 'jklakshmi', permKey: 'loading_status' },

    ...(user?.role === 'admin' ? [
      { id: 'admin', label: 'Admin', Icon: Shield, color: '#a855f7', section: plant || 'jksuper' },
      { id: 'admin_backup', label: 'Backup Settings', Icon: Cloud, color: '#6366f1', section: plant || 'jksuper', adminOnly: true },
    ] : []),
  ];

  // Filter by plant AND permissions AND godown
  const FILTERED_NAV = NAV.map(n => {
    if (n.sub) {
      const allowedSubs = n.sub.filter(s => {
        // Godown filtering for subs (skip for admins)
        if (user?.role !== 'admin' && plant === 'jksuper' && godown) {
          if (s.id.toLowerCase().includes('kosli') && godown !== 'kosli') return false;
          if (s.id.toLowerCase().includes('jhajjar') && godown !== 'jhajjar') return false;
          if (s.id.toLowerCase().includes('jajjhar') && godown !== 'jhajjar') return false;
        }

        const pKey = s.permKey || n.permKey;
        if (!pKey || user?.role === 'admin') return true;
        if (!user?.permissions || Object.keys(user.permissions).length === 0) return true;
        const p = user.permissions[pKey];
        return p === 'view' || p === 'edit';
      });
      return { ...n, sub: allowedSubs };
    }
    return n;
  }).filter(n => {
    if (n.section !== (plant || 'jksuper')) return false;

    // Godown filtering for top-level (skip for admins)
    if (user?.role !== 'admin' && plant === 'jksuper' && godown) {
      if (n.id.toLowerCase().includes('kosli') && godown !== 'kosli') return false;
      if (n.id.toLowerCase().includes('jhajjar') && godown !== 'jhajjar') return false;
    }

    if (n.id === 'admin') return true;
    if (n.adminOnly && user?.role !== 'admin') return false;
    
    if (n.sub && n.sub.length === 0) return false;

    if (user?.role === 'admin') return true;
    if (!user?.permissions || Object.keys(user.permissions).length === 0) return true;

    if (!n.sub) {
      const p = user.permissions[n.permKey];
      return p === 'view' || p === 'edit';
    }
    return true;
  });


  // Redirect away from admin if not admin
  React.useEffect(() => {
    if (active === 'admin' && user?.role !== 'admin') setActive('lr_kosli');
  }, [user]);

  const path = window.location.pathname;
  if (path === '/loading-status') return <PublicLoadingStatus />;
  if (path === '/labour') return <LabourLoadingStatus />;


  if (path.startsWith('/receipt/')) {
    const parts = path.split('/');
    if (parts.length >= 4) {
      return <PublicReceipt externalTruckNo={decodeURIComponent(parts[2])} externalDate={decodeURIComponent(parts[3])} />;
    }
  }

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
      <div className={`sidebar-overlay${showMobileMenu ? ' show-mobile' : ''}`} onClick={() => setShowMobileMenu(false)} />
      <aside className={`sidebar${col ? ' collapsed' : ''}${showMobileMenu ? ' show-mobile' : ''}`}>
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
                  setShowMobileMenu(false); // Close on click for mobile
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
                }} 
                title={col ? label : undefined}
                style={active === id ? { 
                  background: sub ? `${color}15` : color, 
                  color: sub ? color : '#fff', 
                  borderColor: sub ? `${color}30` : color, 
                  fontWeight: 800, 
                  transform: 'translateX(4px)', 
                  boxShadow: `0 4px 12px ${color}${sub ? '20' : '60'}` 
                } : {}}
              >
                <span className="nav-indicator" style={{ background: sub ? color : '#fff' }} />
                <Icon size={20} color={active === id ? (sub ? color : '#fff') : 'currentColor'} />
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
                        onClick={() => { setActive(id); setSubActive(s.id); setShowMobileMenu(false); }}
                        style={{
                          background: active === id && subActive === s.id ? color : 'transparent', 
                          border: 'none', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', fontSize: active === id && subActive === s.id ? '12.5px' : '12px', 
                          fontWeight: active === id && subActive === s.id ? 800 : 600, transition: 'all 0.15s',
                          color: active === id && subActive === s.id ? '#fff' : 'var(--text-muted)',
                          transform: active === id && subActive === s.id ? 'translateX(8px)' : 'none',
                          boxShadow: active === id && subActive === s.id ? `0 4px 12px ${color}60` : 'none'
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
        <header className="topbar" style={{ position: 'relative', overflow: 'hidden' }}>
          {/* Cinematic Weather Background — Multi-layered physics engine */}
          <CinematicWeather weatherCode={weather.code} isDay={weather.isDay} temp={weather.temp} />

          <div className="topbar-left" style={{ position: 'relative', zIndex: 1 }}>
            <button className="mobile-menu-toggle" onClick={() => setShowMobileMenu(!showMobileMenu)}>
              {showMobileMenu ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div className="app-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {FILTERED_NAV.find(n => n.id === active)?.label}
              {/* Environment banner — visible in local/beta only */}
              {ENV_BANNER && (
                <span style={{
                  background: ENV_BANNER.bg,
                  color: '#000',
                  fontSize: '9px',
                  padding: '2px 8px',
                  borderRadius: '100px',
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  boxShadow: `0 0 12px ${ENV_BANNER.glow}`,
                  border: '1px solid rgba(0,0,0,0.15)',
                  letterSpacing: '0.06em'
                }}>{ENV_BANNER.label}</span>
              )}
              {user?.isSandbox && (
                <span style={{
                  background: '#f59e0b',
                  color: '#000',
                  fontSize: '9px',
                  padding: '2px 8px',
                  borderRadius: '100px',
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  boxShadow: '0 0 15px rgba(245,158,11,0.4)',
                  border: '1px solid rgba(0,0,0,0.1)'
                }}>Sandbox Mode</span>
              )}
            </div>
          </div>
          <div className="topbar-right" style={{ position: 'relative', zIndex: 1 }}>
            {/* Global Weather Widget */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginRight: '12px', background: 'rgba(255,255,255,0.1)', padding: '6px 12px', borderRadius: '14px', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <img src={`https://cdn.weatherapi.com/weather/64x64/${weather.isDay ? 'day' : 'night'}/${weather.code % 1000}.png`} style={{ width: '16px', height: '16px', opacity: 0.9 }} alt="" />
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'white' }}>
                  {weather.temp !== null ? `${weather.temp}°C` : '—°C'} • Jharli
                </span>
              </div>
              <div style={{ fontSize: '9px', fontWeight: 900, color: 'rgba(255,255,255,0.9)', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {weather.advice}
              </div>
            </div>
            <button className="notif-btn theme-toggle-btn" onClick={cycleTheme}
              title={`Theme: ${currentTheme.label} (click to switch)`}>
              <ThemeIcon size={17} />
              <span style={{ fontSize: '11px', fontWeight: 700, marginLeft: '5px', color: 'white' }}>
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
              {active === 'lr_kosli' && <LRModule role={user.role} permissions={user.permissions} brand="kosli" />}
              {active === 'lr_jhajjar' && <LRModule role={user.role} permissions={user.permissions} brand="jhajjar" />}
              {active === 'lr_jkl' && <LRModule role={user.role} permissions={user.permissions} brand="jkl" />}
              {active === 'voucher_dump' && <VoucherModule role={user.role} permissions={user.permissions} lockedType={subActive || 'Kosli_Bill'} brand="jksuper" />}
              {active === 'voucher_jkl' && <VoucherModule role={user.role} permissions={user.permissions} lockedType={subActive || 'Dump'} brand="jklakshmi" />}
              {active === 'balance_dump' && <BalanceSheet role={user.role} permissions={user.permissions} lockedType={subActive || 'Kosli_Bill'} brand="jksuper" />}
              {active === 'balance_jkl' && <BalanceSheet role={user.role} permissions={user.permissions} lockedType={subActive || 'Dump'} brand="jklakshmi" />}
              {active === 'cashbook_dump' && <CashbookModule role={user.role} permissions={user.permissions} initialTab={subActive || 'ledger'} moduleType="dump" />}
              {active === 'cashbook_jkl' && <CashbookModule role={user.role} permissions={user.permissions} initialTab={subActive || 'ledger'} moduleType="jkl" />}
              {active === 'stock_kosli' && <StockModule role={user.role} permissions={user.permissions} initialTab={subActive || 'overview'} brand="kosli" />}
              {active === 'stock_jhajjar' && <StockModule role={user.role} permissions={user.permissions} initialTab={subActive || 'overview'} brand="jhajjar" />}
              {active === 'stock_jkl' && <StockModule role={user.role} permissions={user.permissions} initialTab={subActive || 'overview'} brand="jkl" />}
              {(active === 'vehicles_dump' || active === 'vehicles_jkl') && <VehicleModule permissions={user.permissions} />}
              {(active === 'diesel_dump' || active === 'diesel_jkl') && <DieselModule permissions={user.permissions} />}
              {(active === 'mileage_dump' || active === 'mileage_jkl') && <MileageModule />}
              {(active === 'pay_dump' || active === 'pay_jkl') && <PayModule brand={active.includes('jkl') ? 'jkl' : 'dump'} role={user.role} permissions={user.permissions} />}
              {(active === 'sell_dump' || active === 'sell_jkl') && <SellModule brand={active.includes('jkl') ? 'jkl' : 'dump'} role={user.role} permissions={user.permissions} />}
              {active === 'admin' && (user?.role === 'admin') && <AdminPage />}
              {(active === 'invoice_dump') && <InvoiceModule brand="dump" role={user.role} permissions={user.permissions} />}
              {(active === 'invoice_jkl') && <InvoiceModule brand="jkl" role={user.role} permissions={user.permissions} />}
              {(active === 'admin_loading_status_dump' || active === 'admin_loading_status_jkl') && <AdminLoadingStatus globalWeather={weather} role={user.role} userGodown={godown} />}
              {active === 'admin_backup' && (user?.role === 'admin') && <AdminModule />}
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