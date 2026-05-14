import React from 'react';

export default function TruckLoader({ text, subText }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
      <div style={{ width: 220, height: 80, position: 'relative', overflow: 'hidden' }}>
        <style>{`
          @keyframes drive { 0%{transform:translateX(-100px)} 100%{transform:translateX(240px)} }
          @keyframes whl { 0%{transform:rotate(0)} 100%{transform:rotate(360deg)} }
          @keyframes road-move { 0%{stroke-dashoffset:0} 100%{stroke-dashoffset:-30} }
        `}</style>
        <svg viewBox="0 0 220 80" width="220" height="80">
          {/* Road */}
          <line x1="0" y1="68" x2="220" y2="68" stroke="#bbb" strokeWidth="1.5" strokeDasharray="10 6" style={{ animation: 'road-move 0.5s linear infinite' }} />
          <line x1="0" y1="72" x2="220" y2="72" stroke="#ddd" strokeWidth="0.5" />

          <g style={{ animation: 'drive 2.2s ease-in-out infinite' }}>
            {/* Trailer */}
            <rect x="0" y="28" width="70" height="34" rx="3" fill="#0A6ED1" />
            <text x="35" y="50" textAnchor="middle" fill="#fff" fontSize="12" fontWeight="900" fontFamily="Arial">VGTC</text>

            {/* Cabin */}
            <path d="M70,34 L70,62 L100,62 L100,42 L88,28 L70,28 Z" fill="#1e293b" />
            <rect x="82" y="34" width="14" height="12" rx="2" fill="#87CEEB" opacity="0.8" />
            <rect x="72" y="40" width="8" height="8" rx="1" fill="#87CEEB" opacity="0.5" />

            {/* Headlight */}
            <rect x="98" y="52" width="4" height="5" rx="1" fill="#fbbf24" />

            {/* Wheels */}
            <g transform="translate(22,64)">
              <circle r="6" fill="#333" />
              <circle r="3.5" fill="#666" />
              <line x1="-3" y1="0" x2="3" y2="0" stroke="#999" strokeWidth="1" style={{ animation: 'whl 0.3s linear infinite', transformOrigin: 'center' }} />
            </g>
            <g transform="translate(50,64)">
              <circle r="6" fill="#333" />
              <circle r="3.5" fill="#666" />
              <line x1="-3" y1="0" x2="3" y2="0" stroke="#999" strokeWidth="1" style={{ animation: 'whl 0.3s linear infinite', transformOrigin: 'center' }} />
            </g>
            <g transform="translate(90,64)">
              <circle r="6" fill="#333" />
              <circle r="3.5" fill="#666" />
              <line x1="-3" y1="0" x2="3" y2="0" stroke="#999" strokeWidth="1" style={{ animation: 'whl 0.3s linear infinite', transformOrigin: 'center' }} />
            </g>
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
