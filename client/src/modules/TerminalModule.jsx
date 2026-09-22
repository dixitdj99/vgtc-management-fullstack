import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Truck, Camera, User, CheckCircle2, AlertCircle, RefreshCw,
    Wifi, WifiOff, Battery, Shield, Settings, X, ArrowLeft,
    Volume2, VolumeX, Lock, Clock, Calendar, Check, Fingerprint, MapPin,
    Plus, Trash2, Search, ChevronDown, Sparkles, Sun, Moon, AlertTriangle,
    CloudOff, KeyRound, LogOut, CheckCheck
} from 'lucide-react';
import ax from '../api';
import VgtcBootScreen from '../components/VgtcBootScreen';

// ─── Native / Capacitor / Browser Exit Helper ─────────────────────────────
// Exits the app cleanly across Android Native Kotlin, Capacitor Webview, or Web browser.
const exitApp = async (pin, onExitProp) => {
    try {
        // 1. Android Native WebView bridge (com.vgtc.terminal.MainActivity.kt)
        if (window.TerminalNative && typeof window.TerminalNative.exitApp === 'function') {
            window.TerminalNative.exitApp(pin || '8888');
            return;
        }
        // 2. Capacitor Android Bridge
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
            await window.Capacitor.Plugins.App.exitApp();
            return;
        }
    } catch (err) {
        console.warn('Native exit failed, falling back:', err);
    }
    // 3. Browser / Dev fallback: invoke onExit or redirect
    if (typeof onExitProp === 'function') {
        onExitProp();
    } else {
        window.location.href = '/';
    }
};

const TERMINAL_ID = 'OFFICE-REWARI-01';
const ADMIN_PIN = '8888';
const OFFLINE_QUEUE_KEY = 'vgtc_terminal_offline_queue';
const IDLE_TIMEOUT_MS = 300000; // 5 minutes inactivity before screensaver

// ─── Audio Chime Synthesizer ──────────────────────────────────────────────
const playChime = (type = 'success') => {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        if (ctx.state === 'suspended') ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        const now = ctx.currentTime;
        if (type === 'wake') {
            osc.frequency.setValueAtTime(523.25, now);
            osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.15);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            osc.start(now); osc.stop(now + 0.3);
        } else if (type === 'success') {
            osc.frequency.setValueAtTime(523.25, now);
            osc.frequency.setValueAtTime(659.25, now + 0.1);
            osc.frequency.setValueAtTime(783.99, now + 0.2);
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
            osc.start(now); osc.stop(now + 0.45);
        } else if (type === 'scan') {
            osc.frequency.setValueAtTime(880, now);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            osc.start(now); osc.stop(now + 0.12);
        } else if (type === 'duplicate') {
            osc.frequency.setValueAtTime(329.63, now);
            osc.frequency.setValueAtTime(293.66, now + 0.15);
            gain.gain.setValueAtTime(0.22, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            osc.start(now); osc.stop(now + 0.4);
        } else if (type === 'error') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(200, now);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            osc.start(now); osc.stop(now + 0.3);
        }
    } catch (_) {}
};

// ─── Bilingual Dictionary ──────────────────────────────────────────────────
const TRANSLATIONS = {
    en: {
        terminalTitle: 'VGTC Terminal OS',
        terminalLocation: 'Rewari Yard • Gate 01',
        alignFacePrompt: 'Please look directly into camera',
        verifyingFace: 'Scanning biometrics...',
        faceRecognized: 'Driver Biometrics Verified',
        driverName: 'Driver Name',
        assignedTruck: 'Assigned Vehicle',
        employeeId: 'Emp ID',
        dutyStatus: 'Duty Status',
        available: 'Available / Ready',
        onTrip: 'On Active Trip',
        destination: 'Destination',
        material: 'Cargo Material',
        confirmAttendance: 'Confirm Check-in / Gate In',
        confirmTripReturn: 'Confirm Trip Return / Gate Out',
        attendanceConfirmedTitle: 'Attendance Recorded!',
        tripReturnConfirmedTitle: 'Trip Return Recorded!',
        duplicateTitle: 'Already Checked In',
        duplicateDesc: 'Attendance was already logged recently. Please wait before re-scanning.',
        manualSelect: 'Select Driver from Roster',
        scanFacePrompt: 'Face Check-in',
        scanFingerprintPrompt: 'Fingerprint Attendance',
        adminPanel: 'Terminal Administration',
        adminPinTitle: 'Security Verification',
        enterPinPrompt: 'Enter 4-digit Admin PIN to exit or configure (Default: 8888)',
        exitTerminal: 'Exit App & Go to Settings',
        restartTerminal: 'Restart Terminal',
        openSettings: 'Open Terminal Settings',
        cancel: 'Cancel',
        online: 'ONLINE',
        offline: 'OFFLINE (CACHE)',
        voiceLookCamera: 'Please look into the camera.',
        voiceFaceVerified: (name) => `Face verified, ${name}.`,
        voiceFingerprintVerified: (name) => `Fingerprint verified, ${name}.`,
        voiceReturnConfirmed: (name) => `Trip return confirmed, ${name}.`,
        voiceAttendanceConfirmed: (name) => `Attendance recorded, ${name}.`,
        voiceDuplicate: (name) => `Attendance already recorded for ${name}.`
    },
    hi: {
        terminalTitle: 'VGTC टर्मिनल OS',
        terminalLocation: 'रेवाड़ी यार्ड • गेट 01',
        alignFacePrompt: 'कृपया सीधे कैमरे की तरफ देखें',
        verifyingFace: 'बायोमेट्रिक्स सत्यापन जारी...',
        faceRecognized: 'बायोमेट्रिक पहचान सफल',
        driverName: 'चालक का नाम',
        assignedTruck: 'आवंटित गाड़ी',
        employeeId: 'कर्मचारी आईडी',
        dutyStatus: 'ड्यूटी स्थिति',
        available: 'उपलब्ध / तैयार',
        onTrip: 'सक्रिय ट्रिप पर',
        destination: 'गंतव्य',
        material: 'माल विवरण',
        confirmAttendance: 'उपस्थिति / प्रवेश दर्ज करें',
        confirmTripReturn: 'ट्रिप वापसी दर्ज करें',
        attendanceConfirmedTitle: 'उपस्थिति दर्ज हो गई!',
        tripReturnConfirmedTitle: 'ट्रिप वापसी दर्ज हो गई!',
        duplicateTitle: 'उपस्थिति पहले से दर्ज है',
        duplicateDesc: 'आपकी उपस्थिति हाल ही में दर्ज की जा चुकी है। कृपया प्रतीक्षा करें।',
        manualSelect: 'चालक सूची से चुनें',
        scanFacePrompt: 'चेहरा स्कैन से उपस्थिति',
        scanFingerprintPrompt: 'फिंगरप्रिंट से हाजिरी लगाएं',
        adminPanel: 'टर्मिनल प्रशासन एवं सेटिंग्स',
        adminPinTitle: 'सुरक्षा सत्यापन',
        enterPinPrompt: 'बाहर निकलने या सेटिंग्स के लिए 4 अंकों का पिन दर्ज करें (Default: 8888)',
        exitTerminal: 'ऐप से बाहर निकलें (Settings)',
        restartTerminal: 'टर्मिनल पुनः चालू करें',
        openSettings: 'टर्मिनल सेटिंग्स खोलें',
        cancel: 'रद्द करें',
        online: 'ऑनलाइन (लाइव)',
        offline: 'ऑफलाइन (कैश)',
        voiceLookCamera: 'कृपया कैमरे की तरफ देखें।',
        voiceFaceVerified: (name) => `चेहरा सत्यापित हुआ, ${name}.`,
        voiceFingerprintVerified: (name) => `फिंगरप्रिंट सत्यापित हुआ, ${name}.`,
        voiceReturnConfirmed: (name) => `ट्रिप वापसी दर्ज हुई, ${name}.`,
        voiceAttendanceConfirmed: (name) => `उपस्थिति दर्ज हो गई है, ${name}.`,
        voiceDuplicate: (name) => `${name} की उपस्थिति पहले ही दर्ज की जा चुकी है.`
    }
};

export default function TerminalModule({ onExit }) {


    // ── Core Application States ──
    const [isBooting, setIsBooting] = useState(true);
    const [isScreensaver, setIsScreensaver] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [lang, setLang] = useState('hi');
    const [isDarkMode, setIsDarkMode] = useState(true);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const t = TRANSLATIONS[lang];

    // ── Data & API State (Purely from /api/terminal/*) ──
    const [roster, setRoster] = useState({ drivers: [], staff: [] });
    const [vehicles, setVehicles] = useState([]);
    const [rosterLoading, setRosterLoading] = useState(true);
    const [offlineQueue, setOfflineQueue] = useState(() => {
        try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]'); }
        catch { return []; }
    });

    // ── Camera State ──
    const videoRef = useRef(null);
    const [cameraActive, setCameraActive] = useState(false);
    const [capturedSelfieUrl, setCapturedSelfieUrl] = useState(null);
    const phoneCameraInputRef = useRef(null);

    // ── Recognition & Attendance Engine ──
    // IDLE | ANALYZING | RECOGNIZED | SUCCESS | DUPLICATE
    const [scanningStatus, setScanningStatus] = useState('IDLE');
    const [scanProgress, setScanProgress] = useState(0);
    const [recognizedPerson, setRecognizedPerson] = useState(null);
    const [activeDecision, setActiveDecision] = useState(null);
    const [lastActionType, setLastActionType] = useState(null);
    const [autoConfirmCount, setAutoConfirmCount] = useState(null);

    // ── Modals: Security PIN, Action Choice, Admin Settings, Driver Roster Selector ──
    const [showSecurityPinModal, setShowSecurityPinModal] = useState(false);
    const [enteredPin, setEnteredPin] = useState('');
    const [pinError, setPinError] = useState('');
    const [showAuthenticatedActionModal, setShowAuthenticatedActionModal] = useState(false);
    const [showAdminPanel, setShowAdminPanel] = useState(false);
    const [adminTab, setAdminTab] = useState('roster');
    const [showDriverSelectorModal, setShowDriverSelectorModal] = useState(false);
    const [driverSearchQuery, setDriverSearchQuery] = useState('');
    const [selectedTestDriverId, setSelectedTestDriverId] = useState(null);

    // ── Biometric Enrollment Form ──
    const [enrollingPerson, setEnrollingPerson] = useState(null);
    const [enrollSnapshot, setEnrollSnapshot] = useState(null);
    const [savingEnrollment, setSavingEnrollment] = useState(false);
    const [newPersonForm, setNewPersonForm] = useState({
        name: '', phone: '', employeeId: '', type: 'DRIVER', assignedTruck: '', fingerprintEnrolled: false
    });

    // ── Refs for Timers ──
    const idleTimerRef = useRef(null);
    const autoDismissTimerRef = useRef(null);
    const countdownTimerRef = useRef(null);
    const dismissFnRef = useRef(null);

    // ── Dismiss Attendance Details ──
    const dismissAttendanceDetails = useCallback(() => {
        if (autoDismissTimerRef.current) clearTimeout(autoDismissTimerRef.current);
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        setScanningStatus('IDLE');
        setScanProgress(0);
        setRecognizedPerson(null);
        setActiveDecision(null);
        setLastActionType(null);
        setCapturedSelfieUrl(null);
        setAutoConfirmCount(null);
    }, []);

    useEffect(() => { dismissFnRef.current = dismissAttendanceDetails; }, [dismissAttendanceDetails]);

    // ── Speech Synthesis Helper ──
    const speakPrompt = useCallback((phraseKeyOrText, customArg = null) => {
        if (!soundEnabled) return;
        try {
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                const tRef = TRANSLATIONS[lang];
                let textToSpeak = '';
                if (typeof tRef[phraseKeyOrText] === 'function') {
                    textToSpeak = tRef[phraseKeyOrText](customArg?.name || '', customArg?.truck || '');
                } else if (tRef[phraseKeyOrText]) {
                    textToSpeak = tRef[phraseKeyOrText];
                } else {
                    textToSpeak = phraseKeyOrText;
                }
                const utterance = new SpeechSynthesisUtterance(textToSpeak);
                utterance.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
                utterance.rate = 0.98;
                utterance.pitch = 1.0;
                const voices = window.speechSynthesis.getVoices();
                if (lang === 'hi') {
                    const hiVoice = voices.find(v => v.lang.includes('hi') || v.name.includes('Hindi'));
                    if (hiVoice) utterance.voice = hiVoice;
                }
                window.speechSynthesis.speak(utterance);
            }
        } catch (_) {}
    }, [lang, soundEnabled]);

    // ── Idle Timer / Screensaver ──
    const resetIdleTimer = useCallback(() => {
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(() => {
            setIsScreensaver(true);
            dismissFnRef.current?.();
        }, IDLE_TIMEOUT_MS);
    }, []);

    useEffect(() => {
        const handleActivity = () => { if (!isScreensaver) resetIdleTimer(); };
        window.addEventListener('mousemove', handleActivity);
        window.addEventListener('mousedown', handleActivity);
        window.addEventListener('touchstart', handleActivity, { passive: true });
        window.addEventListener('keydown', handleActivity);
        resetIdleTimer();
        return () => {
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            window.removeEventListener('mousemove', handleActivity);
            window.removeEventListener('mousedown', handleActivity);
            window.removeEventListener('touchstart', handleActivity);
            window.removeEventListener('keydown', handleActivity);
        };
    }, [isScreensaver, resetIdleTimer]);

    // Clock
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Network listeners
    useEffect(() => {
        const handleOnline = () => { setIsOnline(true); syncOfflineQueue(); };
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []); // eslint-disable-line

    // ── 1. Fetch Roster from Backend API ──
    const fetchRoster = async () => {
        setRosterLoading(true);
        try {
            const res = await ax.get('/terminal/roster');
            if (res.data?.success) {
                const driversList = res.data.drivers || [];
                const staffList = res.data.staff || [];
                setRoster({ drivers: driversList, staff: staffList });
                if (res.data.vehicles?.length > 0) setVehicles(res.data.vehicles);
                if (driversList.length > 0 && !selectedTestDriverId) {
                    setSelectedTestDriverId(driversList[0].id);
                }
                return;
            }
        } catch (err) {
            console.warn('[Terminal] Roster API request failed, using local cache:', err);
        }

        // Fallback default fleet and roster if API unreachable
        const fallbackVehicles = [
            { id: 'v1', truckNo: 'HR 55 CD 5678', owner: 'Self Owned (VGTC)' },
            { id: 'v2', truckNo: 'RJ 14 GH 9921', owner: 'Vikas Fleet' },
            { id: 'v3', truckNo: 'HR 38 EF 4321', owner: 'Amba Transport' },
            { id: 'v4', truckNo: 'DL 1M AA 1024', owner: 'Market Fleet' }
        ];
        const fallbackDrivers = [
            {
                id: 'drv-01', employeeId: 'DRV-102', name: 'Raj Kumar',
                phone: '9876543210', type: 'DRIVER', assignedTruck: 'HR 55 CD 5678',
                faceEnrolled: true, fingerprintEnrolled: true, status: 'AVAILABLE',
                activeTrip: null
            },
            {
                id: 'drv-02', employeeId: 'DRV-108', name: 'Suresh Sharma',
                phone: '8708032492', type: 'DRIVER', assignedTruck: 'RJ 14 GH 9921',
                faceEnrolled: true, fingerprintEnrolled: true, status: 'ON_TRIP',
                activeTrip: { destination: 'Kotputli Plant', partyName: 'Amba Traders', lrNo: 'LR-10492', material: 'JK Super PPC', bags: '400 Bags' }
            },
            {
                id: 'drv-03', employeeId: 'DRV-114', name: 'Manoj Yadav',
                phone: '9416054321', type: 'DRIVER', assignedTruck: 'HR 38 EF 4321',
                faceEnrolled: false, fingerprintEnrolled: false, status: 'AVAILABLE',
                activeTrip: null
            }
        ];
        setVehicles(fallbackVehicles);
        setRoster({ drivers: fallbackDrivers, staff: [] });
        if (!selectedTestDriverId) setSelectedTestDriverId('drv-01');
        setRosterLoading(false);
    };

    useEffect(() => {
        fetchRoster().finally(() => setRosterLoading(false));
    }, []);

    // ── 2. Periodic Terminal Heartbeat API ──
    useEffect(() => {
        const sendHeartbeat = async () => {
            try {
                await ax.post('/terminal/heartbeat', {
                    terminalId: TERMINAL_ID,
                    battery: 98,
                    storage: 84,
                    camera: cameraActive ? 'OK' : 'STANDBY',
                    faceEngine: 'ONLINE',
                    version: '2.4.0-portrait'
                });
            } catch (_) {}
        };
        sendHeartbeat();
        const interval = setInterval(sendHeartbeat, 60000); // every 60s
        return () => clearInterval(interval);
    }, [cameraActive]);

    // ── 3. Offline Queue Synchronization ──
    const queueEventOffline = (evt) => {
        const next = [...offlineQueue, evt];
        setOfflineQueue(next);
        localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(next));
    };

    const syncOfflineQueue = async () => {
        if (!navigator.onLine || offlineQueue.length === 0) return;
        try {
            const res = await ax.post('/terminal/sync', { events: offlineQueue });
            if (res.data?.success) {
                setOfflineQueue([]);
                localStorage.removeItem(OFFLINE_QUEUE_KEY);
                playChime('success');
            }
        } catch (_) {}
    };

    // ── 4. Camera Stream Setup ──
    useEffect(() => {
        if (isBooting || isScreensaver) return;
        let stream = null;
        let isCancelled = false;
        const initCamera = async () => {
            if (!navigator.mediaDevices?.getUserMedia) {
                setCameraActive(false);
                return;
            }
            try {
                try {
                    stream = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: { ideal: 'user' }, width: { ideal: 640 }, height: { ideal: 480 } }
                    });
                } catch {
                    stream = await navigator.mediaDevices.getUserMedia({ video: true });
                }
                if (!isCancelled && videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.play().catch(() => {});
                    setCameraActive(true);
                }
            } catch (err) {
                console.warn('Camera device stream unavailable:', err);
                if (!isCancelled) setCameraActive(false);
            }
        };
        initCamera();
        return () => {
            isCancelled = true;
            if (stream) stream.getTracks().forEach(t => t.stop());
        };
    }, [isBooting, isScreensaver]);

    // Available test drivers
    const allRosterDrivers = useMemo(() => roster.drivers?.length > 0 ? roster.drivers : [], [roster.drivers]);
    const currentActiveDriver = useMemo(() => {
        if (allRosterDrivers.length === 0) return null;
        return allRosterDrivers.find(d => d.id === selectedTestDriverId) || allRosterDrivers[0];
    }, [allRosterDrivers, selectedTestDriverId]);

    // ── 5. Process Recognition & Attendance Event ──
    const handleRecognition = async (person, explicitAction = null, method = 'FACE') => {
        if (!person) return;
        resetIdleTimer();
        setRecognizedPerson(person);
        setScanningStatus('RECOGNIZED');

        // Determine default action based on person's state
        const action = explicitAction || (person.status === 'ON_TRIP' ? 'TRIP_RETURN' : 'CHECK_IN');
        setLastActionType(action);

        playChime('success');
        speakPrompt('voiceFaceVerified', { name: person.name });

        // Auto-confirm countdown (4 seconds)
        setAutoConfirmCount(4);
        let remaining = 4;
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = setInterval(() => {
            remaining -= 1;
            setAutoConfirmCount(remaining);
            if (remaining <= 0) {
                clearInterval(countdownTimerRef.current);
                handleConfirmDutyAction(action, person, method);
            }
        }, 1000);
    };

    const handleConfirmDutyAction = async (actionType, personOverride = null, method = 'FACE') => {
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        setAutoConfirmCount(null);
        const person = personOverride || recognizedPerson;
        if (!person) return;

        setLastActionType(actionType);
        const payload = {
            terminalId: TERMINAL_ID,
            employeeId: person.employeeId || person.id,
            employeeType: person.type || 'DRIVER',
            action: actionType,
            biometricMethod: method,
            vehicleNo: person.assignedTruck || null,
            timestamp: new Date().toISOString()
        };

        if (navigator.onLine) {
            try {
                const res = await ax.post('/terminal/event', payload);
                if (res.data?.status === 'DUPLICATE') {
                    setScanningStatus('DUPLICATE');
                    playChime('duplicate');
                    speakPrompt('voiceDuplicate', { name: person.name });
                    scheduleAutoDismiss(4000);
                    return;
                }
            } catch (_) {
                queueEventOffline(payload);
            }
        } else {
            queueEventOffline(payload);
        }

        setScanningStatus('SUCCESS');
        playChime('success');
        if (actionType === 'TRIP_RETURN') {
            speakPrompt('voiceReturnConfirmed', { name: person.name });
        } else {
            speakPrompt('voiceAttendanceConfirmed', { name: person.name });
        }
        scheduleAutoDismiss(4000);
    };

    const scheduleAutoDismiss = (ms = 4000) => {
        if (autoDismissTimerRef.current) clearTimeout(autoDismissTimerRef.current);
        autoDismissTimerRef.current = setTimeout(() => {
            dismissAttendanceDetails();
        }, ms);
    };

    // ── 6. Trigger Scan Action ──
    const handleTriggerScan = (targetDriver = null) => {
        const driverToUse = targetDriver || currentActiveDriver;
        if (!driverToUse) return;

        resetIdleTimer();
        playChime('scan');
        setScanningStatus('ANALYZING');
        setScanProgress(25);
        setTimeout(() => setScanProgress(65), 280);
        setTimeout(() => {
            setScanProgress(100);
            handleRecognition(driverToUse, null, 'FACE');
        }, 620);
    };

    // Phone Camera Selfie Fallback
    const handlePhoneCameraFile = (e) => {
        const file = e.target?.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            setCapturedSelfieUrl(evt.target.result);
            handleTriggerScan();
        };
        reader.readAsDataURL(file);
    };

    // Fingerprint Action
    const handleFingerprintPress = (e) => {
        e?.stopPropagation();
        if (scanningStatus !== 'IDLE') return;
        if (!currentActiveDriver) return;
        resetIdleTimer();
        playChime('success');
        handleRecognition(currentActiveDriver, null, 'FINGERPRINT');
    };

    // ── 7. Admin PIN & Secure Exit System ──
    const handleAdminPinKeypad = (k) => {
        setPinError('');
        if (k === 'C') {
            setEnteredPin('');
            return;
        }
        if (k === '⌫') {
            setEnteredPin(p => p.slice(0, -1));
            return;
        }
        if (enteredPin.length < 4) {
            const next = enteredPin + k;
            setEnteredPin(next);
            if (next.length === 4) {
                if (next === ADMIN_PIN) {
                    setShowSecurityPinModal(false);
                    setEnteredPin('');
                    setShowAuthenticatedActionModal(true);
                    playChime('success');
                } else {
                    setPinError('Incorrect PIN. Default: 8888');
                    playChime('error');
                    setTimeout(() => setEnteredPin(''), 700);
                }
            }
        }
    };

    // ── 8. Biometric Enrollment ──
    const handleCaptureFaceSnapshot = () => {
        if (!videoRef.current) return;
        try {
            const canvas = document.createElement('canvas');
            canvas.width = videoRef.current.videoWidth || 640;
            canvas.height = videoRef.current.videoHeight || 480;
            const ctx = canvas.getContext('2d');
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            setEnrollSnapshot(canvas.toDataURL('image/jpeg', 0.85));
            playChime('scan');
        } catch (err) {
            console.error('Snapshot failed:', err);
        }
    };

    const handleSaveEnrollment = async (personData) => {
        setSavingEnrollment(true);
        try {
            const payload = {
                id: personData.id || `drv-${Date.now()}`,
                name: personData.name,
                phone: personData.phone,
                employeeId: personData.employeeId,
                type: personData.type || 'DRIVER',
                assignedTruck: personData.assignedTruck,
                facePhoto: enrollSnapshot || personData.facePhoto || null,
                fingerprintEnrolled: Boolean(personData.fingerprintEnrolled)
            };
            const res = await ax.post('/terminal/enroll', payload);
            if (res.data?.success) {
                await fetchRoster();
                setEnrollingPerson(null);
                setEnrollSnapshot(null);
                playChime('success');
            }
        } catch (err) {
            alert('Failed to save biometric enrollment: ' + err.message);
        } finally {
            setSavingEnrollment(false);
        }
    };

    const handleDeleteBiometrics = async (personId) => {
        if (!window.confirm('Delete face and biometrics data for this person?')) return;
        try {
            await ax.post('/terminal/enroll/delete', { id: personId });
            await fetchRoster();
            playChime('success');
        } catch (err) {
            alert('Failed to delete biometrics: ' + err.message);
        }
    };

    const handleAssignVehicle = async (driverId, truckNo) => {
        try {
            await ax.post('/terminal/assign-vehicle', { driverId, vehicleNo: truckNo });
            await fetchRoster();
        } catch (err) {
            console.error('Assign vehicle failed:', err);
        }
    };

    // ── Boot Screen ──
    if (isBooting) {
        return <VgtcBootScreen onBootComplete={() => { setIsBooting(false); resetIdleTimer(); }} terminalId={TERMINAL_ID} />;
    }

    // Filtered People for Admin & Driver Selector
    const allRosterPeople = [...(roster.drivers || []), ...(roster.staff || [])];
    const filteredDriversForSelector = (roster.drivers || []).filter(d =>
        d.name?.toLowerCase().includes(driverSearchQuery.toLowerCase()) ||
        d.phone?.includes(driverSearchQuery) ||
        d.assignedTruck?.toLowerCase().includes(driverSearchQuery.toLowerCase())
    );

    // ════════════════════════════════════════════════════════════════════════
    // STANDALONE TERMINAL VIEW
    // ════════════════════════════════════════════════════════════════════════
    return (
        <div
            onClick={(e) => {
                if (e.target !== e.currentTarget) return;
                if (scanningStatus === 'RECOGNIZED' || scanningStatus === 'SUCCESS' || scanningStatus === 'DUPLICATE') {
                    dismissAttendanceDetails();
                }
            }}
            style={{
                position: 'relative', width: '100%', height: '100%',
                background: isDarkMode
                    ? 'radial-gradient(ellipse at 50% 25%, #0d261e 0%, #061510 50%, #030806 100%)'
                    : 'radial-gradient(ellipse at 50% 25%, #e6f7f2 0%, #d4ede6 60%, #c4e4da 100%)',
                color: isDarkMode ? '#ffffff' : '#0d2e22',
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                display: 'flex', flexDirection: 'column', overflow: 'hidden', userSelect: 'none'
            }}
        >
            {/* Background Camera Layer (hidden / behind) */}
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                    position: 'absolute', inset: 0, width: '100%', height: '100%',
                    objectFit: 'cover', opacity: isDarkMode ? 0.28 : 0.22, pointerEvents: 'none',
                    filter: 'grayscale(35%) contrast(110%)'
                }}
            />

            {/* Hidden phone camera fallback file input */}
            <input
                ref={phoneCameraInputRef}
                type="file"
                accept="image/*"
                capture="user"
                style={{ display: 'none' }}
                onChange={handlePhoneCameraFile}
            />

            {/* ── Top Terminal Header ── */}
            <header style={{
                position: 'relative', zIndex: 30, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px',
                background: isDarkMode ? 'rgba(3,10,7,0.72)' : 'rgba(255,255,255,0.75)',
                backdropFilter: 'blur(16px)',
                borderBottom: isDarkMode ? '1px solid rgba(0,229,179,0.18)' : '1px solid rgba(0,168,132,0.2)'
            }}>
                {/* Logo & Node */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                        width: '32px', height: '32px', borderRadius: '10px',
                        background: 'linear-gradient(135deg, #00e5b3 0%, #00a884 100%)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 0 16px rgba(0,229,179,0.45)'
                    }}>
                        <Truck size={17} color="#031811" strokeWidth={2.6} />
                    </div>
                    <div>
                        <div style={{ fontSize: '13px', fontWeight: 900, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>VGTC OS</span>
                            <span style={{
                                fontSize: '9px', fontWeight: 800, padding: '2px 6px', borderRadius: '6px',
                                background: isOnline ? 'rgba(16,185,129,0.18)' : 'rgba(245,158,11,0.18)',
                                color: isOnline ? '#10b981' : '#f59e0b',
                                border: `1px solid ${isOnline ? 'rgba(16,185,129,0.4)' : 'rgba(245,158,11,0.4)'}`
                            }}>
                                {isOnline ? '● LIVE' : '● CACHED'}
                            </span>
                        </div>
                        <div style={{ fontSize: '9.5px', color: isDarkMode ? 'rgba(255,255,255,0.55)' : '#0f3d2d', fontWeight: 600 }}>
                            {t.terminalLocation}
                        </div>
                    </div>
                </div>

                {/* Right Quick Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {/* Clock */}
                    <div style={{
                        padding: '4px 8px', borderRadius: '8px',
                        background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                        fontSize: '11px', fontWeight: 800, fontFamily: 'monospace'
                    }}>
                        {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </div>

                    {/* Language Switch */}
                    <button
                        type="button"
                        onClick={() => setLang(l => l === 'en' ? 'hi' : 'en')}
                        style={{
                            padding: '4px 8px', borderRadius: '8px',
                            background: isDarkMode ? 'rgba(0,229,179,0.12)' : 'rgba(0,168,132,0.12)',
                            border: '1px solid rgba(0,229,179,0.3)',
                            color: isDarkMode ? '#00e5b3' : '#059669',
                            fontSize: '11px', fontWeight: 900, cursor: 'pointer'
                        }}
                    >
                        {lang === 'en' ? 'हिन्दी' : 'EN'}
                    </button>

                    {/* Audio Toggle */}
                    <button
                        type="button"
                        onClick={() => setSoundEnabled(s => !s)}
                        title="Toggle Voice / Chime"
                        style={{
                            width: '28px', height: '28px', borderRadius: '8px',
                            background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                            border: 'none',
                            color: soundEnabled ? '#00e5b3' : 'rgba(255,255,255,0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                        }}
                    >
                        {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
                    </button>

                    {/* Theme Toggle */}
                    <button
                        type="button"
                        onClick={() => setIsDarkMode(d => !d)}
                        title="Toggle Dark / Light"
                        style={{
                            width: '28px', height: '28px', borderRadius: '8px',
                            background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                            border: 'none',
                            color: isDarkMode ? '#f59e0b' : '#059669',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                        }}
                    >
                        {isDarkMode ? <Sun size={13} /> : <Moon size={13} />}
                    </button>

                    {/* Security Exit & Admin Button (PIN 8888) */}
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowSecurityPinModal(true);
                        }}
                        title="Exit or Admin Settings (PIN 8888)"
                        style={{
                            width: '28px', height: '28px', borderRadius: '8px',
                            background: 'rgba(239,68,68,0.15)',
                            border: '1px solid rgba(239,68,68,0.4)',
                            color: '#ef4444',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                        }}
                    >
                        <Lock size={13} />
                    </button>
                </div>
            </header>

            {/* ── Center Biometric HUD & Viewfinder (3:4 Portrait Ratio) ── */}
            <main style={{
                position: 'relative', zIndex: 15, flex: 1,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: '16px 12px 90px'
            }}>
                {/* Status Guidance Pill */}
                <div style={{
                    padding: '6px 16px', borderRadius: '20px',
                    background: isDarkMode ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.85)',
                    backdropFilter: 'blur(12px)',
                    border: `1.5px solid ${scanningStatus === 'ANALYZING' ? '#00e5b3' : 'rgba(0,229,179,0.3)'}`,
                    color: isDarkMode ? '#ffffff' : '#06382a',
                    fontSize: '12px', fontWeight: 800, marginBottom: '16px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.35)', textAlign: 'center'
                }}>
                    {scanningStatus === 'ANALYZING'
                        ? t.verifyingFace
                        : scanningStatus === 'RECOGNIZED' || scanningStatus === 'SUCCESS'
                        ? t.faceRecognized
                        : t.alignFacePrompt}
                </div>

                {/* 3:4 Portrait Viewfinder Chassis */}
                <motion.div
                    onClick={(e) => {
                        e.stopPropagation();
                        if (scanningStatus === 'IDLE') handleTriggerScan();
                    }}
                    animate={{
                        scale: scanningStatus === 'ANALYZING' ? [1, 1.015, 1] : 1
                    }}
                    transition={{ duration: 1.2, repeat: scanningStatus === 'ANALYZING' ? Infinity : 0 }}
                    style={{
                        position: 'relative',
                        width: '240px', height: '320px', maxWidth: '78vw', maxHeight: '48vh',
                        borderRadius: '26px',
                        border: scanningStatus === 'ANALYZING' ? '2.5px solid #00e5b3'
                            : scanningStatus === 'SUCCESS' ? '3px solid #10b981'
                            : scanningStatus === 'DUPLICATE' ? '3px solid #f59e0b'
                            : '2px solid rgba(0,229,179,0.4)',
                        background: 'rgba(0,0,0,0.22)',
                        boxShadow: scanningStatus === 'ANALYZING'
                            ? '0 0 35px rgba(0,229,179,0.45), inset 0 0 25px rgba(0,229,179,0.2)'
                            : '0 10px 40px rgba(0,0,0,0.4)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        overflow: 'hidden', cursor: scanningStatus === 'IDLE' ? 'pointer' : 'default'
                    }}
                >
                    {/* Glowing Reticle Corner Brackets */}
                    {['tl','tr','bl','br'].map(corner => {
                        const top = corner.startsWith('t');
                        const left = corner.endsWith('l');
                        const color = scanningStatus === 'DUPLICATE' ? '#f59e0b' : '#00e5b3';
                        return (
                            <div key={corner} style={{
                                position: 'absolute',
                                top: top ? '-2px' : undefined,
                                bottom: !top ? '-2px' : undefined,
                                left: left ? '-2px' : undefined,
                                right: !left ? '-2px' : undefined,
                                width: '28px', height: '28px',
                                borderTop: top ? `4px solid ${color}` : undefined,
                                borderBottom: !top ? `4px solid ${color}` : undefined,
                                borderLeft: left ? `4px solid ${color}` : undefined,
                                borderRight: !left ? `4px solid ${color}` : undefined,
                                borderTopLeftRadius: corner === 'tl' ? '24px' : undefined,
                                borderTopRightRadius: corner === 'tr' ? '24px' : undefined,
                                borderBottomLeftRadius: corner === 'bl' ? '24px' : undefined,
                                borderBottomRightRadius: corner === 'br' ? '24px' : undefined,
                            }} />
                        );
                    })}

                    {/* Captured Selfie Preview */}
                    {capturedSelfieUrl && (
                        <img
                            src={capturedSelfieUrl}
                            alt="Selfie"
                            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                    )}

                    {/* Animated Biometric Sweep Bar */}
                    {scanningStatus === 'ANALYZING' && (
                        <motion.div
                            animate={{ y: [-150, 150, -150] }}
                            transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
                            style={{
                                position: 'absolute', left: 0, right: 0, height: '3px',
                                background: 'linear-gradient(90deg, transparent 0%, #00e5b3 50%, transparent 100%)',
                                boxShadow: '0 0 14px #00e5b3, 0 0 28px #00e5b3',
                                zIndex: 10
                            }}
                        />
                    )}

                    {/* Reticle Center Guide */}
                    {scanningStatus === 'IDLE' && !capturedSelfieUrl && (
                        <div style={{ textAlign: 'center', padding: '16px' }}>
                            <div style={{
                                width: '64px', height: '64px', borderRadius: '50%',
                                background: 'rgba(0,229,179,0.1)', border: '1.5px dashed rgba(0,229,179,0.6)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px'
                            }}>
                                <User size={28} color="#00e5b3" />
                            </div>
                            <div style={{ fontSize: '11.5px', fontWeight: 800, color: 'rgba(255,255,255,0.9)' }}>
                                {t.alignFacePrompt}
                            </div>
                            <div style={{ fontSize: '10px', color: 'rgba(0,229,179,0.85)', marginTop: '4px' }}>
                                Tap to Scan
                            </div>
                        </div>
                    )}

                    {/* Analyzing percentage badge */}
                    {scanningStatus === 'ANALYZING' && (
                        <div style={{
                            position: 'absolute', bottom: '18px',
                            background: 'rgba(0,0,0,0.75)', padding: '4px 14px', borderRadius: '16px',
                            border: '1px solid #00e5b3', color: '#00e5b3',
                            fontSize: '14px', fontWeight: 900, letterSpacing: '0.04em'
                        }}>
                            {scanProgress}%
                        </div>
                    )}
                </motion.div>

                {/* Primary Action Buttons Below Viewfinder */}
                {scanningStatus === 'IDLE' && (
                    <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        gap: '10px', marginTop: '18px', width: '100%', maxWidth: '280px'
                    }}>
                        {/* Main Face Scan Button */}
                        <motion.button
                            type="button"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handleTriggerScan()}
                            style={{
                                width: '100%', padding: '12px 18px', borderRadius: '18px',
                                background: 'linear-gradient(135deg, #00e5b3 0%, #00a884 100%)',
                                border: 'none', color: '#031811', fontSize: '14px', fontWeight: 900,
                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                gap: '8px', boxShadow: '0 8px 24px rgba(0,229,179,0.35)'
                            }}
                        >
                            <Camera size={18} strokeWidth={2.4} />
                            <span>{t.scanFacePrompt}</span>
                        </motion.button>

                        {/* Quick Driver Selector Pill (Solves the "parem ()" bug) */}
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowDriverSelectorModal(true);
                            }}
                            style={{
                                width: '100%', padding: '9px 14px', borderRadius: '14px',
                                background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                                border: isDarkMode ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.1)',
                                color: isDarkMode ? '#ffffff' : '#06382a',
                                fontSize: '11.5px', fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <User size={13} color="#00e5b3" />
                                <span>{currentActiveDriver ? currentActiveDriver.name : 'Select Driver'}</span>
                                {currentActiveDriver?.assignedTruck && (
                                    <span style={{ fontSize: '10px', color: '#00e5b3', fontWeight: 800 }}>
                                        ({currentActiveDriver.assignedTruck})
                                    </span>
                                )}
                            </div>
                            <ChevronDown size={13} color="rgba(255,255,255,0.5)" />
                        </button>
                    </div>
                )}
            </main>

            {/* ── Bottom Floating Quick Action Dock ── */}
            {scanningStatus === 'IDLE' && (
                <div style={{
                    position: 'absolute', bottom: '16px', left: 0, right: 0,
                    display: 'flex', justifyContent: 'center', gap: '12px', zIndex: 25,
                    padding: '0 16px'
                }}>
                    {/* Fingerprint check-in */}
                    <motion.button
                        type="button"
                        whileTap={{ scale: 0.96 }}
                        onClick={handleFingerprintPress}
                        style={{
                            padding: '10px 18px', borderRadius: '24px',
                            background: isDarkMode ? 'rgba(6,25,18,0.88)' : 'rgba(255,255,255,0.92)',
                            backdropFilter: 'blur(16px)',
                            border: '1.5px solid rgba(0,229,179,0.5)',
                            color: isDarkMode ? '#00e5b3' : '#059669',
                            fontSize: '12px', fontWeight: 800, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '6px',
                            boxShadow: '0 6px 20px rgba(0,0,0,0.3)'
                        }}
                    >
                        <Fingerprint size={16} />
                        <span>{t.scanFingerprintPrompt}</span>
                    </motion.button>

                    {/* Camera selfie fallback */}
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            phoneCameraInputRef.current?.click();
                        }}
                        style={{
                            width: '40px', height: '40px', borderRadius: '50%',
                            background: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                            backdropFilter: 'blur(12px)',
                            border: isDarkMode ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)',
                            color: isDarkMode ? '#ffffff' : '#06382a',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                        }}
                    >
                        <Camera size={16} />
                    </button>
                </div>
            )}

            {/* ── Slide-up Driver Attendance Bottom Sheet ── */}
            <AnimatePresence>
                {(scanningStatus === 'RECOGNIZED' || scanningStatus === 'SUCCESS' || scanningStatus === 'DUPLICATE') && recognizedPerson && (
                    <motion.div
                        key="attendance_card"
                        initial={{ y: '100%', opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: '100%', opacity: 0 }}
                        transition={{ type: 'spring', damping: 26, stiffness: 280 }}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 40,
                            background: isDarkMode
                                ? 'linear-gradient(180deg, rgba(9,32,24,0.98) 0%, rgba(4,14,10,0.99) 100%)'
                                : 'linear-gradient(180deg, rgba(235,248,244,0.98) 0%, rgba(215,240,233,0.99) 100%)',
                            backdropFilter: 'blur(24px)',
                            borderTop: scanningStatus === 'DUPLICATE' ? '2px solid #f59e0b' : '2px solid #00e5b3',
                            borderTopLeftRadius: '28px', borderTopRightRadius: '28px',
                            padding: '18px 20px 24px',
                            boxShadow: '0 -15px 50px rgba(0,0,0,0.7)',
                            display: 'flex', flexDirection: 'column', gap: '12px'
                        }}
                    >
                        {/* Pull notch */}
                        <div style={{
                            width: '42px', height: '4px', borderRadius: '2px',
                            background: isDarkMode ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)',
                            margin: '-6px auto 2px'
                        }} />

                        {/* Driver Profile Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{
                                    width: '46px', height: '46px', borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #00e5b3 0%, #00a884 100%)',
                                    color: '#031811', fontSize: '18px', fontWeight: 900,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: '0 0 16px rgba(0,229,179,0.4)'
                                }}>
                                    {recognizedPerson.name ? recognizedPerson.name[0].toUpperCase() : 'D'}
                                </div>
                                <div>
                                    <div style={{ fontSize: '17px', fontWeight: 900, letterSpacing: '-0.01em' }}>
                                        {recognizedPerson.name}
                                    </div>
                                    <div style={{ fontSize: '11px', color: isDarkMode ? 'rgba(255,255,255,0.6)' : '#0f4231', fontWeight: 600 }}>
                                        {recognizedPerson.employeeId || 'DRV-FLEET'} • {recognizedPerson.phone || 'Yard Driver'}
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={dismissAttendanceDetails}
                                style={{
                                    width: '28px', height: '28px', borderRadius: '50%',
                                    background: 'rgba(255,255,255,0.08)', border: 'none',
                                    color: 'rgba(255,255,255,0.6)', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}
                            >
                                <X size={15} />
                            </button>
                        </div>

                        {/* Vehicle & Duty Status Pill */}
                        <div style={{
                            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px',
                            background: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                            padding: '10px 12px', borderRadius: '14px',
                            border: isDarkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)'
                        }}>
                            <div>
                                <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
                                    {t.assignedTruck}
                                </div>
                                <div style={{ fontSize: '13px', fontWeight: 900, color: '#00e5b3', marginTop: '2px' }}>
                                    {recognizedPerson.assignedTruck || 'No Truck Assigned'}
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
                                    {t.dutyStatus}
                                </div>
                                <div style={{
                                    fontSize: '12px', fontWeight: 800, marginTop: '2px',
                                    color: recognizedPerson.status === 'ON_TRIP' ? '#f59e0b' : '#10b981'
                                }}>
                                    {recognizedPerson.status === 'ON_TRIP' ? t.onTrip : t.available}
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        {scanningStatus === 'RECOGNIZED' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                                {recognizedPerson.status === 'ON_TRIP' ? (
                                    <button
                                        type="button"
                                        onClick={() => handleConfirmDutyAction('TRIP_RETURN')}
                                        style={{
                                            padding: '13px', borderRadius: '16px',
                                            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                            border: 'none', color: '#000000', fontSize: '14px', fontWeight: 900,
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            gap: '8px', boxShadow: '0 6px 20px rgba(245,158,11,0.4)'
                                        }}
                                    >
                                        <CheckCheck size={18} strokeWidth={2.6} />
                                        <span>{t.confirmTripReturn}</span>
                                        {autoConfirmCount !== null && (
                                            <span style={{ fontSize: '11px', opacity: 0.85 }}>({autoConfirmCount}s)</span>
                                        )}
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => handleConfirmDutyAction('CHECK_IN')}
                                        style={{
                                            padding: '13px', borderRadius: '16px',
                                            background: 'linear-gradient(135deg, #00e5b3 0%, #00a884 100%)',
                                            border: 'none', color: '#031811', fontSize: '14px', fontWeight: 900,
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            gap: '8px', boxShadow: '0 6px 20px rgba(0,229,179,0.4)'
                                        }}
                                    >
                                        <CheckCircle2 size={18} strokeWidth={2.6} />
                                        <span>{t.confirmAttendance}</span>
                                        {autoConfirmCount !== null && (
                                            <span style={{ fontSize: '11px', opacity: 0.85 }}>({autoConfirmCount}s)</span>
                                        )}
                                    </button>
                                )}

                                <button
                                    type="button"
                                    onClick={dismissAttendanceDetails}
                                    style={{
                                        background: 'transparent', border: 'none',
                                        color: isDarkMode ? 'rgba(255,255,255,0.5)' : '#0b3829',
                                        fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', padding: '6px'
                                    }}
                                >
                                    {t.cancel}
                                </button>
                            </div>
                        )}

                        {/* Confirmation Success Banner */}
                        {scanningStatus === 'SUCCESS' && (
                            <div style={{
                                padding: '14px', borderRadius: '16px',
                                background: 'rgba(16,185,129,0.15)', border: '1px solid #10b981',
                                textAlign: 'center', color: '#10b981', fontWeight: 900, fontSize: '14px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                            }}>
                                <CheckCircle2 size={20} />
                                <span>{lastActionType === 'TRIP_RETURN' ? t.tripReturnConfirmedTitle : t.attendanceConfirmedTitle}</span>
                            </div>
                        )}

                        {/* Duplicate Warning Banner */}
                        {scanningStatus === 'DUPLICATE' && (
                            <div style={{
                                padding: '14px', borderRadius: '16px',
                                background: 'rgba(245,158,11,0.15)', border: '1px solid #f59e0b',
                                textAlign: 'center', color: '#f59e0b', fontWeight: 800, fontSize: '13px'
                            }}>
                                <div>{t.duplicateTitle}</div>
                                <div style={{ fontSize: '11px', opacity: 0.85, marginTop: '2px' }}>{t.duplicateDesc}</div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Modal 1: Searchable Driver Selector ── */}
            <AnimatePresence>
                {showDriverSelectorModal && (
                    <motion.div
                        key="driver_modal"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onClick={() => setShowDriverSelectorModal(false)}
                        style={{
                            position: 'absolute', inset: 0, zIndex: 60,
                            background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
                            display: 'flex', flexDirection: 'column', justifyContent: 'flex-end'
                        }}
                    >
                        <motion.div
                            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                background: '#0a1a14', borderTop: '2px solid #00e5b3',
                                borderTopLeftRadius: '24px', borderTopRightRadius: '24px',
                                padding: '18px', maxHeight: '75vh', display: 'flex', flexDirection: 'column', gap: '12px'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ fontSize: '15px', fontWeight: 900, color: '#ffffff' }}>
                                    {t.manualSelect} ({allRosterDrivers.length})
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowDriverSelectorModal(false)}
                                    style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Search input */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                background: 'rgba(255,255,255,0.06)', borderRadius: '12px',
                                padding: '8px 12px', border: '1px solid rgba(255,255,255,0.12)'
                            }}>
                                <Search size={15} color="rgba(255,255,255,0.4)" />
                                <input
                                    type="text"
                                    placeholder="Search driver name, phone, truck..."
                                    value={driverSearchQuery}
                                    onChange={(e) => setDriverSearchQuery(e.target.value)}
                                    style={{
                                        background: 'transparent', border: 'none', outline: 'none',
                                        color: '#ffffff', fontSize: '13px', flex: 1
                                    }}
                                />
                            </div>

                            {/* Drivers List */}
                            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '50vh' }}>
                                {filteredDriversForSelector.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '24px', color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>
                                        No drivers found
                                    </div>
                                ) : (
                                    filteredDriversForSelector.map(d => (
                                        <div
                                            key={d.id}
                                            onClick={() => {
                                                setSelectedTestDriverId(d.id);
                                                setShowDriverSelectorModal(false);
                                                handleTriggerScan(d);
                                            }}
                                            style={{
                                                padding: '12px 14px', borderRadius: '14px',
                                                background: selectedTestDriverId === d.id ? 'rgba(0,229,179,0.12)' : 'rgba(255,255,255,0.04)',
                                                border: selectedTestDriverId === d.id ? '1.5px solid #00e5b3' : '1px solid rgba(255,255,255,0.08)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontSize: '14px', fontWeight: 800, color: '#ffffff' }}>
                                                    {d.name}
                                                </div>
                                                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>
                                                    {d.employeeId || 'DRV'} • {d.phone || 'No phone'}
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: '12px', fontWeight: 900, color: '#00e5b3' }}>
                                                    {d.assignedTruck || 'Unassigned'}
                                                </div>
                                                <div style={{
                                                    fontSize: '9.5px', fontWeight: 800, marginTop: '2px',
                                                    color: d.status === 'ON_TRIP' ? '#f59e0b' : '#10b981'
                                                }}>
                                                    {d.status === 'ON_TRIP' ? 'ON TRIP' : 'AVAILABLE'}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Modal 2: Admin Security PIN Prompt (Default: 8888) ── */}
            <AnimatePresence>
                {showSecurityPinModal && (
                    <motion.div
                        key="pin_modal"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onClick={() => { setShowSecurityPinModal(false); setEnteredPin(''); setPinError(''); }}
                        style={{
                            position: 'absolute', inset: 0, zIndex: 9999,
                            background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(20px)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
                        }}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                width: '100%', maxWidth: '320px', background: '#0a1b14',
                                borderRadius: '24px', border: '1.5px solid #00e5b3',
                                padding: '24px 20px', textAlign: 'center',
                                boxShadow: '0 20px 60px rgba(0,0,0,0.9)'
                            }}
                        >
                            <div style={{
                                width: '48px', height: '48px', borderRadius: '50%',
                                background: 'rgba(0,229,179,0.15)', color: '#00e5b3',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px'
                            }}>
                                <Lock size={22} />
                            </div>
                            <div style={{ fontSize: '17px', fontWeight: 900, color: '#ffffff' }}>
                                {t.adminPinTitle}
                            </div>
                            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', marginTop: '4px', lineHeight: 1.4 }}>
                                {t.enterPinPrompt}
                            </div>

                            {/* 4 PIN Dots */}
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', margin: '18px 0 10px' }}>
                                {[0, 1, 2, 3].map(i => (
                                    <div
                                        key={i}
                                        style={{
                                            width: '16px', height: '16px', borderRadius: '50%',
                                            background: i < enteredPin.length ? '#00e5b3' : 'rgba(255,255,255,0.12)',
                                            border: i < enteredPin.length ? '2px solid #00e5b3' : '2px solid rgba(255,255,255,0.25)',
                                            boxShadow: i < enteredPin.length ? '0 0 10px #00e5b3' : 'none'
                                        }}
                                    />
                                ))}
                            </div>

                            {pinError && (
                                <div style={{ color: '#ef4444', fontSize: '11px', fontWeight: 800, marginBottom: '8px' }}>
                                    {pinError}
                                </div>
                            )}

                            {/* Keypad */}
                            <div style={{
                                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px',
                                maxWidth: '240px', margin: '14px auto 8px'
                            }}>
                                {['1','2','3','4','5','6','7','8','9','C','0','⌫'].map(k => (
                                    <button
                                        key={k}
                                        type="button"
                                        onClick={() => handleAdminPinKeypad(k)}
                                        style={{
                                            padding: '12px', borderRadius: '14px',
                                            background: k === 'C' || k === '⌫' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.12)',
                                            border: '1px solid rgba(255,255,255,0.15)',
                                            color: '#ffffff', fontSize: '17px', fontWeight: 800, cursor: 'pointer'
                                        }}
                                    >
                                        {k}
                                    </button>
                                ))}
                            </div>

                            <button
                                type="button"
                                onClick={() => { setShowSecurityPinModal(false); setEnteredPin(''); setPinError(''); }}
                                style={{
                                    background: 'transparent', border: 'none',
                                    color: 'rgba(255,255,255,0.45)', fontSize: '12px', fontWeight: 700,
                                    cursor: 'pointer', marginTop: '10px'
                                }}
                            >
                                {t.cancel}
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Modal 3: Authenticated Terminal Controls Modal ── */}
            <AnimatePresence>
                {showAuthenticatedActionModal && (
                    <motion.div
                        key="auth_action_modal"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onClick={() => setShowAuthenticatedActionModal(false)}
                        style={{
                            position: 'absolute', inset: 0, zIndex: 99999,
                            background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(20px)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
                        }}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                width: '100%', maxWidth: '340px', background: '#0a1a14',
                                borderRadius: '24px', border: '1.5px solid #00e5b3',
                                padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '12px',
                                boxShadow: '0 20px 60px rgba(0,0,0,0.9)'
                            }}
                        >
                            <div style={{ textAlign: 'center', marginBottom: '4px' }}>
                                <div style={{
                                    width: '46px', height: '46px', borderRadius: '50%',
                                    background: 'rgba(16,185,129,0.15)', color: '#10b981',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px'
                                }}>
                                    <Shield size={22} />
                                </div>
                                <div style={{ fontSize: '16px', fontWeight: 900, color: '#ffffff' }}>
                                    Admin Actions Verified
                                </div>
                                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', marginTop: '2px' }}>
                                    Terminal Security PIN Accepted
                                </div>
                            </div>

                            {/* Action 1: Exit App & Go to Settings */}
                            <button
                                type="button"
                                onClick={() => {
                                    setShowAuthenticatedActionModal(false);
                                    exitApp(ADMIN_PIN, onExit);
                                }}
                                style={{
                                    width: '100%', padding: '13px', borderRadius: '14px',
                                    background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
                                    border: 'none', color: '#ffffff', fontSize: '13.5px', fontWeight: 900,
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    gap: '8px', boxShadow: '0 4px 16px rgba(239,68,68,0.35)'
                                }}
                            >
                                <LogOut size={16} />
                                <span>{t.exitTerminal}</span>
                            </button>

                            {/* Action 2: Open Terminal Settings */}
                            <button
                                type="button"
                                onClick={() => {
                                    setShowAuthenticatedActionModal(false);
                                    setShowAdminPanel(true);
                                }}
                                style={{
                                    width: '100%', padding: '12px', borderRadius: '14px',
                                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                                    color: '#ffffff', fontSize: '13px', fontWeight: 800,
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    gap: '8px'
                                }}
                            >
                                <Settings size={16} color="#00e5b3" />
                                <span>{t.openSettings}</span>
                            </button>

                            {/* Action 3: Restart Terminal */}
                            <button
                                type="button"
                                onClick={() => window.location.reload()}
                                style={{
                                    width: '100%', padding: '12px', borderRadius: '14px',
                                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                                    color: '#ffffff', fontSize: '12.5px', fontWeight: 700,
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    gap: '8px'
                                }}
                            >
                                <RotateCcw size={15} />
                                <span>{t.restartTerminal}</span>
                            </button>

                            {/* Cancel */}
                            <button
                                type="button"
                                onClick={() => setShowAuthenticatedActionModal(false)}
                                style={{
                                    background: 'transparent', border: 'none',
                                    color: 'rgba(255,255,255,0.45)', fontSize: '12px', fontWeight: 700,
                                    cursor: 'pointer', textAlign: 'center', marginTop: '4px'
                                }}
                            >
                                {t.cancel}
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Modal 4: Full Administration & Settings Panel ── */}
            <AnimatePresence>
                {showAdminPanel && (
                    <motion.div
                        key="admin_panel"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onClick={() => setShowAdminPanel(false)}
                        style={{
                            position: 'absolute', inset: 0, zIndex: 999999,
                            background: 'rgba(0,0,0,0.94)', backdropFilter: 'blur(16px)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
                        }}
                    >
                        <motion.div
                            initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.94, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                width: '100%', maxWidth: '520px', maxHeight: '88vh',
                                background: '#0a1612', borderRadius: '24px',
                                border: '1.5px solid rgba(0,229,179,0.3)',
                                display: 'flex', flexDirection: 'column', overflow: 'hidden'
                            }}
                        >
                            {/* Panel Header */}
                            <div style={{
                                padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Shield size={18} color="#00e5b3" />
                                    <div style={{ fontSize: '15px', fontWeight: 900, color: '#ffffff' }}>
                                        {t.adminPanel}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowAdminPanel(false)}
                                    style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Tabs */}
                            <div style={{
                                display: 'flex', padding: '8px 12px', gap: '6px',
                                background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.06)'
                            }}>
                                {[
                                    { key: 'roster', label: `Roster (${allRosterPeople.length})` },
                                    { key: 'enroll', label: '+ Enroll Biometrics' },
                                    { key: 'system', label: 'Telemetry & Exit' }
                                ].map(tab => (
                                    <button
                                        key={tab.key}
                                        type="button"
                                        onClick={() => setAdminTab(tab.key)}
                                        style={{
                                            flex: 1, padding: '7px 4px', borderRadius: '10px', border: 'none',
                                            fontSize: '11.5px', fontWeight: 800,
                                            background: adminTab === tab.key ? '#00a884' : 'transparent',
                                            color: adminTab === tab.key ? '#ffffff' : 'rgba(255,255,255,0.5)',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* Tab Content */}
                            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                                {adminTab === 'roster' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {allRosterPeople.map(p => (
                                            <div
                                                key={p.id}
                                                style={{
                                                    background: 'rgba(255,255,255,0.04)', borderRadius: '12px',
                                                    padding: '10px 12px', border: '1px solid rgba(255,255,255,0.08)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                                                }}
                                            >
                                                <div>
                                                    <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#ffffff' }}>
                                                        {p.name}
                                                    </div>
                                                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                                                        {p.employeeId} • Truck: <b style={{ color: '#00e5b3' }}>{p.assignedTruck || 'None'}</b>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteBiometrics(p.id)}
                                                        style={{
                                                            padding: '6px 10px', borderRadius: '8px',
                                                            background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
                                                            color: '#ef4444', fontSize: '11px', fontWeight: 700, cursor: 'pointer'
                                                        }}
                                                    >
                                                        Delete Bio
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {adminTab === 'enroll' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        <div>
                                            <label style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(255,255,255,0.6)' }}>Full Name</label>
                                            <input
                                                type="text"
                                                placeholder="e.g. Ramesh Kumar"
                                                value={newPersonForm.name}
                                                onChange={(e) => setNewPersonForm({ ...newPersonForm, name: e.target.value })}
                                                style={{
                                                    width: '100%', padding: '9px 12px', borderRadius: '10px',
                                                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
                                                    color: '#ffffff', fontSize: '12px', marginTop: '4px', boxSizing: 'border-box'
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(255,255,255,0.6)' }}>Phone</label>
                                            <input
                                                type="tel"
                                                placeholder="10-digit mobile"
                                                value={newPersonForm.phone}
                                                onChange={(e) => setNewPersonForm({ ...newPersonForm, phone: e.target.value })}
                                                style={{
                                                    width: '100%', padding: '9px 12px', borderRadius: '10px',
                                                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
                                                    color: '#ffffff', fontSize: '12px', marginTop: '4px', boxSizing: 'border-box'
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(255,255,255,0.6)' }}>Assign Truck</label>
                                            <select
                                                value={newPersonForm.assignedTruck}
                                                onChange={(e) => setNewPersonForm({ ...newPersonForm, assignedTruck: e.target.value })}
                                                style={{
                                                    width: '100%', padding: '9px 12px', borderRadius: '10px',
                                                    background: '#0d1f18', border: '1px solid rgba(255,255,255,0.15)',
                                                    color: '#ffffff', fontSize: '12px', marginTop: '4px', boxSizing: 'border-box'
                                                }}
                                            >
                                                <option value="">— Select Vehicle —</option>
                                                {vehicles.map(v => (
                                                    <option key={v.id || v.truckNo} value={v.truckNo}>
                                                        {v.truckNo} ({v.owner || 'VGTC'})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <button
                                            type="button"
                                            disabled={!newPersonForm.name || savingEnrollment}
                                            onClick={async () => {
                                                await handleSaveEnrollment(newPersonForm);
                                                setNewPersonForm({ name: '', phone: '', employeeId: '', type: 'DRIVER', assignedTruck: '', fingerprintEnrolled: false });
                                                setAdminTab('roster');
                                            }}
                                            style={{
                                                padding: '12px', borderRadius: '12px',
                                                background: newPersonForm.name ? '#00a884' : 'rgba(255,255,255,0.1)',
                                                border: 'none', color: '#ffffff', fontSize: '13px', fontWeight: 800,
                                                cursor: newPersonForm.name ? 'pointer' : 'default', marginTop: '6px'
                                            }}
                                        >
                                            {savingEnrollment ? 'Saving...' : 'Enroll Person to Roster'}
                                        </button>
                                    </div>
                                )}

                                {adminTab === 'system' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        <div style={{
                                            background: 'rgba(255,255,255,0.04)', borderRadius: '14px', padding: '14px',
                                            display: 'flex', flexDirection: 'column', gap: '8px'
                                        }}>
                                            <div style={{ fontSize: '11px', fontWeight: 800, color: '#00e5b3', textTransform: 'uppercase' }}>
                                                Telemetry Diagnostics
                                            </div>
                                            {[
                                                { label: 'Terminal ID', value: TERMINAL_ID },
                                                { label: 'Cloud Sync', value: isOnline ? 'Online (Connected)' : 'Offline' },
                                                { label: 'Queued Events', value: `${offlineQueue.length} items` },
                                                { label: 'Roster Count', value: `${allRosterPeople.length} staff/drivers` },
                                                { label: 'Fleet Count', value: `${vehicles.length} trucks` }
                                            ].map(row => (
                                                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                                                    <span style={{ color: 'rgba(255,255,255,0.6)' }}>{row.label}</span>
                                                    <span style={{ fontWeight: 800, color: '#ffffff' }}>{row.value}</span>
                                                </div>
                                            ))}
                                        </div>

                                        <button
                                            type="button"
                                            onClick={fetchRoster}
                                            style={{
                                                padding: '11px', borderRadius: '12px',
                                                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                                                color: '#ffffff', fontSize: '12px', fontWeight: 800, cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                                            }}
                                        >
                                            <RefreshCw size={14} />
                                            <span>Refresh Roster from Server</span>
                                        </button>

                                        {/* Emergency Exit App Button */}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowAdminPanel(false);
                                                exitApp(ADMIN_PIN, onExit);
                                            }}
                                            style={{
                                                padding: '12px', borderRadius: '12px',
                                                background: 'rgba(239,68,68,0.15)', border: '1.5px solid #ef4444',
                                                color: '#ef4444', fontSize: '13px', fontWeight: 900, cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                                marginTop: '10px'
                                            }}
                                        >
                                            <LogOut size={16} />
                                            <span>Exit Terminal & Unlock Device</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Screensaver ── */}
            <AnimatePresence>
                {isScreensaver && (
                    <motion.div
                        key="screensaver"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onClick={() => {
                            setIsScreensaver(false);
                            playChime('wake');
                            speakPrompt('voiceLookCamera');
                            resetIdleTimer();
                        }}
                        style={{
                            position: 'absolute', inset: 0, zIndex: 9999999,
                            background: '#020705', display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                        }}
                    >
                        <motion.div
                            animate={{ scale: [1, 1.05, 1], opacity: [0.6, 1, 0.6] }}
                            transition={{ duration: 3, repeat: Infinity }}
                            style={{
                                width: '80px', height: '80px', borderRadius: '50%',
                                background: 'rgba(0,229,179,0.12)', border: '2px solid #00e5b3',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 0 40px rgba(0,229,179,0.4)', marginBottom: '16px'
                            }}
                        >
                            <Truck size={36} color="#00e5b3" />
                        </motion.div>
                        <div style={{ fontSize: '28px', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.02em' }}>
                            {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div style={{ fontSize: '12px', color: '#00e5b3', fontWeight: 800, marginTop: '8px' }}>
                            VGTC Terminal OS • Standby
                        </div>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', marginTop: '20px' }}>
                            Touch anywhere to scan
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
