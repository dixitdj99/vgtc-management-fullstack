import React from 'react';
import './TruckAnimation.css';

const Wheel = ({ cx, cy }) => (
  // Symmetrical vector structure rotates flawlessly around its center
  <g>
    <circle cx={cx} cy={cy} r="6.5" fill="#1f2937" stroke="#111827" strokeWidth="2.5" />
    <circle className="ta-wheel" cx={cx} cy={cy} r="3" fill="none" stroke="#64748b" strokeWidth="2" strokeDasharray="1.5 1.64" />
    <circle cx={cx} cy={cy} r="1.5" fill="#111827" />
  </g>
);

const TruckIcon = () => (
  <svg width="240" height="50" viewBox="0 0 240 50" style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.3))' }}>
    {/* ==== TRAILER ==== */}
    {/* Trailer Chassis */}
    <rect x="0" y="38" width="145" height="3" fill="#4B5563" stroke="#111827" strokeWidth="2" />

    {/* Trailer Underride Guard */}
    <rect x="65" y="42" width="40" height="2" fill="#9ca3af" stroke="#111827" strokeWidth="1.5" />
    <rect x="70" y="41" width="2" height="4" fill="#475569" stroke="#111827" strokeWidth="1" />
    <rect x="100" y="41" width="2" height="4" fill="#475569" stroke="#111827" strokeWidth="1" />

    {/* Open Trailer Flatbed */}
    <rect x="0" y="33" width="145" height="5" fill="#cbd5e1" stroke="#111827" strokeWidth="2" strokeLinejoin="round" />
    <rect x="141" y="6" width="4" height="32" fill="#cbd5e1" stroke="#111827" strokeWidth="2" strokeLinejoin="round" />
    <rect x="0" y="24" width="3" height="11" fill="#cbd5e1" stroke="#111827" strokeWidth="2" strokeLinejoin="round" />
    <rect x="3" y="28" width="138" height="6" fill="#f8fafc" stroke="#111827" strokeWidth="2" strokeLinejoin="round" />

    {/* ==== TRACTOR CAB (Smaller Cab & Hood, same wheelbase) ==== */}
    <g stroke="#111827" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round">
      
      {/* Visible Hitch & Joint Gap */}
      <line x1="125" y1="38" x2="148" y2="38" stroke="#475569" strokeWidth="4" />
      <circle cx="148" cy="38" r="4" fill="#f97316" strokeWidth="1.5" /> {/* Highlighted joint pivot */}
      <line x1="148" y1="38" x2="165" y2="38" stroke="#1f2937" strokeWidth="4" /> {/* Frame connecting to cab */}

      {/* Rear Wheel Mudguard (Wheel is at cx=150) */}
      <path d="M 139 43 C 139 32, 161 32, 161 43" fill="none" stroke="#64748b" strokeWidth="2.5" />

      {/* Exhaust Pipes (Behind the cab at x=165) */}
      <rect x="165" y="5" width="4" height="20" fill="#e2e8f0" strokeWidth="1.5" />
      <path d="M 165 5 L 169 5 L 171 2 L 163 2 Z" fill="#94a3b8" strokeWidth="1.5" />

      {/* Main Cab body (Starts at 165) */}
      <path d="
        M 165 16
        L 186 16
        C 192 16, 196 18, 198 22
        L 198 43
        L 165 43
        Z
      " fill="#ef4444" />
      
      {/* Air Deflector (Lower peak) */}
      <path d="M 165 16 C 165 8, 180 5, 186 16 Z" fill="#ef4444" />
      
      {/* Side Door Window */}
      <path d="M 178 18 L 192 18 C 194 18, 196 20, 196 24 L 178 24 Z" fill="#f1f5f9" />
      
      {/* Hood (Nose) Lowered */}
      <path d="
        M 198 27
        L 230 28
        C 233 28, 235 30, 235 32
        L 235 43
        L 198 43
        Z
      " fill="#ef4444" />

      {/* Grille (Slightly shorter) */}
      <path d="M 231 29 L 235 29 L 235 40 L 231 40 Z" fill="#e2e8f0" />
      <line x1="231" y1="32" x2="235" y2="32" strokeWidth="1" />
      <line x1="231" y1="35" x2="235" y2="35" strokeWidth="1" />
      <line x1="231" y1="38" x2="235" y2="38" strokeWidth="1" />

      {/* Headlight */}
      <rect x="227" y="35" width="4" height="3" rx="1" fill="#fef08a" strokeWidth="1.5" />

      {/* Front Bumper */}
      <rect x="225" y="40" width="12" height="5" rx="2" fill="#94a3b8" strokeWidth="1.5" />

      {/* Front Wheel Well (cx=220) */}
      <path d="M 210 44 C 210 33, 230 33, 230 44 Z" fill="#1f2937" strokeWidth="1.5" />

      {/* Fuel Tank (Under cab, before front wheel) */}
      <rect x="175" y="38" width="25" height="6" rx="3" fill="#cbd5e1" strokeWidth="1.5" />

      {/* Door handle */}
      <rect x="182" y="30" width="5" height="1.5" fill="#111827" strokeWidth="0" />

      {/* Details/Trim */}
      <path d="M 165 31 L 198 31 L 230 32" fill="none" stroke="#fcd34d" strokeWidth="2" />
      <path d="M 165 34 L 198 34 L 230 35" fill="none" stroke="#f97316" strokeWidth="1.5" />

      {/* Side Mirror */}
      <rect x="194" y="18" width="3" height="7" rx="1" fill="#111827" strokeLinejoin="miter" strokeWidth="0" />
      <line x1="190" y1="20" x2="194" y2="20" strokeWidth="1.5" />
      <line x1="190" y1="24" x2="194" y2="24" strokeWidth="1.5" />
    </g>

    {/* ==== WHEELS ==== */}
    {/* Tractor Drive axle */}
    <Wheel cx="150" cy="43.5" />
    {/* Tractor Steer axle */}
    <Wheel cx="220" cy="43.5" />

    {/* Trailer Wheels */}
    <Wheel cx="15" cy="43.5" />
    <Wheel cx="35" cy="43.5" />
    <Wheel cx="55" cy="43.5" />
  </svg>
);

const LaborIcon = ({ flip }) => (
  <svg width="20" height="30" viewBox="0 0 24 36" style={{ transform: flip ? 'scaleX(-1)' : 'none', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))' }}>
    <circle cx="12" cy="7" r="5" fill="#f8cda5" />
    <path d="M12 2C8 2 5 4.5 5 7H19C19 4.5 16 2 12 2Z" fill="#f59e0b" stroke="#111827" strokeWidth="1.5" />
    <circle cx="12" cy="1.5" r="2.5" fill="#d97706" />
    <rect x="7" y="13" width="10" height="12" rx="3" fill="#eab308" stroke="#111827" strokeWidth="1.5" />
    <rect x="8" y="14" width="8" height="10" fill="#f59e0b" />
    <rect x="7" y="16" width="10" height="2" fill="#fefce8" />
    <rect x="7" y="21" width="10" height="2" fill="#fefce8" />
    <rect x="8" y="25" width="3" height="11" rx="1" fill="#1e293b" />
    <rect x="13" y="25" width="3" height="11" rx="1" fill="#1e293b" />
    <path d="M7 15L3 19" stroke="#f8cda5" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M17 15L21 21" stroke="#f8cda5" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

const BagIcon = () => (
  <svg width="22" height="12" viewBox="0 0 22 12" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))' }}>
    {/* Thick 2px stroke on the bag to match the truck's bold chunky look */}
    <rect x="1" y="1" width="20" height="10" rx="3" fill="#fcd34d" stroke="#111827" strokeWidth="2" />
    <path d="M 5 3 L 17 3 M 7 6 L 15 6 M 5 9 L 17 9" stroke="#b45309" strokeWidth="1" strokeDasharray="2,1" />
    <circle cx="11" cy="6" r="2.5" fill="#ef4444" />
  </svg>
);

/* Scenery */
const PineTreeIcon = () => (
  <svg width="24" height="36" viewBox="0 0 24 40" style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))' }}>
    <path d="M12 0L24 24H0L12 0Z" fill="currentColor" />
    <path d="M12 10L20 28H4L12 10Z" fill="currentColor" />
    <rect x="10" y="28" width="4" height="12" fill="currentColor" />
  </svg>
);

const FactoryIcon = () => (
  <svg width="60" height="40" viewBox="0 0 60 40" style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))' }}>
    <path d="M0 40V20L20 30V20L40 30V20L60 30V40H0Z" fill="currentColor" />
    <rect x="45" y="5" width="6" height="18" fill="currentColor" />
    <circle cx="48" cy="0" r="4" fill="currentColor" />
    <circle cx="51" cy="-6" r="5" fill="currentColor" />
    <circle cx="56" cy="-10" r="6" fill="currentColor" />
    <rect x="5" y="30" width="8" height="10" fill="var(--bg)" />
  </svg>
);

const CloudIcon = () => (
  <svg width="40" height="20" viewBox="0 0 30 15">
    <path d="M10 15 a5 5 0 0 1 -5 -5 a5 5 0 0 1 10 0 a7 7 0 0 1 14 0 a5 5 0 0 1 -5 5 Z" fill="currentColor" />
  </svg>
);

export default function TruckAnimation() {
  return (
    <div className="ta-container">
      {/* 3D Road Surface */}
      <div className="ta-road-3d">
        <div className="ta-road-stripes"></div>
      </div>

      {/* Background Scenery */}
      <div className="ta-scenery ta-cloud" style={{ left: '15%', top: '2px', opacity: 0.1 }}><CloudIcon /></div>
      <div className="ta-scenery ta-cloud" style={{ left: '55%', top: '8px', opacity: 0.08 }}><CloudIcon /></div>
      <div className="ta-scenery ta-cloud" style={{ right: '10%', top: '4px', opacity: 0.12 }}><CloudIcon /></div>

      <div className="ta-scenery" style={{ left: '15%', bottom: '15px', color: 'var(--text-muted)', opacity: 0.25 }}><PineTreeIcon /></div>
      <div className="ta-scenery" style={{ left: '35%', bottom: '15px', color: 'var(--text-muted)', opacity: 0.2 }}><FactoryIcon /></div>
      <div className="ta-scenery" style={{ right: '35%', bottom: '15px', color: 'var(--text-muted)', opacity: 0.25 }}><PineTreeIcon /></div>
      <div className="ta-scenery" style={{ right: '25%', bottom: '15px', color: 'var(--text-muted)', opacity: 0.2, transform: 'scale(0.8)' }}><PineTreeIcon /></div>
      <div className="ta-scenery" style={{ right: '15%', bottom: '15px', color: 'var(--text-muted)', opacity: 0.2 }}><FactoryIcon /></div>

      {/* Labor 1 (Loading Side - left) */}
      <div className="ta-labor-load">
        <LaborIcon />
        <div className="ta-box-load"><BagIcon /></div>
      </div>

      {/* Truck and Trailer */}
      <div className="ta-truck">
        {/* The Truck Background/Chassis */}
        <TruckIcon />

        {/* Stacked Bags inside the Open Trailer */}
        <div className="ta-bag-stack">
          {/* Shifted locations inwards because the trailer is 145px wide. Left positions match spacing correctly. */}
          <div className="ta-stacked-bag ta-stacked-bag-1" style={{ left: '110px', bottom: '12px' }}><BagIcon /></div>
          <div className="ta-stacked-bag ta-stacked-bag-2" style={{ left: '86px', bottom: '12px' }}><BagIcon /></div>
          <div className="ta-stacked-bag ta-stacked-bag-3" style={{ left: '62px', bottom: '12px' }}><BagIcon /></div>
          <div className="ta-stacked-bag ta-stacked-bag-4" style={{ left: '38px', bottom: '12px' }}><BagIcon /></div>
          <div className="ta-stacked-bag ta-stacked-bag-5" style={{ left: '14px', bottom: '12px' }}><BagIcon /></div>

          {/* Bag 6 stacked on top of Bag 1 */}
          <div className="ta-stacked-bag ta-stacked-bag-6" style={{ left: '110px', bottom: '24px' }}><BagIcon /></div>
        </div>
      </div>

      {/* Labor 2 (Unloading Side - right) */}
      <div className="ta-labor-unload">
        <LaborIcon flip />
        <div className="ta-box-unload"><BagIcon /></div>
      </div>
    </div>
  );
}
