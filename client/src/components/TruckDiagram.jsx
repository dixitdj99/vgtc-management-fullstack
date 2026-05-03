import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCw, ZoomIn, ZoomOut, Move, Maximize2, Info, Search } from 'lucide-react';

const VIEWS = [
  { id: 'side', label: 'Side Profile (Full Body)', img: '/assets/truck/side.png' },
  { id: 'front', label: 'Front Profile (Cabin/Engine)', img: '/assets/truck/front.png' },
  { id: 'rear', label: 'Rear Profile (Tail/Cargo)', img: '/assets/truck/rear.png' },
  { id: 'undercarriage', label: 'Undercarriage (Mechanical)', img: '/assets/truck/undercarriage.png' },
];

// MAPPING EVERY PART TO ITS VIEW
const PART_POSITIONS = {
  side: {
    engine_oil:      { x: 15, y: 55, label: 'Engine Oil', brand: 'Castrol/Shell' },
    oil_filter:      { x: 16, y: 58, label: 'Oil Filter', brand: 'Fleetguard' },
    air_filter:      { x: 18, y: 45, label: 'Air Filter', brand: 'Donaldson' },
    fuel_filter:     { x: 20, y: 62, label: 'Fuel Filter', brand: 'Fleetguard' },
    turbo:           { x: 22, y: 52, label: 'Turbocharger', brand: 'Holset' },
    water_pump:      { x: 14, y: 58, label: 'Water Pump', brand: 'Tata' },
    alternator:      { x: 15, y: 62, label: 'Alternator', brand: 'Lucas' },
    starter_motor:   { x: 18, y: 65, label: 'Starter Motor', brand: 'Lucas' },
    tarpaulin:       { x: 55, y: 30, label: 'Tarpaulin (Tirpal)', brand: 'Duck' },
    coupling_pin:    { x: 28, y: 65, label: 'King Pin', brand: 'Jost' },
    landing_gear:    { x: 40, y: 75, label: 'Landing Gear', brand: 'York' },
    tyre_fl:         { x: 12, y: 82, label: 'Front Tyre', brand: 'Apollo' },
    tyre_fr:         { x: 14, y: 82, label: 'Front Tyre (R)', brand: 'Apollo' },
    tyre_rl1:        { x: 75, y: 82, label: 'Axle 1 Tyre', brand: 'MRF' },
    tyre_rr1:        { x: 88, y: 82, label: 'Axle 2 Tyre', brand: 'MRF' },
    lifting_axle_air_bag: { x: 62, y: 78, label: 'Lift Axle Bag', brand: 'Firestone' },
    chassis_crack:   { x: 50, y: 70, label: 'Chassis Frame', brand: 'Tata' },
    trailer_body:    { x: 65, y: 45, label: 'Side Body', brand: 'Local' },
    battery:         { x: 25, y: 75, label: 'Battery', brand: 'Exide' },
    toolbox:         { x: 35, y: 72, label: 'Tool Box', brand: 'Tata' },
    fuel_tank:       { x: 22, y: 72, label: 'Fuel Tank', brand: 'Tata' },
  },
  front: {
    headlight_left:  { x: 25, y: 65, label: 'Headlight (L)', brand: 'Lumax' },
    headlight_right: { x: 75, y: 65, label: 'Headlight (R)', brand: 'Lumax' },
    fog_light_left:  { x: 25, y: 75, label: 'Fog Light (L)', brand: 'Lumax' },
    fog_light_right: { x: 75, y: 75, label: 'Fog Light (R)', brand: 'Lumax' },
    windshield:      { x: 50, y: 35, label: 'Windshield', brand: 'Saint-Gobain' },
    side_glass_left: { x: 20, y: 38, label: 'Side Glass (L)', brand: 'Saint-Gobain' },
    mirror_left:     { x: 15, y: 45, label: 'Mirror (L)', brand: 'Tata' },
    mirror_right:    { x: 85, y: 45, label: 'Mirror (R)', brand: 'Tata' },
    radiator:        { x: 50, y: 60, label: 'Radiator', brand: 'Tata' },
    leaf_spring_fl:  { x: 30, y: 85, label: 'Front Leaf (L)', brand: 'Tata' },
    leaf_spring_fr:  { x: 70, y: 85, label: 'Front Leaf (R)', brand: 'Tata' },
    wiper_left:      { x: 40, y: 45, label: 'Wiper (L)', brand: 'Bosch' },
    bumper:          { x: 50, y: 80, label: 'Front Bumper', brand: 'Tata' },
    cabin_lock:      { x: 18, y: 55, label: 'Door Lock', brand: 'Tata' },
  },
  rear: {
    tail_light:      { x: 15, y: 85, label: 'Tail Light (L)', brand: 'Lumax' },
    tail_light_r:    { x: 85, y: 85, label: 'Tail Light (R)', brand: 'Lumax' },
    trailer_door:    { x: 50, y: 40, label: 'Trailer Rear Door', brand: 'Local' },
    mud_flap:        { x: 20, y: 92, label: 'Mud Flap', brand: 'Tata' },
    hub_bearing_rl2: { x: 35, y: 88, label: 'Rear Hub L', brand: 'SKF' },
    hub_bearing_rr2: { x: 65, y: 88, label: 'Rear Hub R', brand: 'SKF' },
    reflective_tape: { x: 50, y: 75, label: 'Reflectors', brand: '3M' },
    rear_bumper:     { x: 50, y: 88, label: 'Rear Bumper', brand: 'Tata' },
  },
  undercarriage: {
    gear_oil:        { x: 30, y: 45, label: 'Gearbox Oil', brand: 'Shell' },
    clutch_plate:    { x: 28, y: 45, label: 'Clutch Assembly', brand: 'Valeo' },
    crown_oil:       { x: 65, y: 55, label: 'Crown Oil', brand: 'Castrol' },
    propeller_shaft: { x: 45, y: 52, label: 'Propeller Shaft', brand: 'Spicer' },
    main_shaft:      { x: 35, y: 50, label: 'Main Shaft', brand: 'Tata' },
    pressure_pipe:   { x: 50, y: 65, label: 'Air Pipes', brand: 'Tata' },
    air_dryer:       { x: 42, y: 65, label: 'Air Dryer', brand: 'Wabco' },
    air_compressor:  { x: 25, y: 50, label: 'Air Compressor', brand: 'Wabco' },
    crown_wheel:     { x: 68, y: 55, label: 'Crown Wheel', brand: 'Tata' },
    pinion:          { x: 62, y: 55, label: 'Pinion Gear', brand: 'Tata' },
    brake_pad_front: { x: 15, y: 65, label: 'Front Brake Pads', brand: 'Rane' },
    brake_pad_rear:  { x: 75, y: 65, label: 'Rear Brake Pads', brand: 'Rane' },
    urea_def:        { x: 20, y: 40, label: 'Urea Tank', brand: 'Tata' },
    coolant_pipe:    { x: 18, y: 45, label: 'Coolant Pipe', brand: 'Tata' },
  }
};

const statusColor = (s) => s === 'overdue' ? '#ef4444' : s === 'due_soon' ? '#f59e0b' : '#10b981';

export default function TruckDiagram({ summary = {}, records = [], onPartClick, vehicle = {}, viewIdx = 0, setViewIdx }) {
  const [hovered, setHovered] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showAllLabels, setShowAllLabels] = useState(true);
  
  const containerRef = useRef(null);
  
  const make = ((vehicle && vehicle.make) || 'tata').toLowerCase();
  const model = ((vehicle && vehicle.model) || '').toLowerCase();
  const type = ((vehicle && vehicle.vehicleType) || '').toLowerCase();
  
  const currentViewBase = VIEWS[viewIdx] || VIEWS[0];
  
  // Use brand-specific side view if available
  const getImgPath = () => {
    if (!currentViewBase) return '';
    const viewId = currentViewBase.id;
    const isCanter = type.includes('canter') || type.includes('dump') || model.includes('1916') || model.includes('1512') || model.includes('1109');
    
    // Default to tata/leyland generic if model-specific doesn't exist
    const brandDir = make.includes('leyland') ? 'leyland' : 'tata';

    if (viewId === 'side') {
      if (isCanter) return '/assets/truck/tata/1916_side.png';
      return `/assets/truck/${brandDir}/side.png`;
    }
    
    // For other views (Front, Rear, Undercarriage), use brand specific if available
    return `/assets/truck/${brandDir}/${viewId}.png`;
  };

  const currentView = { ...currentViewBase, img: getImgPath() };

  const handleZoom = (delta) => setZoom(z => Math.min(3, Math.max(1, z + delta)));
  const handleReset = () => { setZoom(1); setOffset({ x: 0, y: 0 }); };

  const onMouseDown = (e) => {
    if (zoom === 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const onMouseMove = (e) => {
    if (!isDragging) return;
    setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const onMouseUp = () => setIsDragging(false);

  if (!currentView) return <div style={{ color: 'white', padding: '20px' }}>Loading Diagram...</div>;

  return (
    <div style={{ position: 'relative', background: 'linear-gradient(180deg, #020617 0%, #0f172a 100%)', borderRadius: '32px', padding: '32px', border: '1px solid rgba(59,130,246,0.3)', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 0 100px rgba(59,130,246,0.1)' }}>
      
      {/* HUD Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', position: 'relative', zIndex: 100 }}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 900, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="pulse-blue" style={{ width: '8px', height: '8px', background: '#3b82f6', borderRadius: '50%' }}></div>
            {(currentView && currentView.label) || 'Vehicle'} — {(vehicle && vehicle.make) || 'Tata'} {(vehicle && vehicle.model) || 'Prima'}
          </div>
          <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginTop: '4px', fontWeight: 700 }}>
            <span style={{ color: '#3b82f6' }}>HD Precision</span> • Dynamic Manufacturing Model
          </div>
        </div>
        
        {/* View Controls */}
        <div style={{ display: 'flex', gap: '8px', background: 'rgba(15,23,42,0.6)', padding: '6px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <button onClick={() => setShowAllLabels(!showAllLabels)} 
            style={{ padding: '8px 14px', borderRadius: '10px', border: '1px solid rgba(59,130,246,0.3)', background: showAllLabels ? 'rgba(59,130,246,0.1)' : 'transparent', color: showAllLabels ? '#3b82f6' : '#64748b', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>
            {showAllLabels ? 'HIDE NAMES' : 'SHOW NAMES'}
          </button>
          {VIEWS.map((v, i) => (
            <button key={v.id} onClick={() => { setViewIdx(i); handleReset(); }} 
              style={{ padding: '8px 14px', borderRadius: '10px', border: 'none', background: viewIdx === i ? '#3b82f6' : 'transparent', color: viewIdx === i ? 'white' : '#64748b', fontSize: '11px', fontWeight: 800, cursor: 'pointer', transition: '0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}>
              {v.id.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Main Interaction Area */}
      <div ref={containerRef} 
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
        style={{ position: 'relative', height: '480px', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default', overflow: 'hidden', borderRadius: '20px', background: 'rgba(0,0,0,0.2)' }}>
        
        <AnimatePresence mode="wait">
          <motion.div key={currentView.id} 
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: zoom, x: offset.x, y: offset.y }} exit={{ opacity: 0, scale: 1.1 }}
            transition={{ type: 'spring', damping: 20, stiffness: 100 }}
            style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            
            {/* Real Blueprint Image */}
            <img src={currentView.img} alt={currentView.label} style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain', filter: 'drop-shadow(0 0 30px rgba(59,130,246,0.3)) brightness(1.2)' }} draggable={false} />

            {/* Picking Engine (Dots) */}
            {Object.entries(PART_POSITIONS[currentView.id] || {}).map(([partId, pos]) => {
              // Skip trailer parts for non-trailer vehicles
              const isTrailerPart = ['landing_gear', 'coupling_pin', 'trailer_body', 'trailer_door', 'lifting_axle_air_bag'].includes(partId);
              const isCanter = type.includes('canter') || type.includes('dump') || model.includes('1916') || model.includes('1512') || model.includes('1109');
              if (isCanter && isTrailerPart) return null;

              const data = summary[partId];
              const status = data?.status || 'none';
              const color = data ? statusColor(status) : '#475569';
              const isHov = hovered === partId;
              
              return (
                <div key={partId} style={{ position: 'absolute', left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)', cursor: 'pointer', zIndex: 20 }}
                  onMouseEnter={() => setHovered(partId)} onMouseLeave={() => setHovered(null)} onClick={() => onPartClick?.(partId)}>
                  
                  {/* Glowing Alert Ring */}
                  {data && status !== 'ok' && (
                    <motion.div animate={{ scale: [1, 2.5], opacity: [0.6, 0] }} transition={{ repeat: Infinity, duration: 2 }} 
                      style={{ position: 'absolute', inset: -15, borderRadius: '50%', border: `3px solid ${color}` }} />
                  )}

                  {/* Pickable Core */}
                  <motion.div whileHover={{ scale: 1.5 }} whileTap={{ scale: 0.8 }}
                    style={{ width: isHov ? '18px' : '12px', height: isHov ? '18px' : '12px', background: `radial-gradient(circle at 30% 30%, white, ${color})`, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', boxShadow: `0 0 15px ${color}, 0 0 30px ${color}44` }} />
                  
                  {/* Floating Label - Now more persistent and easier to read */}
                  <motion.div animate={{ scale: isHov ? 1.1 : 0.85, opacity: showAllLabels || isHov || (data && status !== 'ok') ? 1 : 0 }}
                    style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', background: 'rgba(15,23,42,0.92)', color: 'white', padding: '6px 12px', borderRadius: '10px', fontSize: '10px', fontWeight: 900, border: `1px solid ${isHov ? color : 'rgba(59,130,246,0.2)'}`, pointerEvents: 'none', zIndex: isHov ? 150 : 100, boxShadow: isHov ? '0 10px 20px rgba(0,0,0,0.4)' : 'none', backdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ color: isHov ? color : '#3b82f6', fontSize: '7px', textTransform: 'uppercase', marginBottom: '1px', fontWeight: 900 }}>{pos.brand}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {pos.label} {data?.recurring ? '⚠' : ''}
                    </div>
                    {data && (
                      <div style={{ fontSize: '7px', color: status === 'ok' ? '#10b981' : (status === 'overdue' ? '#ef4444' : '#f59e0b'), marginTop: '2px', opacity: 0.9 }}>
                        Last: {data.lastServiceDate || 'N/A'} {status !== 'ok' ? `(${status.replace('_', ' ').toUpperCase()})` : ''}
                      </div>
                    )}
                    {isHov && records.filter(r => r.partId === partId).length > 0 && (
                      <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '6px', width: '100%' }}>
                        <div style={{ fontSize: '7px', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Change History</div>
                        {records.filter(r => r.partId === partId).slice(0, 3).map((r, ri) => (
                          <div key={ri} style={{ fontSize: '8px', color: '#cbd5e1', display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '2px' }}>
                            <span>{r.date}</span>
                            <span style={{ color: '#10b981' }}>₹{r.cost.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                </div>
              );
            })}
          </motion.div>
        </AnimatePresence>

        {/* Dynamic Zoom UI */}
        <div style={{ position: 'absolute', bottom: '24px', right: '24px', display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 200 }}>
          <button onClick={() => handleZoom(0.5)} style={{ background: 'rgba(15,23,42,0.8)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', padding: '10px', borderRadius: '12px', cursor: 'pointer' }}><ZoomIn size={18} /></button>
          <button onClick={() => handleZoom(-0.5)} style={{ background: 'rgba(15,23,42,0.8)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', padding: '10px', borderRadius: '12px', cursor: 'pointer' }}><ZoomOut size={18} /></button>
          <button onClick={handleReset} style={{ background: 'rgba(15,23,42,0.8)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', padding: '10px', borderRadius: '12px', cursor: 'pointer' }}><Maximize2 size={18} /></button>
        </div>

        {/* View Switcher Controls */}
        <div style={{ position: 'absolute', bottom: '24px', left: '24px', zIndex: 200 }}>
          <button onClick={() => setViewIdx((viewIdx + 1) % VIEWS.length)} style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: 'white', border: 'none', padding: '12px 28px', borderRadius: '30px', fontWeight: 900, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 10px 25px rgba(37, 99, 235, 0.4)' }}>
            <RotateCw size={16} /> REVOLVE MODEL
          </button>
        </div>
      </div>

      {/* Part Search / Inventory Status */}
      <div style={{ marginTop: '24px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        {[
          { label: 'Critical Alerts', val: Object.values(summary).filter(s => s.status === 'overdue').length, color: '#ef4444' },
          { label: 'Upcoming Service', val: Object.values(summary).filter(s => s.status === 'due_soon').length, color: '#f59e0b' },
          { label: 'Healthy Components', val: Object.values(summary).filter(s => s.status === 'ok').length, color: '#10b981' },
          { label: 'Total Mapped', val: Object.keys(PART_POSITIONS.side).length + Object.keys(PART_POSITIONS.front).length + Object.keys(PART_POSITIONS.rear).length + Object.keys(PART_POSITIONS.undercarriage).length, color: '#3b82f6' },
        ].map((s, i) => (
          <div key={i} style={{ background: 'rgba(15,23,42,0.4)', padding: '16px', borderRadius: '18px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: '24px', fontWeight: 950, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <style>{`
        .pulse-blue { animation: pulse-b 2s infinite; }
        @keyframes pulse-b { 0% { opacity: 0.5; transform: scale(1); } 50% { opacity: 1; transform: scale(1.2); } 100% { opacity: 0.5; transform: scale(1); } }
      `}</style>
    </div>
  );
}
