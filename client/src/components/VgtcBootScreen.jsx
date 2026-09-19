import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Users, CheckCircle2, Wifi } from 'lucide-react';

const playBootChime = () => {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(392, now);
        osc.frequency.exponentialRampToValueAtTime(523.25, now + 0.25);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.6);
    } catch (_) {}
};

export default function VgtcBootScreen({ onBootComplete, terminalId = 'OFFICE-REWARI-01' }) {
    const [progress, setProgress] = useState(0);
    const [activeCheck, setActiveCheck] = useState(0);

    const checks = [
        { text: 'Connecting camera', icon: Camera },
        { text: 'Loading staff roster', icon: Users },
        { text: 'Checking network', icon: Wifi },
        { text: 'Ready', icon: CheckCircle2 }
    ];

    useEffect(() => {
        playBootChime();
        const interval = setInterval(() => {
            setProgress(prev => {
                if (prev >= 100) {
                    clearInterval(interval);
                    return 100;
                }
                return Math.min(prev + Math.floor(Math.random() * 8) + 4, 100);
            });
        }, 75);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const step = Math.min(Math.floor((progress / 100) * checks.length), checks.length - 1);
        setActiveCheck(step);
        if (progress >= 100) {
            const t = setTimeout(() => onBootComplete?.(), 500);
            return () => clearTimeout(t);
        }
    }, [progress, checks.length, onBootComplete]);

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: '#e7f2ee',
            color: '#1c2f29',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            userSelect: 'none',
            overflow: 'hidden',
            padding: 20
        }}>
            <div style={{ position: 'relative', textAlign: 'center', zIndex: 10, width: '100%', maxWidth: 400 }}>
                <div style={{
                    width: 96,
                    height: 96,
                    margin: '0 auto 20px',
                    background: '#ffffff',
                    borderRadius: 20,
                    border: '1px solid rgba(15, 80, 64, 0.08)',
                    boxShadow: '0 12px 32px rgba(28, 47, 41, 0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <img
                        src="/vgtc-mark.png"
                        alt="VGTC"
                        style={{ width: 56, height: 56, objectFit: 'contain' }}
                        onError={(e) => { e.currentTarget.src = '/vgtc-logo.png'; }}
                    />
                </div>

                <h1 style={{
                    fontSize: 22,
                    fontWeight: 600,
                    margin: '0 0 6px 0',
                    color: '#1c2f29'
                }}>
                    Vikas Goods Transport Co.
                </h1>
                <p style={{ fontSize: 13, color: '#6b8179', fontWeight: 500, margin: 0 }}>
                    Attendance terminal
                </p>

                <div style={{ marginTop: 28, width: '100%' }}>
                    <div style={{
                        height: 3,
                        width: '100%',
                        background: 'rgba(18, 163, 122, 0.15)',
                        borderRadius: 4,
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            height: '100%',
                            width: `${progress}%`,
                            background: '#0f9d7a',
                            transition: 'width 0.1s ease-out'
                        }} />
                    </div>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginTop: 10,
                        fontSize: 12,
                        color: '#6b8179'
                    }}>
                        <span>Starting</span>
                        <span style={{ color: '#0f9d7a', fontWeight: 600 }}>{progress}%</span>
                    </div>
                    <div style={{
                        marginTop: 12,
                        height: 24,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 13,
                        color: '#6b8179'
                    }}>
                        {(() => {
                            const current = checks[activeCheck] || checks[0];
                            const Icon = current.icon;
                            return (
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={activeCheck}
                                        initial={{ opacity: 0, y: 4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.15 }}
                                        style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                                    >
                                        <Icon size={14} color="#0f9d7a" />
                                        <span>{current.text}</span>
                                    </motion.div>
                                </AnimatePresence>
                            );
                        })()}
                    </div>
                </div>

                <div style={{ marginTop: 32, fontSize: 11, color: '#6b8179' }}>
                    {terminalId}
                </div>
            </div>
        </div>
    );
}
