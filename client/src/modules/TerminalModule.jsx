import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Truck, Camera, User, CheckCircle2, AlertCircle, RefreshCw,
    Wifi, WifiOff, Battery, Shield, Settings, X, ArrowLeft,
    Volume2, VolumeX, Lock, Clock, Calendar, Check, Fingerprint, MapPin,
    Plus, Trash2, Search, ChevronDown, Sparkles, Sun, Moon, AlertTriangle,
    CloudOff, CloudLightning
} from 'lucide-react';
import ax from '../api';
import VgtcBootScreen from '../components/VgtcBootScreen';

// ─── Capacitor Native Exit ─────────────────────────────────────────────────
// Gracefully exits the app on Android using the Capacitor global bridge.
// Capacitor injects all plugins on window.Capacitor.Plugins — no npm import needed.
// Falls back to onExit() prop when running in a normal browser.
const exitApp = async (onExitProp) => {
    try {
        // Check for native Capacitor bridge first (works without npm package import)
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
            await window.Capacitor.Plugins.App.exitApp();
            return;
        }
        // Try dynamic import as a second attempt (works when @capacitor/app is installed)
        // eslint-disable-next-line no-new-func
        const mod = await new Function('return import("@capacitor/app")')().catch(() => null);
        if (mod && mod.App) { await mod.App.exitApp(); return; }
    } catch (_) {}
    // Fallback: use the onExit prop (browser / dev mode)
    if (typeof onExitProp === 'function') onExitProp();
    else window.history.back();
};

const TERMINAL_ID = 'OFFICE-REWARI-01';
const ADMIN_PIN = '8888';
const OFFLINE_QUEUE_KEY = 'vgtc_terminal_offline_queue';
const IDLE_TIMEOUT_MS = 25000; // 25s inactivity → screensaver

// ─── Audio Synthesizer ─────────────────────────────────────────────────────
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
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
            osc.start(now); osc.stop(now + 0.5);
        } else if (type === 'scan') {
            osc.frequency.setValueAtTime(587.33, now);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.start(now); osc.stop(now + 0.15);
        } else if (type === 'error') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(220, now);
            osc.frequency.setValueAtTime(180, now + 0.1);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc.start(now); osc.stop(now + 0.35);
        }
    } catch (_) {}
};

// ─── Bilingual Dictionary ───────────────────────────────────────────────────
const TRANSLATIONS = {
    en: {
        lookIntoCamera: 'Please look into the camera and hold still',
        verifyingFace: 'Biometric scanning in progress...',
        verifyingFingerprint: 'Verifying fingerprint...',
        identityVerified: 'Attendance Verified',
        attendanceConfirmedTitle: 'Attendance Recorded',
        attendanceDuplicateTitle: 'Already Marked',
        scanFingerprintPrompt: 'Touch to Scan Fingerprint',
        scanFacePrompt: 'Scan Face',
        alignFacePrompt: 'Align face in frame',
        switchDriver: 'Switch Driver',
        touchToContinue: 'Touch screen to continue',
        assignedTruck: 'Assigned Truck',
        dutyStatus: 'Duty Status',
        activeTrip: 'ON TRIP (LOADED)',
        availableDuty: 'AVAILABLE (READY)',
        destination: 'Destination',
        consignee: 'Party / Consignee',
        returnFromTrip: 'Return from Trip (Mark Free)',
        officeVisit: 'Yard / Office Visit (Gate Pass)',
        confirmAttendance: 'Confirm Attendance',
        adminPanel: 'Biometric Enrollment & Admin',
        enrollFace: 'Capture / Enroll Face',
        enrollFingerprint: 'Enroll Fingerprint',
        assignVehicle: 'Assign Vehicle',
        deleteBiometrics: 'Delete Biometrics',
        addNewPerson: 'Enroll New Driver / Staff',
        enterPinPrompt: 'Enter 4-Digit Admin PIN to access settings or exit',
        exitTerminal: 'Exit Kiosk Terminal',
        voiceLookCamera: 'Please look into the camera.',
        voiceFaceVerified: (name) => `Face verified for ${name}.`,
        voiceFingerprintVerified: (name) => `Fingerprint verified for ${name}.`,
        voiceReturnConfirmed: (name) => `Trip return recorded for ${name}.`,
        voiceAttendanceConfirmed: (name) => `Attendance recorded for ${name}.`,
        voiceDuplicate: (name) => `Attendance already recorded for ${name}.`
    },
    hi: {
        lookIntoCamera: 'कृपया कैमरे की तरफ देखें और सीधे रहें',
        verifyingFace: 'बायोमेट्रिक स्कैन हो रहा है...',
        verifyingFingerprint: 'फिंगरप्रिंट सत्यापित हो रहा है...',
        identityVerified: 'उपस्थिति सत्यापित',
        attendanceConfirmedTitle: 'हाजिरी दर्ज हो गई',
        attendanceDuplicateTitle: 'पहले से दर्ज है',
        scanFingerprintPrompt: 'फिंगरप्रिंट से हाजिरी लगाएं',
        scanFacePrompt: 'चेहरा स्कैन करें',
        alignFacePrompt: 'चेहरा फ्रेम में रखें',
        switchDriver: 'चालक बदलें',
        touchToContinue: 'आगे बढ़ने के लिए स्क्रीन को छुएं',
        assignedTruck: 'आवंटित गाड़ी',
        dutyStatus: 'ड्यूटी स्थिति',
        activeTrip: 'ट्रिप पर (गाड़ी लोड)',
        availableDuty: 'उपलब्ध (ड्यूटी फ्री)',
        destination: 'गंतव्य',
        consignee: 'पार्टी नाम',
        returnFromTrip: 'ट्रिप से वापसी (गाड़ी खाली दर्ज करें)',
        officeVisit: 'ऑफिस / यार्ड विजिट (गेट पास)',
        confirmAttendance: 'उपस्थिति पुष्टि करें',
        adminPanel: 'बायोमेट्रिक नामांकन व वाहन आवंटन',
        enrollFace: 'चेहरा फोटो कैप्चर / बदलें',
        enrollFingerprint: 'फिंगरप्रिंट जोड़ें',
        assignVehicle: 'गाड़ी आवंटित करें',
        deleteBiometrics: 'बायोमेट्रिक हटाएं',
        addNewPerson: 'नया चालक / स्टाफ जोड़ें',
        enterPinPrompt: 'सेटिंग्स या बाहर निकलने के लिए 4 अंकों का पिन दर्ज करें',
        exitTerminal: 'टर्मिनल से बाहर निकलें (Exit)',
        voiceLookCamera: 'कृपया कैमरे की तरफ देखें।',
        voiceFaceVerified: (name) => `चेहरा सत्यापित हुआ, ${name}.`,
        voiceFingerprintVerified: (name) => `फिंगरप्रिंट सत्यापित हुआ, ${name}.`,
        voiceReturnConfirmed: (name) => `ट्रिप वापसी दर्ज हुई, ${name}.`,
        voiceAttendanceConfirmed: (name) => `उपस्थिति दर्ज हो गई है, ${name}.`,
        voiceDuplicate: (name) => `${name} की उपस्थिति पहले ही दर्ज की जा चुकी है.`
    }
};

export default function TerminalModule({ onExit }) {
    // Whether to show a confirmation before exiting (prevents accidental exit)
    const [showExitConfirm, setShowExitConfirm] = useState(false);
    // Language & Theme
    const [lang, setLang] = useState('hi');
    const [isDarkMode, setIsDarkMode] = useState(true);
    const t = TRANSLATIONS[lang];

    // Core states
    const [isBooting, setIsBooting] = useState(true);
    const [isScreensaver, setIsScreensaver] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [rosterLoading, setRosterLoading] = useState(true);

    // Terminal data
    const [roster, setRoster] = useState({ drivers: [], staff: [] });
    const [vehicles, setVehicles] = useState([]);
    const [offlineQueue, setOfflineQueue] = useState(() => {
        try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]'); }
        catch { return []; }
    });

    // Camera
    const videoRef = useRef(null);
    const [cameraActive, setCameraActive] = useState(false);

    // Recognition & scanning
    // IDLE | ANALYZING | RECOGNIZED | SUCCESS | DUPLICATE
    const [scanningStatus, setScanningStatus] = useState('IDLE');
    const [scanProgress, setScanProgress] = useState(0);
    const [recognizedPerson, setRecognizedPerson] = useState(null);
    const [activeDecision, setActiveDecision] = useState(null);
    const [lastActionType, setLastActionType] = useState(null);

    // Admin & Biometric Enrollment modal
    const [showAdminPinModal, setShowAdminPinModal] = useState(false);
    const [enteredPin, setEnteredPin] = useState('');
    const [pinError, setPinError] = useState('');
    const [showAdminPanel, setShowAdminPanel] = useState(false);
    const [adminTab, setAdminTab] = useState('roster');
    const [searchQuery, setSearchQuery] = useState('');

    // Capture Face Modal state inside Admin
    const [enrollingPerson, setEnrollingPerson] = useState(null);
    const [enrollSnapshot, setEnrollSnapshot] = useState(null);
    const [savingEnrollment, setSavingEnrollment] = useState(false);

    // Form state for adding new person
    const [newPersonForm, setNewPersonForm] = useState({
        name: '',
        phone: '',
        employeeId: '',
        type: 'DRIVER',
        assignedTruck: '',
        fingerprintEnrolled: false
    });

    // Local Test Driver switcher & Phone Camera Input ref
    const [testDriverIndex, setTestDriverIndex] = useState(0);
    const [capturedSelfieUrl, setCapturedSelfieUrl] = useState(null);
    const phoneCameraInputRef = useRef(null);

    // Timers — use refs to avoid stale-closure issues
    const idleTimerRef = useRef(null);
    const autoDismissTimerRef = useRef(null);
    const dismissFnRef = useRef(null);

    // ─── Dismiss attendance details ────────────────────────────────────────
    const dismissAttendanceDetails = useCallback(() => {
        if (autoDismissTimerRef.current) clearTimeout(autoDismissTimerRef.current);
        setScanningStatus('IDLE');
        setScanProgress(0);
        setRecognizedPerson(null);
        setActiveDecision(null);
        setLastActionType(null);
        setCapturedSelfieUrl(null);
    }, []);

    // Keep ref in sync so the idle timer can call it without stale closure
    useEffect(() => { dismissFnRef.current = dismissAttendanceDetails; }, [dismissAttendanceDetails]);

    // ─── Speech helper ─────────────────────────────────────────────────────
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
                } else {
                    const enVoice = voices.find(v => v.lang.includes('en-IN') || v.lang.includes('en-US'));
                    if (enVoice) utterance.voice = enVoice;
                }
                window.speechSynthesis.speak(utterance);
            }
        } catch (_) {}
    }, [lang, soundEnabled]);

    // ─── Idle timer — uses ref to avoid stale closure ──────────────────────
    const resetIdleTimer = useCallback(() => {
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(() => {
            setIsScreensaver(true);
            dismissFnRef.current?.();
        }, IDLE_TIMEOUT_MS);
    }, []);

    // Global activity listener
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

    // ─── Fetch roster and vehicles from backend ─────────────────────────────
    const fetchRoster = async () => {
        setRosterLoading(true);
        try {
            const res = await ax.get('/terminal/roster');
            if (res.data?.success) {
                setRoster({ drivers: res.data.drivers || [], staff: res.data.staff || [] });
                if (res.data.vehicles?.length > 0) setVehicles(res.data.vehicles);
                return;
            }
        } catch (_) {}
        // Fallback demo data
        setVehicles([
            { id: 'v1', truckNo: 'HR 55 CD 5678', owner: 'Self Owned' },
            { id: 'v2', truckNo: 'RJ 14 GH 9921', owner: 'Vikas Transport' },
            { id: 'v3', truckNo: 'DL 1M AA 1024', owner: 'Market Fleet' },
            { id: 'v4', truckNo: 'HR 38 EF 4321', owner: 'Amba Fleet' }
        ]);
        setRoster({
            drivers: [
                {
                    id: 'drv-01', employeeId: 'DRV-102', name: 'Raj Kumar',
                    phone: '9876543210', type: 'DRIVER', assignedTruck: 'HR 55 CD 5678',
                    faceEnrolled: true, fingerprintEnrolled: true, status: 'ON_TRIP',
                    activeTrip: { destination: 'Kotputli Plant', partyName: 'Amba Traders', lrNo: 'LR-10492', material: 'JK Super PPC', bags: '400 Bags' }
                },
                {
                    id: 'drv-02', employeeId: 'DRV-108', name: 'Suresh Sharma',
                    phone: '8708032492', type: 'DRIVER', assignedTruck: 'RJ 14 GH 9921',
                    faceEnrolled: false, fingerprintEnrolled: false, status: 'AVAILABLE',
                    activeTrip: null
                }
            ],
            staff: []
        });
        setRosterLoading(false);
    };

    useEffect(() => { fetchRoster().finally(() => setRosterLoading(false)); }, []);

    // ─── Camera setup ──────────────────────────────────────────────────────
    useEffect(() => {
        if (isBooting || isScreensaver) return;
        let stream = null;
        let isCancelled = false;
        const initCamera = async () => {
            if (!navigator.mediaDevices?.getUserMedia) { setCameraActive(false); return; }
            try {
                try {
                    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'user' } } });
                } catch {
                    stream = await navigator.mediaDevices.getUserMedia({ video: true });
                }
                if (!isCancelled && videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.play().catch(() => {});
                    setCameraActive(true);
                }
            } catch (err) {
                console.warn('Camera unavailable:', err);
                if (!isCancelled) setCameraActive(false);
            }
        };
        initCamera();
        return () => {
            isCancelled = true;
            if (stream) stream.getTracks().forEach(t => t.stop());
        };
    }, [isBooting, isScreensaver]);

    // ─── Offline queue ─────────────────────────────────────────────────────
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
            }
        } catch (_) {}
    };

    // ─── Screensaver wake ──────────────────────────────────────────────────
    const handleScreensaverWake = () => {
        setIsScreensaver(false);
        playChime('wake');
        speakPrompt('voiceLookCamera');
        resetIdleTimer();
    };

    // ─── Available drivers for kiosk testing ───────────────────────────────
    const availableDrivers = roster.drivers?.length > 0 ? roster.drivers : [
        {
            id: 'drv-01', employeeId: 'DRV-102', name: 'Raj Kumar',
            phone: '9876543210', type: 'DRIVER', assignedTruck: 'HR 55 CD 5678',
            status: 'ON_TRIP',
            activeTrip: { destination: 'Kotputli Plant', partyName: 'Amba Traders', lrNo: 'LR-10492' }
        },
        {
            id: 'drv-02', employeeId: 'DRV-108', name: 'Suresh Sharma',
            phone: '8708032492', type: 'DRIVER', assignedTruck: 'RJ 14 GH 9921',
            status: 'AVAILABLE', activeTrip: null
        }
    ];
    const currentTestDriver = availableDrivers[testDriverIndex % availableDrivers.length] || availableDrivers[0];

    const handleCycleTestDriver = (e) => {
        if (e) e.stopPropagation();
        setTestDriverIndex(i => (i + 1) % availableDrivers.length);
        playChime('scan');
    };

    // ─── Face scan ─────────────────────────────────────────────────────────
    const handleTriggerFaceScan = (e) => {
        if (e?.stopPropagation) e.stopPropagation();
        if (scanningStatus !== 'IDLE') return;
        resetIdleTimer();
        playChime('scan');
        setScanningStatus('ANALYZING');
        setScanProgress(30);
        setTimeout(() => setScanProgress(70), 320);
        setTimeout(() => {
            setScanProgress(100);
            handleRecognition(currentTestDriver, 'CHECK_IN', 'FACE');
        }, 680);
    };

    const handlePhoneCameraFile = (e) => {
        const file = e.target?.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            setCapturedSelfieUrl(evt.target.result);
            handleTriggerFaceScan();
        };
        reader.readAsDataURL(file);
    };

    // ─── Fingerprint ───────────────────────────────────────────────────────
    const handleFingerprintDirectPress = (e) => {
        e.stopPropagation();
        if (scanningStatus !== 'IDLE') return;
        resetIdleTimer();
        playChime('success');
        handleRecognition(currentTestDriver, 'CHECK_IN', 'FINGERPRINT');
    };

    // ─── Process recognition event ─────────────────────────────────────────
    const handleRecognition = async (person, explicitAction = 'CHECK_IN', method = 'FACE') => {
        resetIdleTimer();
        setRecognizedPerson(person);
        const payload = {
            eventId: crypto.randomUUID(),
            employeeId: person.id,
            employeeType: person.type,
            terminalId: TERMINAL_ID,
            biometricMethod: method,
            action: explicitAction,
            isTest: true,
            timestamp: new Date().toISOString()
        };
        try {
            const res = await ax.post('/terminal/event', payload);
            const data = res.data;
            if (data.status === 'DUPLICATE') {
                setScanningStatus('DUPLICATE');
                setActiveDecision(data);
                playChime('error');
                speakPrompt('voiceDuplicate', { name: person.name });
                scheduleAutoDismiss(5000);
                return;
            }
            setScanningStatus('RECOGNIZED');
            setActiveDecision(data);
            playChime('success');
            if (method === 'FINGERPRINT') {
                speakPrompt('voiceFingerprintVerified', { name: person.name });
            } else {
                speakPrompt('voiceFaceVerified', { name: person.name });
            }
            scheduleAutoDismiss(6000);
        } catch (_) {
            // Offline fallback
            queueEventOffline(payload);
            setScanningStatus('RECOGNIZED');
            setActiveDecision({ status: 'SUCCESS', message: `${person.name} verified offline.`, person, time: currentTime.toLocaleTimeString() });
            playChime('success');
            speakPrompt('voiceFaceVerified', { name: person.name });
            scheduleAutoDismiss(6000);
        }
    };

    const scheduleAutoDismiss = (ms = 5000) => {
        if (autoDismissTimerRef.current) clearTimeout(autoDismissTimerRef.current);
        autoDismissTimerRef.current = setTimeout(() => {
            dismissFnRef.current?.();
        }, ms);
    };

    // ─── Confirm duty action ───────────────────────────────────────────────
    const handleConfirmDutyAction = async (actionType) => {
        if (!recognizedPerson) return;
        playChime('success');
        setLastActionType(actionType);
        const payload = {
            eventId: crypto.randomUUID(),
            employeeId: recognizedPerson.id,
            employeeType: recognizedPerson.type,
            terminalId: TERMINAL_ID,
            biometricMethod: 'CONFIRMED',
            action: actionType,
            timestamp: new Date().toISOString()
        };
        try { await ax.post('/terminal/event', payload); }
        catch (_) { queueEventOffline(payload); }
        if (actionType === 'TRIP_RETURN') {
            speakPrompt('voiceReturnConfirmed', { name: recognizedPerson.name });
        } else {
            speakPrompt('voiceAttendanceConfirmed', { name: recognizedPerson.name });
        }
        setScanningStatus('SUCCESS');
        scheduleAutoDismiss(4000);
    };

    // ─── Root click handler — only dismiss on direct root tap ─────────────
    const handleScreenClick = (e) => {
        if (e.target !== e.currentTarget) return; // Only direct taps on root
        if (scanningStatus === 'RECOGNIZED' || scanningStatus === 'SUCCESS' || scanningStatus === 'DUPLICATE') {
            dismissAttendanceDetails();
        }
    };

    // ─── Admin PIN ─────────────────────────────────────────────────────────
    const handleAdminPinSubmit = (val) => {
        setEnteredPin(val);
        setPinError('');
        if (val === ADMIN_PIN) {
            setShowAdminPinModal(false);
            setShowAdminPanel(true);
            setEnteredPin('');
        } else if (val.length >= 4) {
            setPinError('Invalid PIN. Please try again.');
            setTimeout(() => setEnteredPin(''), 600);
        }
    };

    // ─── Face snapshot ─────────────────────────────────────────────────────
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
        } catch (err) { console.error('Snapshot failed:', err); }
    };

    // ─── Save enrollment ───────────────────────────────────────────────────
    const handleSaveEnrollment = async (personData) => {
        setSavingEnrollment(true);
        try {
            const payload = {
                id: personData.id,
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
            alert('Failed to save enrollment: ' + err.message);
        } finally {
            setSavingEnrollment(false);
        }
    };

    // ─── Delete biometrics ─────────────────────────────────────────────────
    const handleDeleteBiometrics = async (personId) => {
        if (!window.confirm('Delete face and fingerprint biometrics for this person?')) return;
        try {
            await ax.post('/terminal/enroll/delete', { id: personId });
            await fetchRoster();
            playChime('success');
        } catch (err) { alert('Failed to delete biometrics: ' + err.message); }
    };

    // ─── Assign vehicle ────────────────────────────────────────────────────
    const handleAssignVehicle = async (driverId, truckNo) => {
        try {
            await ax.post('/terminal/assign-vehicle', { driverId, vehicleNo: truckNo });
            await fetchRoster();
        } catch (err) { console.error('Assign vehicle failed:', err); }
    };

    // ─── Boot screen ───────────────────────────────────────────────────────
    if (isBooting) {
        return <VgtcBootScreen onBootComplete={() => { setIsBooting(false); resetIdleTimer(); }} terminalId={TERMINAL_ID} />;
    }

    // ─── Filtered roster ───────────────────────────────────────────────────
    const allRosterPeople = [...roster.drivers, ...roster.staff];
    const filteredPeople = allRosterPeople.filter(p =>
        p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.phone?.includes(searchQuery) ||
        p.assignedTruck?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // ─── Shared styles ─────────────────────────────────────────────────────
    const inputStyle = {
        width: '100%', padding: '9px 12px', borderRadius: '10px',
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
        color: '#ffffff', fontSize: '12px', marginTop: '4px',
        boxSizing: 'border-box', outline: 'none'
    };
    const selectStyle = { ...inputStyle, background: '#0d1f18' };
    const labelStyle = { fontSize: '11px', fontWeight: 800, color: 'rgba(255,255,255,0.55)', display: 'block' };

    // ─── Dark / light gradient backgrounds for bottom sheet ───────────────
    const sheetBg = isDarkMode
        ? 'linear-gradient(180deg, rgba(8,38,28,0.97) 0%, rgba(3,18,13,0.99) 100%)'
        : 'linear-gradient(180deg, rgba(230,247,242,0.98) 0%, rgba(209,237,229,0.99) 100%)';
    const sheetTextColor = isDarkMode ? '#ffffff' : '#0d2e22';
    const sheetSubColor = isDarkMode ? 'rgba(255,255,255,0.65)' : 'rgba(0,60,38,0.65)';
    const sheetCardBg = isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
    const sheetCardBorder = isDarkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,100,60,0.15)';
    const sheetBorderTop = isDarkMode ? '2px solid #00e5b3' : '2px solid #00a884';

    return (
        <div
            onClick={handleScreenClick}
            style={{
                position: 'fixed', inset: 0, width: '100vw', height: '100dvh', minHeight: '100vh',
                background: isDarkMode ? '#040d0a' : '#f0f5f2',
                color: isDarkMode ? '#ffffff' : '#111827',
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                overflow: 'hidden', zIndex: 9999, userSelect: 'none'
            }}
        >
            {/* ─── Hidden phone camera input ─────────────────────────────── */}
            <input type="file" accept="image/*" capture="user" ref={phoneCameraInputRef}
                style={{ display: 'none' }} onChange={handlePhoneCameraFile} />

            {/* ════════════════════════════════════════════════════════════
                1. FULL-SCREEN CAMERA PREVIEW (EDGE-TO-EDGE)
            ════════════════════════════════════════════════════════════ */}
            {cameraActive ? (
                <video ref={videoRef} autoPlay playsInline muted
                    onLoadedMetadata={() => videoRef.current?.play()?.catch(() => {})}
                    style={{
                        position: 'absolute', inset: 0, width: '100%', height: '100%',
                        objectFit: 'cover', transform: 'scaleX(-1)', zIndex: 0
                    }}
                />
            ) : (
                <div style={{
                    position: 'absolute', inset: 0, width: '100%', height: '100%',
                    background: isDarkMode
                        ? 'radial-gradient(circle at center, #0a2118 0%, #030a07 100%)'
                        : 'radial-gradient(circle at center, #e2ece7 0%, #cbdcd4 100%)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', zIndex: 0, gap: '12px'
                }}>
                    <Camera size={44} color={isDarkMode ? 'rgba(0,229,179,0.5)' : '#00a884'} />
                    <div style={{
                        color: isDarkMode ? 'rgba(255,255,255,0.75)' : '#1f3d32',
                        fontSize: '13px', fontWeight: 700, textAlign: 'center', maxWidth: '280px'
                    }}>
                        {lang === 'hi' ? 'कैमरा उपलब्ध नहीं — फोटो से लें' : 'Camera unavailable — use phone snap'}
                    </div>
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); phoneCameraInputRef.current?.click(); }}
                        style={{
                            padding: '7px 18px', borderRadius: '20px',
                            background: 'rgba(0,229,179,0.15)', border: '1px solid rgba(0,229,179,0.4)',
                            color: '#00e5b3', fontSize: '12px', fontWeight: 800, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '6px'
                        }}
                    >
                        <Camera size={14} />
                        <span>{lang === 'hi' ? 'कैमरे से फोटो लें' : 'Snap Photo'}</span>
                    </button>
                </div>
            )}

            {/* ── Cinematic gradient overlays ───────────────────────────── */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: '160px',
                background: isDarkMode
                    ? 'linear-gradient(180deg, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.25) 70%, transparent 100%)'
                    : 'linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.35) 70%, transparent 100%)',
                pointerEvents: 'none', zIndex: 2
            }} />
            <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, height: '260px',
                background: isDarkMode
                    ? 'linear-gradient(0deg, rgba(0,0,0,0.94) 0%, rgba(0,0,0,0.4) 65%, transparent 100%)'
                    : 'linear-gradient(0deg, rgba(240,245,242,0.97) 0%, rgba(240,245,242,0.45) 65%, transparent 100%)',
                pointerEvents: 'none', zIndex: 2
            }} />

            {/* ════════════════════════════════════════════════════════════
                2. SCREENSAVER
            ════════════════════════════════════════════════════════════ */}
            <AnimatePresence>
                {isScreensaver && (
                    <motion.div
                        key="screensaver"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.5 }}
                        onClick={(e) => { e.stopPropagation(); handleScreensaverWake(); }}
                        style={{
                            position: 'fixed', inset: 0, zIndex: 99999,
                            background: 'radial-gradient(circle at center, #071711 0%, #020705 100%)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            justifyContent: 'center', padding: '32px', cursor: 'pointer', overflow: 'hidden'
                        }}
                    >
                        <motion.div
                            animate={{ y: [-4, 4, -4] }}
                            transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
                            style={{ marginBottom: '28px', zIndex: 2 }}
                        >
                            <img src="/vgtc-logo-dark.png" alt="VGTC"
                                style={{ width: '200px', height: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 0 32px rgba(0,229,179,0.6))' }}
                                onError={(e) => { e.currentTarget.src = '/vgtc-logo.png'; }}
                            />
                        </motion.div>
                        <div style={{
                            fontSize: '68px', fontWeight: 900, letterSpacing: '-0.02em',
                            color: '#ffffff', fontFamily: 'monospace',
                            textShadow: '0 4px 30px rgba(0,229,179,0.5)', zIndex: 2
                        }}>
                            {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </div>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: 'rgba(255,255,255,0.65)', marginTop: '6px', zIndex: 2 }}>
                            {currentTime.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                        </div>
                        <motion.div
                            animate={{ opacity: [0.6, 1, 0.6], scale: [1, 1.03, 1] }}
                            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                            style={{
                                marginTop: '52px', fontSize: '18px', fontWeight: 800,
                                color: '#00e5b3', letterSpacing: '0.04em',
                                textShadow: '0 0 16px rgba(0,229,179,0.6)', zIndex: 2
                            }}
                        >
                            {t.touchToContinue}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ════════════════════════════════════════════════════════════
                3. TOP HEADER
            ════════════════════════════════════════════════════════════ */}
            <header
                onClick={(e) => e.stopPropagation()}
                style={{
                    position: 'relative', zIndex: 20,
                    paddingTop: 'max(14px, env(safe-area-inset-top, 14px))',
                    paddingBottom: '8px', paddingLeft: '14px', paddingRight: '14px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '56px'
                }}
            >
                {/* Left: Logo + online indicator */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div onClick={() => setShowAdminPinModal(true)}
                        style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
                        title="Tap to open Admin Settings / Exit"
                    >
                        <img src={isDarkMode ? '/vgtc-logo-dark.png' : '/vgtc-logo.png'} alt="VGTC"
                            style={{ height: '30px', maxWidth: '110px', objectFit: 'contain', filter: isDarkMode ? 'drop-shadow(0 2px 8px rgba(0,0,0,0.6))' : 'none' }}
                            onError={(e) => { e.currentTarget.src = isDarkMode ? '/vgtc-logo.png' : '/vgtc-logo-dark.png'; }}
                        />
                    </div>

                    {/* Online / offline chip */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        padding: '3px 8px', borderRadius: '12px',
                        background: isOnline ? 'rgba(0,229,179,0.12)' : 'rgba(245,158,11,0.15)',
                        border: `1px solid ${isOnline ? 'rgba(0,229,179,0.4)' : 'rgba(245,158,11,0.4)'}`,
                    }}>
                        {isOnline
                            ? <Wifi size={11} color="#00e5b3" />
                            : <WifiOff size={11} color="#f59e0b" />}
                        <span style={{ fontSize: '9.5px', fontWeight: 800, color: isOnline ? '#00e5b3' : '#f59e0b' }}>
                            {isOnline ? 'ONLINE' : 'OFFLINE'}
                        </span>
                        {offlineQueue.length > 0 && (
                            <span style={{
                                background: '#f59e0b', color: '#000', borderRadius: '8px',
                                padding: '0 4px', fontSize: '9px', fontWeight: 900
                            }}>{offlineQueue.length}</span>
                        )}
                    </div>
                </div>

                {/* Right: Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {/* Clock */}
                    <div style={{
                        padding: '3px 8px', borderRadius: '12px',
                        background: isDarkMode ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.85)',
                        backdropFilter: 'blur(12px)',
                        border: isDarkMode ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.1)',
                        fontSize: '11px', fontWeight: 700,
                        color: isDarkMode ? 'rgba(255,255,255,0.85)' : '#0f291e',
                        fontFamily: 'monospace'
                    }}>
                        {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </div>

                    {/* Theme Toggle */}
                    <button type="button" onClick={() => setIsDarkMode(d => !d)}
                        title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                        style={{
                            width: '32px', height: '32px', borderRadius: '50%',
                            background: isDarkMode ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.85)',
                            backdropFilter: 'blur(12px)',
                            border: isDarkMode ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(0,0,0,0.1)',
                            color: isDarkMode ? '#f59e0b' : '#047857',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                        }}
                    >
                        {isDarkMode ? <Sun size={14} /> : <Moon size={14} />}
                    </button>

                    {/* Language Switcher */}
                    <div style={{
                        display: 'flex',
                        background: isDarkMode ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.85)',
                        backdropFilter: 'blur(12px)', borderRadius: '20px', padding: '2px',
                        border: isDarkMode ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(0,0,0,0.1)'
                    }}>
                        {['en', 'hi'].map(l => (
                            <button key={l} type="button" onClick={() => setLang(l)}
                                style={{
                                    padding: '4px 8px', borderRadius: '16px', border: 'none',
                                    fontSize: '11px', fontWeight: 800,
                                    background: lang === l ? '#00a884' : 'transparent',
                                    color: lang === l ? '#ffffff' : (isDarkMode ? 'rgba(255,255,255,0.65)' : '#374151'),
                                    cursor: 'pointer', transition: 'all 0.15s'
                                }}
                            >
                                {l === 'en' ? 'EN' : 'हिन्दी'}
                            </button>
                        ))}
                    </div>

                    {/* Sound Toggle */}
                    <button type="button" onClick={() => setSoundEnabled(s => !s)}
                        style={{
                            width: '32px', height: '32px', borderRadius: '50%',
                            background: isDarkMode ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.85)',
                            backdropFilter: 'blur(12px)',
                            border: isDarkMode ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(0,0,0,0.1)',
                            color: soundEnabled ? '#00e5b3' : (isDarkMode ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)'),
                            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                        }}
                    >
                        {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                    </button>

                    {/* Admin PIN Lock */}
                    <button type="button" onClick={() => setShowAdminPinModal(true)}
                        title="Admin PIN Required"
                        style={{
                            width: '32px', height: '32px', borderRadius: '50%',
                            background: isDarkMode ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.85)',
                            backdropFilter: 'blur(12px)',
                            border: isDarkMode ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(0,0,0,0.1)',
                            color: isDarkMode ? '#00e5b3' : '#059669',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                        }}
                    >
                        <Lock size={14} />
                    </button>

                    {/* ── Exit App Button ───────────────────────────────── */}
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setShowExitConfirm(true); }}
                        title="Exit App"
                        style={{
                            width: '32px', height: '32px', borderRadius: '50%',
                            background: 'rgba(239,68,68,0.15)',
                            backdropFilter: 'blur(12px)',
                            border: '1px solid rgba(239,68,68,0.4)',
                            color: '#ef4444',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                        }}
                    >
                        <X size={14} />
                    </button>
                </div>
            </header>

            {/* ════════════════════════════════════════════════════════════
                4. BIOMETRIC SCANNING HUD (centre area)
            ════════════════════════════════════════════════════════════ */}
            <div style={{
                position: 'relative', zIndex: 10,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                minHeight: 'calc(100dvh - 170px)', padding: '10px 0', pointerEvents: 'none'
            }}>
                {/* Status instruction pill */}
                <div style={{
                    padding: '6px 18px', borderRadius: '20px',
                    background: isDarkMode ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.88)',
                    backdropFilter: 'blur(14px)',
                    border: `1px solid ${scanningStatus === 'ANALYZING' ? 'rgba(0,229,179,0.6)' : 'rgba(0,229,179,0.35)'}`,
                    color: isDarkMode ? '#ffffff' : '#042f2e',
                    fontSize: '12.5px', fontWeight: 800, marginBottom: '16px',
                    letterSpacing: '0.02em', boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
                    pointerEvents: 'auto'
                }}>
                    {scanningStatus === 'ANALYZING'
                        ? t.verifyingFace
                        : (lang === 'hi' ? 'कृपया कैमरे की तरफ देखें' : 'Look into camera to check in')}
                </div>

                {/* Face bounding box */}
                <motion.div
                    onClick={(e) => { e.stopPropagation(); if (scanningStatus === 'IDLE') handleTriggerFaceScan(); }}
                    animate={{ scale: scanningStatus === 'ANALYZING' ? [1, 1.02, 1] : 1 }}
                    transition={{ duration: 1.2, repeat: scanningStatus === 'ANALYZING' ? Infinity : 0, ease: 'easeInOut' }}
                    style={{
                        position: 'relative', width: '230px', height: '270px',
                        maxWidth: '78vw', maxHeight: '44vh',
                        borderRadius: '24px',
                        border: scanningStatus === 'ANALYZING' ? '2.5px solid #00e5b3'
                            : (scanningStatus === 'RECOGNIZED' || scanningStatus === 'SUCCESS') ? '3px solid #10b981'
                            : scanningStatus === 'DUPLICATE' ? '3px solid #f59e0b'
                            : '2px solid rgba(255,255,255,0.4)',
                        boxShadow: scanningStatus === 'ANALYZING' ? '0 0 24px rgba(0,229,179,0.4), inset 0 0 16px rgba(0,229,179,0.15)'
                            : (scanningStatus === 'RECOGNIZED' || scanningStatus === 'SUCCESS') ? '0 0 28px rgba(16,185,129,0.5)'
                            : scanningStatus === 'DUPLICATE' ? '0 0 24px rgba(245,158,11,0.45)'
                            : '0 4px 20px rgba(0,0,0,0.25)',
                        background: 'transparent',
                        cursor: scanningStatus === 'IDLE' ? 'pointer' : 'default',
                        pointerEvents: 'auto',
                        display: 'flex', flexDirection: 'column', justifyContent: 'center',
                        alignItems: 'center', overflow: 'hidden'
                    }}
                >
                    {/* Corner brackets */}
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
                                width: '24px', height: '24px',
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

                    {/* Captured selfie preview */}
                    {capturedSelfieUrl && (
                        <img src={capturedSelfieUrl} alt="Captured face"
                            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                    )}

                    {/* Success badge */}
                    {(scanningStatus === 'RECOGNIZED' || scanningStatus === 'SUCCESS') && (
                        <div style={{
                            position: 'absolute', top: '12px', right: '12px',
                            background: '#10b981', color: '#ffffff', borderRadius: '50%',
                            width: '28px', height: '28px', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', boxShadow: '0 0 14px rgba(16,185,129,0.9)'
                        }}>
                            <Check size={17} strokeWidth={3} />
                        </div>
                    )}

                    {/* Duplicate badge */}
                    {scanningStatus === 'DUPLICATE' && (
                        <div style={{
                            position: 'absolute', top: '12px', right: '12px',
                            background: '#f59e0b', color: '#000', borderRadius: '50%',
                            width: '28px', height: '28px', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', boxShadow: '0 0 14px rgba(245,158,11,0.9)'
                        }}>
                            <AlertTriangle size={16} strokeWidth={3} />
                        </div>
                    )}

                    {/* Align face hint */}
                    {scanningStatus === 'IDLE' && !capturedSelfieUrl && (
                        <div style={{
                            textAlign: 'center', color: 'rgba(255,255,255,0.85)', fontSize: '12px',
                            fontWeight: 700, letterSpacing: '0.02em',
                            textShadow: '0 2px 8px rgba(0,0,0,0.9)',
                            background: 'rgba(0,0,0,0.42)', padding: '6px 14px',
                            borderRadius: '16px', backdropFilter: 'blur(6px)'
                        }}>
                            {t.alignFacePrompt}
                        </div>
                    )}
                </motion.div>

                {/* Scan progress counter */}
                {scanningStatus === 'ANALYZING' && (
                    <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
                        style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}
                    >
                        <div style={{
                            fontSize: '28px', fontWeight: 900, color: '#00e5b3', letterSpacing: '0.04em',
                            textShadow: '0 0 16px rgba(0,229,179,0.95), 0 2px 8px rgba(0,0,0,0.8)'
                        }}>
                            {scanProgress}%
                        </div>
                        <div style={{
                            fontSize: '12.5px', fontWeight: 800,
                            color: isDarkMode ? 'rgba(255,255,255,0.9)' : '#0d1f18',
                            background: isDarkMode ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.88)',
                            padding: '4px 14px', borderRadius: '16px', backdropFilter: 'blur(8px)',
                            border: isDarkMode ? '1px solid rgba(0,229,179,0.3)' : '1px solid rgba(0,0,0,0.1)'
                        }}>
                            {lang === 'hi' ? 'बायोमेट्रिक पहचान हो रही है...' : 'Verifying biometrics...'}
                        </div>
                    </motion.div>
                )}

                {/* IDLE: scan face button + driver switcher */}
                {scanningStatus === 'IDLE' && (
                    <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        gap: '8px', marginTop: '14px', pointerEvents: 'auto'
                    }}>
                        <motion.button type="button" whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                            onClick={handleTriggerFaceScan}
                            style={{
                                padding: '10px 24px', borderRadius: '24px',
                                background: 'linear-gradient(135deg, #00a884 0%, #059669 100%)',
                                border: '1.5px solid rgba(0,229,179,0.7)',
                                color: '#ffffff', fontSize: '13.5px', fontWeight: 900, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '8px',
                                boxShadow: '0 6px 20px rgba(0,168,132,0.45)'
                            }}
                        >
                            <Camera size={17} />
                            <span>{t.scanFacePrompt}</span>
                        </motion.button>

                        {availableDrivers?.length > 1 && (
                            <button type="button" onClick={handleCycleTestDriver}
                                title="Cycle test driver"
                                style={{
                                    background: isDarkMode ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.88)',
                                    backdropFilter: 'blur(8px)',
                                    border: isDarkMode ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.12)',
                                    borderRadius: '16px', padding: '4px 12px',
                                    color: isDarkMode ? 'rgba(255,255,255,0.85)' : '#0f291e',
                                    fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '5px'
                                }}
                            >
                                <RefreshCw size={11} color="#00e5b3" />
                                <span>{t.switchDriver}: <b style={{ color: '#00e5b3' }}>{currentTestDriver.name}</b> ({currentTestDriver.assignedTruck})</span>
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* ════════════════════════════════════════════════════════════
                5. FLOATING FINGERPRINT BUTTON (below content, z below sheet)
            ════════════════════════════════════════════════════════════ */}
            {scanningStatus === 'IDLE' && (
                <div style={{
                    position: 'absolute',
                    bottom: 'max(28px, env(safe-area-inset-bottom, 28px))',
                    left: 0, right: 0, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', zIndex: 20
                }}>
                    <motion.button type="button" whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                        onClick={handleFingerprintDirectPress}
                        style={{
                            padding: '13px 28px', borderRadius: '32px',
                            background: 'linear-gradient(135deg, rgba(0,168,132,0.94) 0%, rgba(5,150,105,0.94) 100%)',
                            border: '1.5px solid rgba(0,229,179,0.6)', backdropFilter: 'blur(16px)',
                            color: '#ffffff', fontSize: '13.5px', fontWeight: 900, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '8px',
                            boxShadow: '0 8px 32px rgba(0,168,132,0.5)'
                        }}
                    >
                        <Fingerprint size={20} color="#00e5b3" />
                        <span>{t.scanFingerprintPrompt}</span>
                    </motion.button>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════
                6. BOTTOM ATTENDANCE SHEET
                States: RECOGNIZED (action buttons) | SUCCESS (done) | DUPLICATE (warning)
            ════════════════════════════════════════════════════════════ */}
            <AnimatePresence>
                {(scanningStatus === 'RECOGNIZED' || scanningStatus === 'SUCCESS' || scanningStatus === 'DUPLICATE') && recognizedPerson && (
                    <motion.div
                        key="attendance_sheet"
                        initial={{ y: '100%', opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: '100%', opacity: 0 }}
                        transition={{ type: 'spring', damping: 28, stiffness: 290 }}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 40,
                            background: scanningStatus === 'DUPLICATE'
                                ? (isDarkMode ? 'linear-gradient(180deg,rgba(38,24,4,0.98)0%,rgba(18,10,2,0.99)100%)' : 'linear-gradient(180deg,rgba(255,248,230,0.98)0%,rgba(255,240,200,0.99)100%)')
                                : sheetBg,
                            backdropFilter: 'blur(24px)',
                            borderTop: scanningStatus === 'DUPLICATE' ? '2px solid #f59e0b' : sheetBorderTop,
                            borderTopLeftRadius: '30px', borderTopRightRadius: '30px',
                            padding: '18px 18px max(28px, env(safe-area-inset-bottom, 28px))',
                            boxShadow: '0 -15px 50px rgba(0,0,0,0.7)',
                            display: 'flex', flexDirection: 'column', gap: '11px',
                            maxHeight: '82vh', overflowY: 'auto'
                        }}
                    >
                        {/* Pull notch */}
                        <div style={{
                            width: '40px', height: '4px', borderRadius: '2px',
                            background: isDarkMode ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)',
                            margin: '-4px auto 2px'
                        }} />

                        {/* ── DUPLICATE STATE ─────────────────────────── */}
                        {scanningStatus === 'DUPLICATE' && (
                            <>
                                {/* Header */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                                        padding: '4px 12px', borderRadius: '20px',
                                        background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.45)',
                                        color: '#f59e0b', fontSize: '11px', fontWeight: 900
                                    }}>
                                        <AlertTriangle size={14} />
                                        <span>{t.attendanceDuplicateTitle}</span>
                                    </div>
                                    <span style={{ fontSize: '11px', color: isDarkMode ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.5)', fontWeight: 600 }}>
                                        {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>

                                {/* Profile */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{
                                        width: '50px', height: '50px', borderRadius: '50%',
                                        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        border: '2px solid rgba(245,158,11,0.5)', overflow: 'hidden', flexShrink: 0
                                    }}>
                                        {recognizedPerson.photoUrl
                                            ? <img src={recognizedPerson.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            : <Truck size={24} color="#fff" />}
                                    </div>
                                    <div>
                                        <h3 style={{ fontSize: '17px', fontWeight: 900, color: isDarkMode ? '#fff' : '#0d2e22', margin: '0 0 2px 0' }}>
                                            {recognizedPerson.name}
                                        </h3>
                                        <div style={{ fontSize: '11.5px', color: isDarkMode ? 'rgba(255,255,255,0.6)' : 'rgba(0,60,38,0.65)', fontWeight: 600 }}>
                                            {lang === 'hi'
                                                ? 'आज की हाजिरी पहले ही दर्ज हो चुकी है।'
                                                : 'Attendance already marked for today.'}
                                        </div>
                                    </div>
                                </div>

                                {/* Warning card */}
                                <div style={{
                                    background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
                                    borderRadius: '14px', padding: '10px 14px',
                                    fontSize: '12px', fontWeight: 700,
                                    color: isDarkMode ? 'rgba(255,255,255,0.8)' : '#7c4e00'
                                }}>
                                    {activeDecision?.message || (lang === 'hi'
                                        ? 'यदि यह गलत है तो प्रबंधक से संपर्क करें।'
                                        : 'If this is incorrect, please contact your manager.')}
                                </div>

                                {/* Dismiss button */}
                                <button type="button" onClick={dismissAttendanceDetails}
                                    style={{
                                        width: '100%', padding: '12px', borderRadius: '24px',
                                        background: 'rgba(245,158,11,0.15)',
                                        border: '1.5px solid rgba(245,158,11,0.45)',
                                        color: '#f59e0b', fontSize: '13px', fontWeight: 900, cursor: 'pointer'
                                    }}
                                >
                                    {lang === 'hi' ? 'ठीक है, बंद करें' : 'OK, Dismiss'}
                                </button>
                            </>
                        )}

                        {/* ── RECOGNIZED STATE ─────────────────────────── */}
                        {scanningStatus === 'RECOGNIZED' && (
                            <>
                                {/* Verified header */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                                        padding: '4px 12px', borderRadius: '20px',
                                        background: 'rgba(0,229,179,0.12)', border: '1px solid rgba(0,229,179,0.4)',
                                        color: '#00e5b3', fontSize: '11px', fontWeight: 900
                                    }}>
                                        <CheckCircle2 size={14} />
                                        <span>{t.identityVerified} • 100% MATCH</span>
                                    </div>
                                    <span style={{ fontSize: '11px', color: sheetSubColor, fontWeight: 600 }}>
                                        {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>

                                {/* Profile hero */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ position: 'relative', flexShrink: 0 }}>
                                        <div style={{
                                            width: '52px', height: '52px', borderRadius: '50%',
                                            background: 'linear-gradient(135deg, #00a884 0%, #005f4b 100%)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            border: '2px solid rgba(255,255,255,0.25)', overflow: 'hidden'
                                        }}>
                                            {recognizedPerson.photoUrl
                                                ? <img src={recognizedPerson.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                : <Truck size={26} color="#fff" />}
                                        </div>
                                        <div style={{
                                            position: 'absolute', bottom: '-2px', right: '-2px',
                                            width: '18px', height: '18px', borderRadius: '50%',
                                            background: '#00e5b3', color: '#03140e',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontWeight: 900, fontSize: '11px'
                                        }}>✓</div>
                                    </div>
                                    <div>
                                        <h3 style={{ fontSize: '18px', fontWeight: 900, color: sheetTextColor, margin: '0 0 2px 0', letterSpacing: '-0.01em' }}>
                                            {recognizedPerson.name}
                                        </h3>
                                        <div style={{ fontSize: '11.5px', color: sheetSubColor, fontWeight: 600 }}>
                                            ID: <b style={{ color: '#00e5b3' }}>{recognizedPerson.employeeId}</b>
                                            {recognizedPerson.phone && ` • +91 ${recognizedPerson.phone}`}
                                        </div>
                                    </div>
                                </div>

                                {/* Info grid */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                    <div style={{ background: sheetCardBg, border: sheetCardBorder, borderRadius: '14px', padding: '10px 12px' }}>
                                        <div style={{ fontSize: '9.5px', fontWeight: 800, color: sheetSubColor, textTransform: 'uppercase', marginBottom: '2px' }}>
                                            {t.assignedTruck}
                                        </div>
                                        <div style={{ fontSize: '13.5px', fontWeight: 900, color: sheetTextColor }}>
                                            {recognizedPerson.assignedTruck || '—'}
                                        </div>
                                        <div style={{ marginTop: '3px', fontSize: '10px', fontWeight: 900, color: recognizedPerson.status === 'ON_TRIP' ? '#f59e0b' : '#00e5b3' }}>
                                            ● {recognizedPerson.status === 'ON_TRIP' ? t.activeTrip : t.availableDuty}
                                        </div>
                                    </div>
                                    <div style={{ background: sheetCardBg, border: sheetCardBorder, borderRadius: '14px', padding: '10px 12px' }}>
                                        <div style={{ fontSize: '9.5px', fontWeight: 800, color: sheetSubColor, textTransform: 'uppercase', marginBottom: '2px' }}>
                                            {t.destination}
                                        </div>
                                        <div style={{ fontSize: '13px', fontWeight: 900, color: sheetTextColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {recognizedPerson.activeTrip?.destination || (lang === 'hi' ? 'रिवारी यार्ड' : 'Rewari Yard')}
                                        </div>
                                        <div style={{ fontSize: '10px', color: sheetSubColor, marginTop: '2px' }}>
                                            {recognizedPerson.activeTrip?.partyName || (lang === 'hi' ? 'डिस्पैच के लिए तैयार' : 'Free for Dispatch')}
                                        </div>
                                    </div>
                                </div>

                                {/* Action buttons */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '2px' }}>
                                    {recognizedPerson.status === 'ON_TRIP' ? (
                                        <>
                                            <button type="button" onClick={() => handleConfirmDutyAction('TRIP_RETURN')}
                                                style={{
                                                    width: '100%', padding: '13px', borderRadius: '24px',
                                                    background: 'linear-gradient(135deg, #00a884 0%, #059669 100%)',
                                                    border: 'none', color: '#ffffff', fontSize: '14px',
                                                    fontWeight: 900, cursor: 'pointer',
                                                    boxShadow: '0 8px 24px rgba(0,168,132,0.4)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                                                }}
                                            >
                                                <CheckCircle2 size={17} />
                                                <span>{t.returnFromTrip}</span>
                                            </button>
                                            <button type="button" onClick={() => handleConfirmDutyAction('OFFICE_VISIT')}
                                                style={{
                                                    width: '100%', padding: '11px', borderRadius: '24px',
                                                    background: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,100,60,0.06)',
                                                    border: isDarkMode ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,100,60,0.2)',
                                                    color: sheetTextColor, fontSize: '13px', fontWeight: 800, cursor: 'pointer'
                                                }}
                                            >
                                                {t.officeVisit}
                                            </button>
                                        </>
                                    ) : (
                                        <button type="button" onClick={() => handleConfirmDutyAction('CHECK_IN')}
                                            style={{
                                                width: '100%', padding: '13px', borderRadius: '24px',
                                                background: 'linear-gradient(135deg, #00a884 0%, #059669 100%)',
                                                border: 'none', color: '#ffffff', fontSize: '14px',
                                                fontWeight: 900, cursor: 'pointer',
                                                boxShadow: '0 8px 24px rgba(0,168,132,0.4)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                                            }}
                                        >
                                            <CheckCircle2 size={17} />
                                            <span>{t.confirmAttendance}</span>
                                        </button>
                                    )}

                                    {/* Dismiss */}
                                    <button type="button" onClick={dismissAttendanceDetails}
                                        style={{
                                            background: 'transparent', border: 'none',
                                            color: sheetSubColor, fontSize: '12px', fontWeight: 700,
                                            cursor: 'pointer', textAlign: 'center'
                                        }}
                                    >
                                        {lang === 'hi' ? 'रद्द करें' : 'Cancel / Not me'}
                                    </button>
                                </div>
                            </>
                        )}

                        {/* ── SUCCESS STATE ─────────────────────────────── */}
                        {scanningStatus === 'SUCCESS' && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', paddingTop: '4px' }}>
                                {/* Big checkmark */}
                                <motion.div
                                    initial={{ scale: 0.5, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ type: 'spring', damping: 14, stiffness: 200 }}
                                    style={{
                                        width: '72px', height: '72px', borderRadius: '50%',
                                        background: 'linear-gradient(135deg, #00a884 0%, #059669 100%)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        boxShadow: '0 0 40px rgba(0,168,132,0.5)'
                                    }}
                                >
                                    <Check size={38} color="#fff" strokeWidth={3} />
                                </motion.div>

                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '20px', fontWeight: 900, color: sheetTextColor, marginBottom: '4px' }}>
                                        {t.attendanceConfirmedTitle}
                                    </div>
                                    <div style={{ fontSize: '14px', color: '#00e5b3', fontWeight: 700 }}>
                                        {recognizedPerson.name}
                                    </div>
                                    <div style={{ fontSize: '11.5px', color: sheetSubColor, fontWeight: 600, marginTop: '2px' }}>
                                        {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                        {lastActionType === 'TRIP_RETURN' && (
                                            <span style={{ marginLeft: '6px', color: '#f59e0b' }}>
                                                {lang === 'hi' ? '· ट्रिप वापसी' : '· Trip Return'}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Truck info */}
                                <div style={{
                                    width: '100%', background: sheetCardBg, border: sheetCardBorder,
                                    borderRadius: '14px', padding: '10px 14px',
                                    display: 'flex', alignItems: 'center', gap: '10px'
                                }}>
                                    <Truck size={20} color="#00e5b3" />
                                    <div>
                                        <div style={{ fontSize: '12px', fontWeight: 900, color: sheetTextColor }}>
                                            {recognizedPerson.assignedTruck || '—'}
                                        </div>
                                        <div style={{ fontSize: '10.5px', color: sheetSubColor }}>
                                            {lang === 'hi' ? 'आवंटित वाहन' : 'Assigned vehicle'}
                                        </div>
                                    </div>
                                </div>

                                <div style={{ fontSize: '11px', color: sheetSubColor, textAlign: 'center', fontWeight: 600 }}>
                                    {lang === 'hi' ? 'स्क्रीन अपने आप बंद हो जाएगी...' : 'Screen will close automatically...'}
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ════════════════════════════════════════════════════════════
                7. ADMIN PIN MODAL
            ════════════════════════════════════════════════════════════ */}
            <AnimatePresence>
                {showAdminPinModal && (
                    <motion.div
                        key="pin_modal_bg"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)',
                            backdropFilter: 'blur(12px)', zIndex: 999999,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
                        }}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            style={{
                                width: '100%', maxWidth: '320px', background: '#0d1f18',
                                borderRadius: '24px', border: '1px solid rgba(0,229,179,0.3)',
                                padding: '24px', textAlign: 'center',
                                boxShadow: '0 20px 60px rgba(0,0,0,0.7)'
                            }}
                        >
                            <div style={{
                                width: '44px', height: '44px', borderRadius: '50%',
                                background: 'rgba(0,229,179,0.12)', color: '#00e5b3',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px'
                            }}>
                                <Lock size={20} />
                            </div>
                            <h3 style={{ fontSize: '17px', fontWeight: 900, margin: '0 0 4px 0', color: '#ffffff' }}>
                                Admin PIN Code
                            </h3>
                            <p style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.6)', margin: '0 0 16px 0', lineHeight: 1.45 }}>
                                {t.enterPinPrompt}
                            </p>

                            {/* PIN display dots */}
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '14px' }}>
                                {[0,1,2,3].map(i => (
                                    <div key={i} style={{
                                        width: '14px', height: '14px', borderRadius: '50%',
                                        background: i < enteredPin.length ? '#00e5b3' : 'rgba(255,255,255,0.15)',
                                        border: i < enteredPin.length ? '2px solid #00e5b3' : '2px solid rgba(255,255,255,0.25)',
                                        transition: 'all 0.15s'
                                    }} />
                                ))}
                            </div>

                            {pinError && (
                                <div style={{ color: '#ef4444', fontSize: '11px', fontWeight: 700, marginBottom: '10px' }}>
                                    {pinError}
                                </div>
                            )}

                            {/* Touch keypad */}
                            <div style={{
                                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                                gap: '8px', maxWidth: '240px', margin: '0 auto 14px'
                            }}>
                                {['1','2','3','4','5','6','7','8','9','C','0','⌫'].map(k => (
                                    <button key={k} type="button"
                                        onClick={() => {
                                            if (k === 'C') { setEnteredPin(''); setPinError(''); }
                                            else if (k === '⌫') { setEnteredPin(p => p.slice(0, -1)); setPinError(''); }
                                            else if (enteredPin.length < 4) {
                                                const next = enteredPin + k;
                                                setEnteredPin(next);
                                                handleAdminPinSubmit(next);
                                            }
                                        }}
                                        style={{
                                            padding: '12px', borderRadius: '12px',
                                            background: k === 'C' || k === '⌫' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.12)',
                                            border: '1px solid rgba(255,255,255,0.15)',
                                            color: '#ffffff', fontSize: '17px', fontWeight: 800, cursor: 'pointer',
                                            transition: 'background 0.12s'
                                        }}
                                    >
                                        {k}
                                    </button>
                                ))}
                            </div>

                            <button type="button"
                                onClick={() => { setShowAdminPinModal(false); setEnteredPin(''); setPinError(''); }}
                                style={{
                                    background: 'transparent', border: 'none',
                                    color: 'rgba(255,255,255,0.45)', fontSize: '12px', fontWeight: 700, cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ════════════════════════════════════════════════════════════
                8. ADMIN PANEL
            ════════════════════════════════════════════════════════════ */}
            <AnimatePresence>
                {showAdminPanel && (
                    <motion.div
                        key="admin_panel_bg"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
                            backdropFilter: 'blur(16px)', zIndex: 999999,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
                        }}
                    >
                        <motion.div
                            initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.92, opacity: 0 }}
                            style={{
                                width: '100%', maxWidth: '520px', maxHeight: '90vh',
                                background: '#0a1612', borderRadius: '24px',
                                border: '1.5px solid rgba(0,229,179,0.3)',
                                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                                boxShadow: '0 25px 70px rgba(0,0,0,0.85)'
                            }}
                        >
                            {/* Panel header */}
                            <div style={{
                                padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                flexShrink: 0
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Shield size={18} color="#00e5b3" />
                                    <h3 style={{ fontSize: '15px', fontWeight: 900, margin: 0, color: '#ffffff' }}>
                                        {t.adminPanel}
                                    </h3>
                                </div>
                                <button type="button"
                                    onClick={() => { setShowAdminPanel(false); setEnrollingPerson(null); setEnrollSnapshot(null); }}
                                    style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.55)', cursor: 'pointer', padding: '4px' }}
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Tabs */}
                            <div style={{
                                display: 'flex', padding: '8px 12px', gap: '6px',
                                background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.06)',
                                flexShrink: 0
                            }}>
                                {[
                                    { key: 'roster', label: `Roster (${allRosterPeople.length})` },
                                    { key: 'add', label: '+ Enroll New' },
                                    { key: 'system', label: 'System & Exit' }
                                ].map(tab => (
                                    <button key={tab.key} type="button"
                                        onClick={() => { setAdminTab(tab.key); setEnrollingPerson(null); setEnrollSnapshot(null); }}
                                        style={{
                                            flex: 1, padding: '7px 4px', borderRadius: '10px', border: 'none',
                                            fontSize: '11px', fontWeight: 800,
                                            background: adminTab === tab.key ? '#00a884' : 'transparent',
                                            color: adminTab === tab.key ? '#ffffff' : 'rgba(255,255,255,0.55)',
                                            cursor: 'pointer', transition: 'all 0.15s'
                                        }}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* Panel body */}
                            <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>

                                {/* ── ROSTER TAB ────────────────────────── */}
                                {adminTab === 'roster' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {/* Search */}
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: '8px',
                                            padding: '7px 10px', background: 'rgba(255,255,255,0.05)',
                                            borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)'
                                        }}>
                                            <Search size={14} color="rgba(255,255,255,0.4)" />
                                            <input type="text" placeholder="Search name, phone, truck…"
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#ffffff', fontSize: '12px' }}
                                            />
                                        </div>

                                        {rosterLoading ? (
                                            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '12px', padding: '20px' }}>
                                                Loading roster…
                                            </div>
                                        ) : filteredPeople.length === 0 ? (
                                            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: '12px', padding: '20px' }}>
                                                No results found
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {filteredPeople.map(p => (
                                                    <div key={p.id} style={{
                                                        background: 'rgba(255,255,255,0.04)',
                                                        border: '1px solid rgba(255,255,255,0.08)',
                                                        borderRadius: '14px', padding: '10px 12px',
                                                        display: 'flex', flexDirection: 'column', gap: '8px'
                                                    }}>
                                                        {/* Person row */}
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                                                                <div style={{
                                                                    width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0,
                                                                    background: p.faceEnrolled ? 'rgba(0,229,179,0.18)' : 'rgba(255,255,255,0.07)',
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    border: `1.5px solid ${p.faceEnrolled ? '#00e5b3' : 'rgba(255,255,255,0.18)'}`,
                                                                    overflow: 'hidden'
                                                                }}>
                                                                    {p.photoUrl
                                                                        ? <img src={p.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                        : <User size={16} color={p.faceEnrolled ? '#00e5b3' : '#ffffff'} />}
                                                                </div>
                                                                <div>
                                                                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#ffffff' }}>
                                                                        {p.name} <span style={{ fontSize: '9.5px', color: '#00e5b3', fontWeight: 700 }}>({p.type})</span>
                                                                    </div>
                                                                    <div style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.5)' }}>
                                                                        {p.employeeId}{p.phone && ` • ${p.phone}`}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            {/* Biometric badges */}
                                                            <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                                                                {[
                                                                    { ok: p.faceEnrolled, label: p.faceEnrolled ? 'Face ✓' : 'Face ✗' },
                                                                    { ok: p.fingerprintEnrolled, label: p.fingerprintEnrolled ? 'FP ✓' : 'FP ✗' }
                                                                ].map((b, i) => (
                                                                    <span key={i} style={{
                                                                        fontSize: '9px', fontWeight: 800, padding: '2px 6px', borderRadius: '5px',
                                                                        background: b.ok ? 'rgba(0,229,179,0.12)' : 'rgba(239,68,68,0.12)',
                                                                        color: b.ok ? '#00e5b3' : '#ef4444'
                                                                    }}>{b.label}</span>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        {/* Vehicle selector */}
                                                        <div style={{
                                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                            background: 'rgba(0,0,0,0.22)', padding: '5px 8px', borderRadius: '8px'
                                                        }}>
                                                            <div style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.55)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <Truck size={12} color="#00e5b3" />
                                                                <span>Assigned Truck:</span>
                                                            </div>
                                                            <select value={p.assignedTruck || ''} onChange={(e) => handleAssignVehicle(p.id, e.target.value)}
                                                                style={{
                                                                    background: '#0d1f18', border: '1px solid rgba(0,229,179,0.3)',
                                                                    color: '#ffffff', fontSize: '11px', fontWeight: 700,
                                                                    padding: '3px 6px', borderRadius: '6px', outline: 'none'
                                                                }}
                                                            >
                                                                <option value="">— Unassigned —</option>
                                                                {vehicles.map(v => (
                                                                    <option key={v.id || v.truckNo} value={v.truckNo}>
                                                                        {v.truckNo} ({v.owner || 'VGTC'})
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>

                                                        {/* Action buttons */}
                                                        <div style={{ display: 'flex', gap: '6px' }}>
                                                            <button type="button"
                                                                onClick={() => { setEnrollingPerson(p); setEnrollSnapshot(null); }}
                                                                style={{
                                                                    flex: 1, padding: '6px', borderRadius: '8px',
                                                                    background: '#00a884', border: 'none',
                                                                    color: '#ffffff', fontSize: '11px', fontWeight: 800, cursor: 'pointer',
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                                                                }}
                                                            >
                                                                <Camera size={12} />
                                                                <span>{p.faceEnrolled ? 'Change Face' : 'Enroll Face'}</span>
                                                            </button>
                                                            <button type="button"
                                                                onClick={() => handleSaveEnrollment({ ...p, fingerprintEnrolled: !p.fingerprintEnrolled })}
                                                                style={{
                                                                    flex: 1, padding: '6px', borderRadius: '8px',
                                                                    background: 'rgba(255,255,255,0.07)',
                                                                    border: '1px solid rgba(255,255,255,0.14)',
                                                                    color: '#ffffff', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                                                                }}
                                                            >
                                                                <Fingerprint size={12} color="#00e5b3" />
                                                                <span>{p.fingerprintEnrolled ? 'Remove FP' : 'Enable FP'}</span>
                                                            </button>
                                                            {(p.faceEnrolled || p.fingerprintEnrolled) && (
                                                                <button type="button" onClick={() => handleDeleteBiometrics(p.id)}
                                                                    title="Delete Biometrics"
                                                                    style={{
                                                                        padding: '6px 10px', borderRadius: '8px',
                                                                        background: 'rgba(239,68,68,0.12)',
                                                                        border: '1px solid rgba(239,68,68,0.28)',
                                                                        color: '#ef4444', cursor: 'pointer'
                                                                    }}
                                                                >
                                                                    <Trash2 size={13} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* ── ADD NEW PERSON TAB ────────────────── */}
                                {adminTab === 'add' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                        <div>
                                            <label style={labelStyle}>Full Name *</label>
                                            <input type="text" placeholder="e.g. Ramesh Kumar"
                                                value={newPersonForm.name}
                                                onChange={(e) => setNewPersonForm({ ...newPersonForm, name: e.target.value })}
                                                style={inputStyle}
                                            />
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                            <div>
                                                <label style={labelStyle}>Mobile Phone</label>
                                                <input type="tel" placeholder="9876543210"
                                                    value={newPersonForm.phone}
                                                    onChange={(e) => setNewPersonForm({ ...newPersonForm, phone: e.target.value })}
                                                    style={inputStyle}
                                                />
                                            </div>
                                            <div>
                                                <label style={labelStyle}>Employee ID</label>
                                                <input type="text" placeholder="DRV-001"
                                                    value={newPersonForm.employeeId}
                                                    onChange={(e) => setNewPersonForm({ ...newPersonForm, employeeId: e.target.value })}
                                                    style={inputStyle}
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label style={labelStyle}>Role</label>
                                            <select value={newPersonForm.type}
                                                onChange={(e) => setNewPersonForm({ ...newPersonForm, type: e.target.value })}
                                                style={selectStyle}
                                            >
                                                <option value="DRIVER">Driver (चालक)</option>
                                                <option value="STAFF">Staff (कर्मचारी)</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label style={labelStyle}>Assign Vehicle from VGTC Fleet</label>
                                            <select value={newPersonForm.assignedTruck}
                                                onChange={(e) => setNewPersonForm({ ...newPersonForm, assignedTruck: e.target.value })}
                                                style={selectStyle}
                                            >
                                                <option value="">— Select Truck —</option>
                                                {vehicles.map(v => (
                                                    <option key={v.id || v.truckNo} value={v.truckNo}>
                                                        {v.truckNo} ({v.owner || 'VGTC'})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                            <input type="checkbox"
                                                checked={newPersonForm.fingerprintEnrolled}
                                                onChange={(e) => setNewPersonForm({ ...newPersonForm, fingerprintEnrolled: e.target.checked })}
                                                style={{ width: '16px', height: '16px', accentColor: '#00a884' }}
                                            />
                                            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)' }}>
                                                Enable Direct Fingerprint Authentication
                                            </span>
                                        </label>

                                        <button type="button"
                                            disabled={!newPersonForm.name}
                                            onClick={async () => {
                                                await handleSaveEnrollment(newPersonForm);
                                                setNewPersonForm({ name: '', phone: '', employeeId: '', type: 'DRIVER', assignedTruck: '', fingerprintEnrolled: false });
                                                setAdminTab('roster');
                                            }}
                                            style={{
                                                padding: '12px', borderRadius: '12px',
                                                background: newPersonForm.name ? '#00a884' : 'rgba(255,255,255,0.08)',
                                                border: 'none', color: newPersonForm.name ? '#ffffff' : 'rgba(255,255,255,0.3)',
                                                fontSize: '13px', fontWeight: 900,
                                                cursor: newPersonForm.name ? 'pointer' : 'not-allowed',
                                                marginTop: '2px'
                                            }}
                                        >
                                            Save &amp; Enroll Person
                                        </button>
                                    </div>
                                )}

                                {/* ── SYSTEM TAB ────────────────────────── */}
                                {adminTab === 'system' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {/* Telemetry card */}
                                        <div style={{
                                            background: 'rgba(255,255,255,0.04)', borderRadius: '14px',
                                            padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px'
                                        }}>
                                            <div style={{ fontSize: '11px', fontWeight: 800, color: '#00e5b3', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                                Terminal Telemetry
                                            </div>
                                            {[
                                                { label: 'Terminal Node', value: TERMINAL_ID, color: '#ffffff' },
                                                { label: 'Cloud Sync', value: isOnline ? 'Online ●' : 'Offline ●', color: isOnline ? '#00e5b3' : '#f59e0b' },
                                                { label: 'Queued Offline Events', value: `${offlineQueue.length} records`, color: offlineQueue.length > 0 ? '#f59e0b' : '#00e5b3' },
                                                { label: 'Total Roster', value: `${allRosterPeople.length} people`, color: '#ffffff' },
                                                { label: 'Fleet Size', value: `${vehicles.length} vehicles`, color: '#ffffff' },
                                            ].map(row => (
                                                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px' }}>
                                                    <span style={{ color: 'rgba(255,255,255,0.55)' }}>{row.label}</span>
                                                    <span style={{ fontWeight: 800, color: row.color }}>{row.value}</span>
                                                </div>
                                            ))}
                                        </div>

                                        <button type="button" onClick={syncOfflineQueue}
                                            disabled={offlineQueue.length === 0}
                                            style={{
                                                padding: '11px', borderRadius: '12px',
                                                background: offlineQueue.length > 0 ? '#00a884' : 'rgba(255,255,255,0.06)',
                                                border: 'none', color: '#ffffff', fontSize: '12px',
                                                fontWeight: 800, cursor: offlineQueue.length > 0 ? 'pointer' : 'default',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                                            }}
                                        >
                                            <RefreshCw size={14} />
                                            Force Sync Offline Events
                                        </button>

                                        <button type="button" onClick={fetchRoster}
                                            style={{
                                                padding: '11px', borderRadius: '12px',
                                                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                                                color: '#ffffff', fontSize: '12px', fontWeight: 800, cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                                            }}
                                        >
                                            <RefreshCw size={14} />
                                            Refresh Roster from Server
                                        </button>

                                        {/* Admin panel exit (calls native exit) */}
                                        {true && (
                                            <button type="button"
                                                onClick={() => { setShowAdminPanel(false); exitApp(onExit); }}
                                                style={{
                                                    padding: '13px', borderRadius: '12px',
                                                    background: 'rgba(239,68,68,0.15)',
                                                    border: '1.5px solid rgba(239,68,68,0.45)',
                                                    color: '#ef4444', fontSize: '13px', fontWeight: 900, cursor: 'pointer',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    gap: '8px', marginTop: '4px'
                                                }}
                                            >
                                                <ArrowLeft size={16} />
                                                <span>{t.exitTerminal}</span>
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ════════════════════════════════════════════════════════════
                EXIT CONFIRMATION MODAL
            ════════════════════════════════════════════════════════════ */}
            <AnimatePresence>
                {showExitConfirm && (
                    <motion.div
                        key="exit-confirm"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            position: 'fixed', inset: 0, zIndex: 99999,
                            background: 'rgba(0,0,0,0.88)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: '24px'
                        }}
                    >
                        <motion.div
                            initial={{ scale: 0.85, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.85, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                            style={{
                                background: 'linear-gradient(135deg, #0a1a14 0%, #071210 100%)',
                                border: '1.5px solid rgba(239,68,68,0.4)',
                                borderRadius: '20px', padding: '32px 28px',
                                maxWidth: '340px', width: '100%', textAlign: 'center'
                            }}
                        >
                            <div style={{
                                width: '56px', height: '56px', borderRadius: '50%',
                                background: 'rgba(239,68,68,0.15)',
                                border: '2px solid rgba(239,68,68,0.5)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 16px'
                            }}>
                                <X size={24} color="#ef4444" />
                            </div>
                            <div style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff', marginBottom: '8px' }}>
                                {lang === 'hi' ? 'ऐप बंद करें?' : 'Exit App?'}
                            </div>
                            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginBottom: '28px', lineHeight: 1.5 }}>
                                {lang === 'hi'
                                    ? 'क्या आप VGTC टर्मिनल से बाहर निकलना चाहते हैं?'
                                    : 'Are you sure you want to close the VGTC Terminal app?'}
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowExitConfirm(false)}
                                    style={{
                                        flex: 1, padding: '12px',
                                        borderRadius: '12px',
                                        background: 'rgba(255,255,255,0.08)',
                                        border: '1px solid rgba(255,255,255,0.15)',
                                        color: '#ffffff', fontSize: '14px', fontWeight: 700, cursor: 'pointer'
                                    }}
                                >
                                    {lang === 'hi' ? 'रहें' : 'Stay'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setShowExitConfirm(false); exitApp(onExit); }}
                                    style={{
                                        flex: 1, padding: '12px',
                                        borderRadius: '12px',
                                        background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                                        border: 'none',
                                        color: '#ffffff', fontSize: '14px', fontWeight: 800, cursor: 'pointer'
                                    }}
                                >
                                    {lang === 'hi' ? 'बाहर निकलें' : 'Exit'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ════════════════════════════════════════════════════════════
                9. FACE ENROLL MODAL
            ════════════════════════════════════════════════════════════ */}
            <AnimatePresence>
                {enrollingPerson && (
                    <motion.div
                        key="enroll_modal"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.94)',
                            backdropFilter: 'blur(16px)', zIndex: 9999999,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
                        }}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            style={{
                                width: '100%', maxWidth: '360px', background: '#0d1f18',
                                borderRadius: '24px', border: '1.5px solid #00e5b3',
                                padding: '18px', display: 'flex', flexDirection: 'column',
                                alignItems: 'center', gap: '12px',
                                boxShadow: '0 20px 60px rgba(0,0,0,0.9)'
                            }}
                        >
                            {/* Header */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                <div>
                                    <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#ffffff' }}>
                                        Enroll Face: {enrollingPerson.name}
                                    </h4>
                                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', marginTop: '2px' }}>
                                        Position face in frame then capture
                                    </div>
                                </div>
                                <button type="button"
                                    onClick={() => { setEnrollingPerson(null); setEnrollSnapshot(null); }}
                                    style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', padding: '4px' }}
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Preview box */}
                            <div style={{
                                width: '210px', height: '230px', borderRadius: '18px',
                                overflow: 'hidden', background: '#000',
                                border: `2px solid ${enrollSnapshot ? '#10b981' : '#00e5b3'}`,
                                position: 'relative', flexShrink: 0
                            }}>
                                {enrollSnapshot ? (
                                    <img src={enrollSnapshot} alt="Snapshot"
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                ) : (
                                    <div style={{
                                        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
                                        alignItems: 'center', justifyContent: 'center',
                                        color: 'rgba(255,255,255,0.35)', gap: '8px'
                                    }}>
                                        <Camera size={28} color="rgba(0,229,179,0.4)" />
                                        <span style={{ fontSize: '12px' }}>Live Webcam Ready</span>
                                    </div>
                                )}
                                {enrollSnapshot && (
                                    <div style={{
                                        position: 'absolute', top: '8px', right: '8px',
                                        background: '#10b981', borderRadius: '50%', width: '24px', height: '24px',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        <Check size={14} color="#fff" strokeWidth={3} />
                                    </div>
                                )}
                            </div>

                            {/* Buttons */}
                            <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                                <button type="button" onClick={handleCaptureFaceSnapshot}
                                    style={{
                                        flex: 1, padding: '11px', borderRadius: '12px',
                                        background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)',
                                        color: '#ffffff', fontSize: '12.5px', fontWeight: 800, cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                                    }}
                                >
                                    <Camera size={15} />
                                    <span>{enrollSnapshot ? 'Retake Photo' : 'Take Photo'}</span>
                                </button>
                                <button type="button"
                                    disabled={!enrollSnapshot || savingEnrollment}
                                    onClick={() => handleSaveEnrollment(enrollingPerson)}
                                    style={{
                                        flex: 1, padding: '11px', borderRadius: '12px',
                                        background: enrollSnapshot && !savingEnrollment ? '#00a884' : 'rgba(255,255,255,0.05)',
                                        border: 'none',
                                        color: enrollSnapshot && !savingEnrollment ? '#ffffff' : 'rgba(255,255,255,0.25)',
                                        fontSize: '12.5px', fontWeight: 900,
                                        cursor: enrollSnapshot && !savingEnrollment ? 'pointer' : 'not-allowed'
                                    }}
                                >
                                    {savingEnrollment ? 'Saving…' : 'Save Face'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
