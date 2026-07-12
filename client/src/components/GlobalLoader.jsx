import React, { useState, useEffect } from 'react';

export default function GlobalLoader() {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handle = (e) => setLoading(e.detail?.loading || false);
    window.addEventListener('api-loading', handle);
    return () => window.removeEventListener('api-loading', handle);
  }, []);

  if (!loading) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, height: 3, zIndex: 99998,
      background: 'var(--border, #e2e8f0)', overflow: 'hidden'
    }}>
      <style>{`
        @keyframes gl-slide { 0%{transform:translateX(-100%)} 100%{transform:translateX(200%)} }
        @keyframes gl-truck { 0%{left:-40px} 100%{left:calc(100% + 40px)} }
      `}</style>
      {/* Progress bar */}
      <div style={{
        height: '100%', width: '40%',
        background: 'linear-gradient(90deg, var(--primary, #6366F1), var(--primary-2, #8B5CF6))',
        boxShadow: '0 0 8px var(--primary-glow, rgba(99,102,241,0.4))',
        animation: 'gl-slide 1s ease-in-out infinite',
        borderRadius: 2
      }} />
      {/* Mini truck icon running along the bar */}
      <div style={{
        position: 'absolute', top: -8, animation: 'gl-truck 1.8s linear infinite'
      }}>
        <svg width="28" height="16" viewBox="0 0 28 16">
          <rect x="0" y="2" width="14" height="10" rx="2" fill="var(--primary, #6366F1)" />
          <path d="M14,4 L14,12 L22,12 L22,7 L19,2 L14,2 Z" fill="var(--primary-2, #8B5CF6)" />
          <circle cx="6" cy="13" r="2" fill="#1E1B33" />
          <circle cx="12" cy="13" r="2" fill="#1E1B33" />
          <circle cx="20" cy="13" r="2" fill="#1E1B33" />
        </svg>
      </div>
    </div>
  );
}
