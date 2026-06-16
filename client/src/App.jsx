import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutDashboard, Receipt, FileText, BarChart3, BookOpen, Package, ChevronRight, Sun, Moon, Coffee, Shield, LogOut, Cloud, CloudRain, Menu, X, Search } from 'lucide-react';
import TruckLoader from './components/TruckLoader';
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
import { Truck, Fuel, ShoppingCart, Gauge, Banknote, Users, Settings } from 'lucide-react';
import MileageModule from './modules/MileageModule';
import StaffProfileModule from './modules/StaffProfileModule';
import CinematicWeather from './components/CinematicWeather';
import PayModule from './modules/PayModule';
import PublicReceipt from './pages/PublicReceipt';
import LabourLoadingStatus from './modules/LabourLoadingStatus';
import PartyMaster from './modules/PartyMaster';
import AdminLayout from './pages/admin/AdminLayout';
import AdminLoginPage from './pages/admin/AdminLoginPage';
import TruckDashboard from './modules/TruckDashboard';
import DashboardHome from './modules/DashboardHome';
import CommandPalette from './components/CommandPalette';
import useViewport from './hooks/useViewport';
import MobileApp from './mobile/MobileApp';
import { processSyncQueue, count as queueCount } from './utils/offlineQueue';

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
  const vp = useViewport();
  const [active, setActive] = useState(() => {
    let saved = localStorage.getItem('vgtc-active');
    if (saved === 'lr_kosli' || saved === 'lr_jhajjar') { saved = 'lr_dump'; localStorage.setItem('vgtc-active', 'lr_dump'); }
    // One-time landing on the new Dashboard; afterwards last-used module is respected
    if (!localStorage.getItem('vgtc-nav-v2')) {
      localStorage.setItem('vgtc-nav-v2', '1');
      return 'dashboard';
    }
    if (saved) return saved;
    return 'dashboard';
  });
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

  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    const handler = () => setUpdateAvailable(true);
    window.addEventListener('sw-update-available', handler);
    return () => window.removeEventListener('sw-update-available', handler);
  }, []);

  const handleApplyUpdate = () => {
    setUpdateAvailable(false);
    window.applyUpdate?.();
    // fallback if SW not available
    setTimeout(() => window.location.reload(), 500);
  };

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [justCameOnline, setJustCameOnline] = useState(false);
  const [pendingSync, setPendingSync] = useState(0);
  const [syncStatus, setSyncStatus] = useState(null); // 'syncing' | 'done' | null

  // Load initial queue count
  useEffect(() => { queueCount().then(setPendingSync).catch(() => {}); }, []);

  // Listen for queue changes
  useEffect(() => {
    const handler = (e) => setPendingSync(e.detail?.count ?? 0);
    window.addEventListener('offline-queue-changed', handler);
    return () => window.removeEventListener('offline-queue-changed', handler);
  }, []);

  useEffect(() => {
    const goOnline = async () => {
      setIsOnline(true);
      setJustCameOnline(true);
      setTimeout(() => setJustCameOnline(false), 3000);
      // Process sync queue
      const n = await queueCount().catch(() => 0);
      if (n > 0) {
        setSyncStatus('syncing');
        try {
          const { synced, failed } = await processSyncQueue(ax);
          setSyncStatus('done');
          setTimeout(() => setSyncStatus(null), 4000);
          if (synced > 0) console.log(`[Sync] ${synced} ops synced${failed ? `, ${failed} failed` : ''}`);
        } catch { setSyncStatus(null); }
      }
    };
    const goOffline = () => { setIsOnline(false); setJustCameOnline(false); setSyncStatus(null); };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);

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

    // Global navigation listener for deep-linking across modules
    useEffect(() => {
        const handleNav = (e) => {
            const { active: newActive, subActive: newSubActive, search } = e.detail || {};
            if (newActive) {
                setActive(newActive);
                if (newSubActive !== undefined) {
                    setSubActive(newSubActive);
                    // Expand the parent's sub-menu so the sidebar reflects the jump
                    if (newSubActive) setExpanded(prev => ({ ...prev, [newActive]: true }));
                }
                if (search) {
                    // Store search term in localStorage for the target module to pick up
                    localStorage.setItem('vgtc-search-redirect', search);
                }
                // Scroll to top
                window.scrollTo({ top: 0, behavior: 'smooth' });
                // Force close mobile menu if open
                setShowMobileMenu(false);
            }
        };
        window.addEventListener('nav-module', handleNav);
        return () => window.removeEventListener('nav-module', handleNav);
    }, [plant]);

    // Ctrl+K / Cmd+K — command palette (window capture beats form-shortcut hooks)
    const [paletteOpen, setPaletteOpen] = useState(false);
    useEffect(() => {
        const handler = (e) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
                e.preventDefault();
                e.stopPropagation();
                setPaletteOpen(o => !o);
            }
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true });
    }, []);

  const cycleTheme = () => {
    const idx = THEMES.findIndex(t => t.id === theme);
    setTheme(THEMES[(idx + 1) % THEMES.length].id);
  };
  // Build nav items based on role
  const NAV = [
    // ── JK Super ──
    { id: 'lr_dump', label: 'Loading Receipt', Icon: Receipt, color: '#6366f1', section: 'jksuper', permKey: 'lr_dump' },
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
        { id: 'transfer', label: 'Transfer Stock' },
        { id: 'party_summary', label: 'Party Summary' },
      ]
    },
    {
      id: 'stock_jhajjar', label: 'Jhajjar Stock', Icon: Package, color: '#6366f1', section: 'jksuper', permKey: 'stock_jhajjar', sub: [
        { id: 'overview', label: 'Overview' },
        { id: 'migo', label: 'MIGO (Stock Entry)' },
        { id: 'challan', label: 'Create Challan' },
        { id: 'history', label: 'History' },
        { id: 'transfer', label: 'Transfer Stock' },
        { id: 'party_summary', label: 'Party Summary' },
      ]
    },
    {
      id: 'cashbook_dump', label: 'Cashbook', Icon: BookOpen, color: '#10b981', section: 'jksuper', permKey: 'cashbook', sub: [
        { id: 'ledger', label: 'Full Ledger' },
        { id: 'deposits', label: 'Deposits' },
        { id: 'voucher_cash', label: 'Voucher Cash Adv' },
        { id: 'cash_out', label: 'Cash Outs' },
      ]
    },
    { id: 'vehicles_dump', label: 'Vehicle Details', Icon: Truck, color: '#14b8a6', section: 'jksuper', permKey: 'vehicle' },
    { id: 'truck_dashboard', label: 'Truck Dashboard', Icon: BarChart3, color: '#14b8a6', section: 'jksuper', permKey: 'vehicle' },
    { id: 'diesel_dump', label: 'Diesel Control', Icon: Fuel, color: '#3b82f6', section: 'jksuper', permKey: 'diesel' },
    { id: 'mileage_dump', label: 'Mileage Tracker', Icon: Gauge, color: '#f59e0b', section: 'jksuper', permKey: 'mileage' },
    { id: 'pay_dump', label: 'Pay', Icon: Banknote, color: '#10b981', section: 'jksuper', permKey: 'pay', sub: [
        { id: 'freight', label: 'Freight Pay' },
        { id: 'online', label: 'Online Advances' },
        { id: 'firm', label: 'Firm Pay' },
        { id: 'staff', label: 'Staff Pay' },
      ]
    },
    { id: 'sell_dump', label: 'Sell', Icon: ShoppingCart, color: '#ec4899', section: 'jksuper', permKey: 'sell' },
    { id: 'invoice_dump', label: 'Generate Invoice', Icon: FileText, color: '#10b981', section: 'jksuper', permKey: 'invoice' },
    { id: 'admin_loading_status_dump', label: 'Loading Realtime', Icon: LayoutDashboard, color: '#6366f1', section: 'jksuper', permKey: 'loading_status' },

    // ── Jharli Dump & Plant (Merged JKL + JK Super) ──
    { id: 'lr_jharli', label: 'Loading Receipt', Icon: Receipt, color: '#f59e0b', section: 'jharli', permKey: 'lr_jkl' },
    {
      id: 'voucher_jharli', label: 'Voucher', Icon: FileText, color: '#f59e0b', section: 'jharli', sub: [
        { id: 'Dump', label: 'JKL Dump Voucher', permKey: 'voucher_jkl_dump' },
        { id: 'JK_Lakshmi', label: 'JK Lakshmi Voucher', permKey: 'voucher_jkl' },
        { id: 'JK_Super', label: 'JK Super Voucher', permKey: 'voucher_jksuper' },
      ]
    },
    {
      id: 'balance_jharli', label: 'Balance Sheet', Icon: BarChart3, color: '#f59e0b', section: 'jharli', sub: [
        { id: 'Dump', label: 'JKL Dump Sheet', permKey: 'balance_jkl_dump' },
        { id: 'JK_Lakshmi', label: 'JK Lakshmi Sheet', permKey: 'balance_jkl' },
        { id: 'JK_Super', label: 'JK Super Sheet', permKey: 'balance_jksuper' },
      ]
    },
    {
      id: 'stock_jharli', label: 'JK Lakshmi Stock', Icon: Package, color: '#f59e0b', section: 'jharli', permKey: 'stock_jkl', sub: [
        { id: 'overview', label: 'Overview' },
        { id: 'migo', label: 'MIGO (Stock Entry)' },
        { id: 'challan', label: 'Create Challan' },
        { id: 'history', label: 'History' },
        { id: 'transfer', label: 'Transfer Stock' },
        { id: 'party_summary', label: 'Party Summary' },
      ]
    },
    {
      id: 'cashbook_jharli', label: 'Cashbook', Icon: BookOpen, color: '#10b981', section: 'jharli', permKey: 'cashbook', sub: [
        { id: 'ledger', label: 'Full Ledger' },
        { id: 'deposits', label: 'Deposits' },
        { id: 'voucher_cash', label: 'Voucher Cash Adv' },
        { id: 'cash_out', label: 'Cash Outs' },
      ]
    },
    { id: 'vehicles_jharli', label: 'Vehicle Details', Icon: Truck, color: '#14b8a6', section: 'jharli', permKey: 'vehicle' },
    { id: 'diesel_jharli', label: 'Diesel Control', Icon: Fuel, color: '#3b82f6', section: 'jharli', permKey: 'diesel' },
    { id: 'mileage_jharli', label: 'Mileage Tracker', Icon: Gauge, color: '#f59e0b', section: 'jharli', permKey: 'mileage' },
    { id: 'pay_jharli', label: 'Pay', Icon: Banknote, color: '#10b981', section: 'jharli', permKey: 'pay', sub: [
        { id: 'freight', label: 'Freight Pay' },
        { id: 'online', label: 'Online Advances' },
        { id: 'firm', label: 'Firm Pay' },
        { id: 'staff', label: 'Staff Pay' },
      ]
    },
    { id: 'sell_jharli', label: 'Sell', Icon: ShoppingCart, color: '#ec4899', section: 'jharli', permKey: 'sell' },
    { id: 'invoice_jharli', label: 'Generate Invoice', Icon: FileText, color: '#10b981', section: 'jharli', permKey: 'invoice' },
    { id: 'admin_loading_status_jharli', label: 'Loading Realtime', Icon: LayoutDashboard, color: '#f59e0b', section: 'jharli', permKey: 'loading_status' },
  ];

  // Filter by plant AND permissions AND godown
  const FILTERED_NAV = NAV.map(n => {
    if (n.sub) {
      const allowedSubs = n.sub.filter(s => {
        const pKey = s.permKey || n.permKey;
        // Godown filtering for subs — applies to ALL users including admin
        if (plant === 'jksuper' && godown) {
          const sid = s.id.toLowerCase();
          const slabel = (s.label || '').toLowerCase();
          if ((sid.includes('kosli') || slabel.includes('kosli')) && godown !== 'kosli') return false;
          if ((sid.includes('jhajjar') || sid.includes('jajjhar') || slabel.includes('jhajjar') || slabel.includes('jajjhar')) && godown !== 'jhajjar') return false;
          if ((sid === 'jk_super' || slabel.includes('jk super')) && (godown === 'kosli' || godown === 'jhajjar')) return false;
        }

        if (!pKey || user?.role === 'admin') return true;
        if (!user?.permissions || Object.keys(user.permissions).length === 0) return true;
        const p = user.permissions[pKey];
        return p === 'view' || p === 'edit';
      });
      return { ...n, sub: allowedSubs };
    }
    return n;
  }).filter(n => {
    const activeSection = plant === 'jklakshmi' ? 'jharli' : (plant || 'jksuper');
    if (n.section !== activeSection) return false;

    // Godown filtering for top-level — applies to ALL users including admin
    if (plant === 'jksuper' && godown) {
      const nid = n.id.toLowerCase();
      if (nid.includes('kosli') && godown !== 'kosli') return false;
      if (nid.includes('jhajjar') && godown !== 'jhajjar') return false;
    }
    
    if (n.sub && n.sub.length === 0) return false;

    if (user?.role === 'admin') return true;
    if (!user?.permissions || Object.keys(user.permissions).length === 0) return true;

    if (!n.sub) {
      // lr_dump is the unified LR for VGTC jksuper — fall back to legacy lr_kosli or lr_jhajjar perms
      let effectiveKey = n.permKey;
      if (n.id === 'lr_dump' && !user.permissions[n.permKey]) {
        effectiveKey = user.permissions['lr_kosli'] ? 'lr_kosli' : 'lr_jhajjar';
      }
      const p = user.permissions[effectiveKey];
      return p === 'view' || p === 'edit';
    }
    return true;
  });

  // Dashboard — pinned above groups, visible to all roles/plants
  const DASHBOARD_ITEM = { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard, color: '#6366f1' };
  const FULL_NAV = [DASHBOARD_ITEM, ...FILTERED_NAV];
  const filteredNavIds = new Set(FULL_NAV.map(n => n.id));

  // Command palette registry — flattened nav + quick actions
  const navCommand = (id, subId) =>
    () => window.dispatchEvent(new CustomEvent('nav-module', { detail: { active: id, subActive: subId ?? '' } }));
  const COMMANDS = [
    ...FULL_NAV.flatMap(n => n.sub && n.sub.length
      ? n.sub.map(s => ({ id: `${n.id}/${s.id}`, label: `${n.label} › ${s.label}`, Icon: n.Icon, color: n.color, group: 'Go to', keywords: n.id, run: navCommand(n.id, s.id) }))
      : [{ id: n.id, label: n.label, Icon: n.Icon, color: n.color, group: 'Go to', keywords: n.id, run: navCommand(n.id) }]
    ),
    ...(filteredNavIds.has(plant === 'jklakshmi' ? 'lr_jharli' : 'lr_dump')
      ? [{ id: 'qa-new-lr', label: 'New LR Entry', Icon: Receipt, color: '#10b981', group: 'Action', keywords: 'create add loading receipt', run: navCommand(plant === 'jklakshmi' ? 'lr_jharli' : 'lr_dump') }]
      : []),
    { id: 'qa-theme', label: 'Toggle theme', Icon: Sun, color: '#f59e0b', group: 'Action', keywords: 'dark light sepia mode', run: () => cycleTheme() },
  ];


  const path = window.location.pathname;
  // Move public/auth-independent routes here
  if (path === '/loading-status') return <PublicLoadingStatus />;
  if (path === '/labour') return <LabourLoadingStatus />;


  if (path.startsWith('/receipt/')) {
    const parts = path.split('/');
    if (parts.length >= 4) {
      return <PublicReceipt externalTruckNo={decodeURIComponent(parts[2])} externalDate={decodeURIComponent(parts[3])} />;
    }
  }

  if (path === '/admin/login') return <AdminLoginPage />;

  if (!ready) return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)',
      color: 'var(--text-muted)'
    }}>
      <TruckLoader
        size={160}
        text={isWakingUp ? 'Waking up server...' : 'Loading VGTC...'}
        subText={isWakingUp ? 'Server spins down after inactivity. Please wait ~50 seconds.' : 'Authenticating your session'}
      />
    </div>
  );

  // Admin portal should be handled AFTER ready check, so we have the correct user state.
  if (path.startsWith('/admin')) return <AdminLayout />;

  if (!user) return <LoginPage />;

  const currentTheme = THEMES.find(t => t.id === theme) || THEMES[0];
  const ThemeIcon = currentTheme.Icon;

  // Renders a module by id — shared by the desktop page-area and the mobile More tab.
  const renderModule = (id, sub = '') => (
    <>
      {id === 'dashboard' && <DashboardHome filteredNavIds={filteredNavIds} />}
      {id === 'lr_dump' && <LRModule role={user.role} permissions={user.permissions} brand={godown === 'jhajjar' ? 'jhajjar' : 'kosli'} />}
      {(id === 'lr_jkl' || id === 'lr_jharli') && <LRModule role={user.role} permissions={user.permissions} brand="jkl" />}
      {id === 'voucher_dump' && <VoucherModule role={user.role} permissions={user.permissions} lockedType={sub || 'Kosli_Bill'} brand="jksuper" />}
      {id === 'voucher_jharli' && <VoucherModule role={user.role} permissions={user.permissions} lockedType={sub || 'Dump'} brand={sub === 'JK_Super' ? 'jksuper' : 'jklakshmi'} />}
      {id === 'balance_dump' && <BalanceSheet role={user.role} permissions={user.permissions} lockedType={sub || 'Kosli_Bill'} brand="jksuper" />}
      {id === 'balance_jharli' && <BalanceSheet role={user.role} permissions={user.permissions} lockedType={sub || 'Dump'} brand={sub === 'JK_Super' ? 'jksuper' : 'jklakshmi'} />}
      {id === 'cashbook_dump' && <CashbookModule role={user.role} permissions={user.permissions} initialTab={sub || 'ledger'} moduleType="dump" />}
      {id === 'cashbook_jharli' && <CashbookModule role={user.role} permissions={user.permissions} initialTab={sub || 'ledger'} moduleType="jkl" />}
      {id === 'stock_kosli' && <StockModule role={user.role} permissions={user.permissions} initialTab={sub || 'overview'} brand="kosli" />}
      {id === 'stock_jhajjar' && <StockModule role={user.role} permissions={user.permissions} initialTab={sub || 'overview'} brand="jhajjar" />}
      {(id === 'stock_jkl' || id === 'stock_jharli') && <StockModule role={user.role} permissions={user.permissions} initialTab={sub || 'overview'} brand="jkl" />}
      {(id === 'vehicles_dump' || id === 'vehicles_jkl' || id === 'vehicles_jharli') && <VehicleModule permissions={user.permissions} />}
      {id === 'truck_dashboard' && <TruckDashboard role={user.role} permissions={user.permissions} />}
      {(id === 'diesel_dump' || id === 'diesel_jkl' || id === 'diesel_jharli') && <DieselModule permissions={user.permissions} />}
      {(id === 'mileage_dump' || id === 'mileage_jkl' || id === 'mileage_jharli') && <MileageModule />}
      {(id === 'pay_dump' || id === 'pay_jkl' || id === 'pay_jharli') && <PayModule brand={id.includes('jkl') || id.includes('jharli') ? 'jkl' : 'dump'} role={user.role} permissions={user.permissions} initialView={sub || 'freight'} />}
      {(id === 'sell_dump' || id === 'sell_jkl' || id === 'sell_jharli') && <SellModule brand={id.includes('jkl') || id.includes('jharli') ? 'jkl' : 'dump'} role={user.role} permissions={user.permissions} />}
      {(id === 'invoice_dump' || id === 'invoice_jharli') && <InvoiceModule brand={id.includes('jharli') ? 'jkl' : 'dump'} role={user.role} permissions={user.permissions} />}
      {(id === 'invoice_jkl') && <InvoiceModule brand="jkl" role={user.role} permissions={user.permissions} />}
      {(id === 'admin_loading_status_dump' || id === 'admin_loading_status_jkl' || id === 'admin_loading_status_jharli') && <AdminLoadingStatus globalWeather={weather} role={user.role} userGodown={godown} userPlant={plant} />}
      {(id === 'party_master_dump' || id === 'party_master_jharli') && <PartyMaster />}
      {/* ── Generic (non-VGTC orgs) ── */}
      {id === 'lr_main' && <LRModule role={user.role} permissions={user.permissions} brand="main" />}
      {id === 'voucher_main' && <VoucherModule role={user.role} permissions={user.permissions} lockedType={sub || 'Bill'} brand="main" />}
      {id === 'balance_main' && <BalanceSheet role={user.role} permissions={user.permissions} lockedType={sub || 'Bill'} brand="main" />}
      {id === 'stock_main' && <StockModule role={user.role} permissions={user.permissions} initialTab={sub || 'overview'} brand="main" />}
      {id === 'cashbook_main' && <CashbookModule role={user.role} permissions={user.permissions} initialTab={sub || 'ledger'} moduleType="main" />}
      {id === 'vehicles_main' && <VehicleModule permissions={user.permissions} />}
      {id === 'diesel_main' && <DieselModule permissions={user.permissions} />}
      {id === 'mileage_main' && <MileageModule />}
      {id === 'pay_main' && <PayModule brand="main" role={user.role} permissions={user.permissions} />}
      {id === 'sell_main' && <SellModule brand="main" role={user.role} permissions={user.permissions} />}
      {id === 'invoice_main' && <InvoiceModule brand="main" role={user.role} permissions={user.permissions} />}
      {id === 'realtime_main' && <AdminLoadingStatus globalWeather={weather} role={user.role} userGodown={godown} userPlant={plant} />}
    </>
  );

  // ── Mobile / tablet: dedicated app-like UI ──
  if (vp.mode === 'mobile') {
    return (
      <MobileApp
        user={user} plant={plant} godown={godown}
        theme={theme} cycleTheme={cycleTheme} logout={logout}
        cols={vp.cols} filteredNavIds={filteredNavIds}
        FULL_NAV={FULL_NAV} FILTERED_NAV={FILTERED_NAV}
        weather={weather} isOnline={isOnline} pendingSync={pendingSync}
        renderModule={renderModule}
      />
    );
  }

  return (
    <div className="app-shell">
      <div className={`sidebar-overlay${showMobileMenu ? ' show-mobile' : ''}`} onClick={() => setShowMobileMenu(false)} />
      <aside className={`sidebar${col ? ' collapsed' : ''}${showMobileMenu ? ' show-mobile' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-icon"><img src="/vgtc-logo.svg" alt="VGTC" width={26} height={26} style={{ borderRadius: 4 }} /></div>
          {!col && <div className="brand-text">
            <div className="brand-name">Vikas Goods</div>
            <div className="brand-sub">Transport System</div>
          </div>}
        </div>
        <nav className="sidebar-nav">
          {/* Location label header */}
          {!col && (() => {
            let locLabel = 'Jharli Dump & Plant';
            let locColor = '#f59e0b';
            if (plant === 'jksuper' && godown === 'kosli') { locLabel = 'Kosli Dump'; locColor = '#6366f1'; }
            else if (plant === 'jksuper' && godown === 'jhajjar') { locLabel = 'Jajjhar Dump'; locColor = '#14b8a6'; }
            return (
              <div style={{ padding: '8px 14px 6px', fontSize: '9px', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: locColor, opacity: 0.85, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: locColor, display: 'inline-block' }} />
                {locLabel}
              </div>
            );
          })()}
          {(() => {
            const renderNavItem = ({ id, label, Icon, color, sub }) => (
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
            );

            // Sidebar groups — module ids map by prefix; unknown ids fall through ungrouped
            const groupOf = (id) => {
              if (/^(lr_|voucher_|stock_|admin_loading_status_|sell_|invoice_|realtime_)/.test(id)) return 'Operations';
              if (/^(balance_|cashbook_|pay_)/.test(id)) return 'Money';
              if (/^(vehicles_|truck_dashboard|diesel_|mileage_)/.test(id)) return 'Fleet';
              return null;
            };
            const GROUP_ORDER = ['Operations', 'Money', 'Fleet'];
            const groupLabelStyle = { padding: '12px 14px 4px', fontSize: '9px', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', opacity: 0.7 };

            return (
              <>
                {renderNavItem(DASHBOARD_ITEM)}
                {GROUP_ORDER.map(g => {
                  const items = FILTERED_NAV.filter(n => groupOf(n.id) === g);
                  if (items.length === 0) return null;
                  return (
                    <div key={g}>
                      {!col && <div style={groupLabelStyle}>{g}</div>}
                      {items.map(renderNavItem)}
                    </div>
                  );
                })}
                {FILTERED_NAV.filter(n => !groupOf(n.id)).map(renderNavItem)}
              </>
            );
          })()}
        </nav>
        {/* User info + logout at bottom of sidebar */}
        <div style={{ marginTop: 'auto', padding: col ? '12px 8px' : '12px 14px', borderTop: '1px solid var(--border)' }}>
          {!col && (
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: '1px' }}>{user.role}</div>
            </div>
          )}
          {user?.role === 'admin' && (
            <button onClick={() => window.location.href = '/admin'}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 10px',
                borderRadius: '10px', border: '1px solid var(--border)', background: 'rgba(139, 92, 246, 0.1)',
                color: '#a78bfa', fontSize: '12px', fontWeight: 800, cursor: 'pointer',
                transition: 'all 0.18s', justifyContent: col ? 'center' : 'flex-start',
                fontFamily: 'inherit', marginBottom: '8px'
              }}>
              <Shield size={15} />
              {!col && 'Admin Portal'}
            </button>
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
            <div className="app-title" style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
              {FULL_NAV.find(n => n.id === active)?.label}
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
            {/* Command palette trigger */}
            <button onClick={() => setPaletteOpen(true)} title="Search & jump anywhere (Ctrl+K)"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', padding: '6px 12px', cursor: 'pointer', marginRight: '8px' }}>
              <Search size={13} color="rgba(255,255,255,0.8)" />
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>Search</span>
              <kbd style={{ fontSize: '9px', fontWeight: 800, color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: '4px', padding: '1px 5px' }}>Ctrl K</kbd>
            </button>
            {/* Offline/sync indicator */}
            {(pendingSync > 0 || !isOnline) && (
              <div title={isOnline ? `${pendingSync} operations queued offline — syncing` : `Offline — ${pendingSync} operations queued`}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', background: !isOnline ? 'rgba(244,63,94,0.3)' : 'rgba(99,102,241,0.3)', borderRadius: '10px', padding: '4px 10px', marginRight: '8px', border: `1px solid ${!isOnline ? 'rgba(244,63,94,0.5)' : 'rgba(99,102,241,0.5)'}`, cursor: 'default' }}>
                <span style={{ fontSize: '10px' }}>{!isOnline ? '⚡' : '⟳'}</span>
                <span style={{ fontSize: '10px', fontWeight: 800, color: '#fff' }}>{pendingSync > 0 ? `${pendingSync} pending` : 'Offline'}</span>
              </div>
            )}
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
            <div className="sep-v" style={{ background: 'rgba(255,255,255,0.3)' }} />
            <div className="user-chip">
              <div className="user-info">
                <div className="user-name" style={{ color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>{user.name}</div>
                <div className="user-role" style={{ color: 'rgba(255,255,255,0.8)' }}>{user.role}</div>
              </div>
              <div className="user-avatar" style={{ fontSize: '14px', fontWeight: 900, color: 'white' }}>
                {user.name.charAt(0).toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        {/* ── Update available banner ── */}
        {updateAvailable && (
          <div style={{
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff', fontSize: '13px', fontWeight: 700,
            padding: '10px 20px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap',
            boxShadow: '0 2px 12px rgba(99,102,241,0.4)',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>🚀</span>
              <span>New update available — reload to get the latest version</span>
            </span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                onClick={handleApplyUpdate}
                style={{ background: '#fff', color: '#6366f1', border: 'none', borderRadius: '8px', padding: '6px 18px', fontWeight: 800, fontSize: '12px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
                Reload Now
              </button>
              <button
                onClick={() => setUpdateAvailable(false)}
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 12px', fontWeight: 600, fontSize: '11px', cursor: 'pointer' }}>
                Later
              </button>
            </div>
          </div>
        )}

        {/* Offline / sync status banner — single child pattern for AnimatePresence compat */}
        {(() => {
          let banner = null;
          if (!isOnline)
            banner = { key: 'offline', bg: 'rgba(244,63,94,0.92)', text: `⚡ Offline — showing cached data. Entries queued, will sync on reconnect.${pendingSync > 0 ? ` (${pendingSync} pending)` : ''}` };
          else if (syncStatus === 'syncing')
            banner = { key: 'syncing', bg: 'rgba(99,102,241,0.92)', text: `⟳ Syncing ${pendingSync} offline operation${pendingSync !== 1 ? 's' : ''} to server…` };
          else if (syncStatus === 'done')
            banner = { key: 'done', bg: 'rgba(16,185,129,0.92)', text: '✓ All offline changes synced successfully' };
          else if (justCameOnline)
            banner = { key: 'online', bg: 'rgba(16,185,129,0.92)', text: '✓ Back online' };

          if (!banner) return null;
          return (
            <div style={{ background: banner.bg, color: '#fff', textAlign: 'center', fontSize: '12px', fontWeight: 800, padding: '7px 16px' }}>
              {banner.text}
            </div>
          );
        })()}

        <div className="page-area">
          <AnimatePresence mode="wait">
            <motion.div key={active + subActive} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="page-content">
              {renderModule(active, subActive)}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Ctrl+K command palette */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={COMMANDS} />

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
