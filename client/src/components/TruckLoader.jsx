import React from 'react';

export default function TruckLoader({ text, subText, size = 120 }) {
  const w = size;
  const h = size * 0.6;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <svg viewBox="0 0 200 100" width={w} height={h} style={{ overflow: 'visible' }}>
        <style>{`
          @keyframes truck-move { 0%{transform:translateX(-8px)} 50%{transform:translateX(8px)} 100%{transform:translateX(-8px)} }
          @keyframes wheel-spin { 0%{transform:rotate(0)} 100%{transform:rotate(360deg)} }
          @keyframes road-dash { 0%{stroke-dashoffset:0} 100%{stroke-dashoffset:-24} }
          @keyframes smoke { 0%{opacity:0.6;r:2;cy:32} 50%{opacity:0.3;r:4;cy:24} 100%{opacity:0;r:6;cy:16} }
          .truck-body{animation:truck-move 1.2s ease-in-out infinite}
          .whl{animation:wheel-spin 0.6s linear infinite;transform-origin:center}
          .road{stroke-dasharray:8 8;animation:road-dash 0.8s linear infinite}
          .smk{animation:smoke 1.5s ease-out infinite}
        `}</style>

        {/* Road */}
        <line x1="0" y1="82" x2="200" y2="82" stroke="var(--border, #ccc)" strokeWidth="2" className="road" />

        <g className="truck-body">
          {/* Trailer */}
          <rect x="20" y="38" width="90" height="38" rx="3" fill="var(--primary, #0A6ED1)" opacity="0.9" />
          <rect x="24" y="42" width="82" height="14" rx="2" fill="white" opacity="0.15" />
          <text x="65" y="67" textAnchor="middle" fill="white" fontSize="11" fontWeight="900" fontFamily="Arial" letterSpacing="2">VGTC</text>

          {/* Cabin */}
          <path d="M110,46 L110,76 L145,76 L145,54 L130,38 L110,38 Z" fill="var(--text, #1e293b)" rx="3" />
          <rect x="125" y="44" width="16" height="14" rx="2" fill="#87CEEB" opacity="0.7" />
          <rect x="112" y="50" width="10" height="10" rx="1" fill="#87CEEB" opacity="0.5" />

          {/* Exhaust smoke */}
          <circle cx="22" cy="32" r="2" fill="var(--text-muted, #94a3b8)" className="smk" />
          <circle cx="18" cy="30" r="2" fill="var(--text-muted, #94a3b8)" className="smk" style={{ animationDelay: '0.5s' }} />
          <circle cx="26" cy="28" r="2" fill="var(--text-muted, #94a3b8)" className="smk" style={{ animationDelay: '1s' }} />

          {/* Wheels */}
          <g transform="translate(48,76)">
            <circle r="8" fill="#333" />
            <circle r="5" fill="#555" className="whl" />
            <circle r="2" fill="#888" />
            <line x1="-4" y1="0" x2="4" y2="0" stroke="#999" strokeWidth="1" className="whl" />
            <line x1="0" y1="-4" x2="0" y2="4" stroke="#999" strokeWidth="1" className="whl" />
          </g>
          <g transform="translate(75,76)">
            <circle r="8" fill="#333" />
            <circle r="5" fill="#555" className="whl" />
            <circle r="2" fill="#888" />
            <line x1="-4" y1="0" x2="4" y2="0" stroke="#999" strokeWidth="1" className="whl" />
            <line x1="0" y1="-4" x2="0" y2="4" stroke="#999" strokeWidth="1" className="whl" />
          </g>
          <g transform="translate(132,76)">
            <circle r="8" fill="#333" />
            <circle r="5" fill="#555" className="whl" />
            <circle r="2" fill="#888" />
            <line x1="-4" y1="0" x2="4" y2="0" stroke="#999" strokeWidth="1" className="whl" />
            <line x1="0" y1="-4" x2="0" y2="4" stroke="#999" strokeWidth="1" className="whl" />
          </g>

          {/* Headlight */}
          <rect x="143" y="62" width="4" height="6" rx="1" fill="#fbbf24" />
        </g>
      </svg>

      {text && (
        <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.05em', color: 'var(--text)', textAlign: 'center' }}>
          {text}
        </div>
      )}
      {subText && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 300 }}>
          {subText}
        </div>
      )}
    </div>
  );
}
