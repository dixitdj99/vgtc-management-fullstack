import React from 'react';

export default function TruckLoader({ text, subText }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
      <div style={{ width: 240, height: 90, position: 'relative', overflow: 'hidden' }}>
        <style>{`
          @keyframes tl-drive { 0%{transform:translateX(-110px)} 100%{transform:translateX(260px)} }
          @keyframes tl-whl { 0%{transform:rotate(0)} 100%{transform:rotate(360deg)} }
          @keyframes tl-road { 0%{stroke-dashoffset:0} 100%{stroke-dashoffset:-32} }
          @keyframes tl-bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-1.2px)} }
          @keyframes tl-puff {
            0%{opacity:0.5; transform:translate(0,0) scale(0.6)}
            100%{opacity:0; transform:translate(-14px,-10px) scale(1.5)}
          }
          @keyframes tl-speedline {
            0%{opacity:0; transform:translateX(0)}
            30%{opacity:0.7}
            100%{opacity:0; transform:translateX(-26px)}
          }
        `}</style>
        <svg viewBox="0 0 240 90" width="240" height="90">
          <defs>
            <linearGradient id="tl-trailer" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#6366F1" />
              <stop offset="1" stopColor="#8B5CF6" />
            </linearGradient>
            <linearGradient id="tl-cab" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#312E81" />
              <stop offset="1" stopColor="#1E1B33" />
            </linearGradient>
          </defs>

          {/* Road */}
          <line x1="0" y1="76" x2="240" y2="76" stroke="var(--border, #cbd5e1)" strokeWidth="2" strokeDasharray="12 8" style={{ animation: 'tl-road 0.45s linear infinite' }} />
          <line x1="0" y1="81" x2="240" y2="81" stroke="var(--border, #e2e8f0)" strokeWidth="0.5" opacity="0.6" />

          <g style={{ animation: 'tl-drive 2.6s cubic-bezier(0.45, 0, 0.55, 1) infinite' }}>
            {/* Speed lines behind trailer */}
            <rect x="-14" y="36" width="12" height="2.5" rx="1.25" fill="var(--primary, #6366F1)" style={{ animation: 'tl-speedline 0.7s linear infinite' }} />
            <rect x="-10" y="46" width="9" height="2.5" rx="1.25" fill="var(--primary, #6366F1)" style={{ animation: 'tl-speedline 0.7s linear 0.25s infinite' }} />
            <rect x="-14" y="56" width="12" height="2.5" rx="1.25" fill="var(--primary, #6366F1)" style={{ animation: 'tl-speedline 0.7s linear 0.5s infinite' }} />

            {/* Body bounces slightly while wheels stay planted */}
            <g style={{ animation: 'tl-bounce 0.5s ease-in-out infinite' }}>
              {/* Trailer */}
              <rect x="2" y="30" width="74" height="38" rx="6" fill="url(#tl-trailer)" />
              <rect x="2" y="30" width="74" height="12" rx="6" fill="#fff" opacity="0.12" />
              <text x="39" y="54" textAnchor="middle" fill="#fff" fontSize="13" fontWeight="900" fontFamily="Inter, Arial, sans-serif" letterSpacing="1">VGTC</text>

              {/* Cabin */}
              <path d="M78,36 L78,68 L110,68 L110,46 L97,30 L78,30 Z" fill="url(#tl-cab)" />
              <path d="M90,36 L90,46 L106,46 L106,45 L99,36 Z" fill="#A5B4FC" opacity="0.85" />
              <rect x="80" y="42" width="8" height="8" rx="1.5" fill="#A5B4FC" opacity="0.45" />

              {/* Headlight + beam */}
              <rect x="108" y="56" width="4" height="6" rx="1.5" fill="#FBBF24" />
              <path d="M112,56 L126,52 L126,66 L112,62 Z" fill="#FBBF24" opacity="0.15" />

              {/* Exhaust puffs */}
              <circle cx="76" cy="26" r="3" fill="var(--text-muted, #94a3b8)" style={{ animation: 'tl-puff 1.1s ease-out infinite' }} />
              <circle cx="76" cy="26" r="2.4" fill="var(--text-muted, #94a3b8)" style={{ animation: 'tl-puff 1.1s ease-out 0.55s infinite' }} />
            </g>

            {/* Wheels */}
            {[24, 54, 98].map(cx => (
              <g key={cx} transform={`translate(${cx},70)`}>
                <circle r="7" fill="#1E1B33" />
                <circle r="4" fill="#475569" />
                <g style={{ animation: 'tl-whl 0.35s linear infinite', transformOrigin: 'center' }}>
                  <line x1="-3.5" y1="0" x2="3.5" y2="0" stroke="#CBD5E1" strokeWidth="1.2" />
                  <line x1="0" y1="-3.5" x2="0" y2="3.5" stroke="#CBD5E1" strokeWidth="1.2" />
                </g>
                <circle r="1.4" fill="#E2E8F0" />
              </g>
            ))}
          </g>
        </svg>
      </div>

      {text && (
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text)', textAlign: 'center' }}>
          {text}
        </div>
      )}
      {subText && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 320, lineHeight: 1.4 }}>
          {subText}
        </div>
      )}
    </div>
  );
}
