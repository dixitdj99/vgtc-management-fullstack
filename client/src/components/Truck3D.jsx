import React, { useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';

// ── Cabin colors by make ──
const MAKE_COLORS = {
  'tata':          { cabin: '#1e40af', body: '#94a3b8' },
  'ashok leyland': { cabin: '#166534', body: '#94a3b8' },
  'bharatbenz':    { cabin: '#991b1b', body: '#94a3b8' },
  'eicher':        { cabin: '#c2410c', body: '#94a3b8' },
  'mahindra':      { cabin: '#7f1d1d', body: '#94a3b8' },
  'default':       { cabin: '#334155', body: '#94a3b8' },
};

const getColors = (make) => {
  const key = (make || '').toLowerCase();
  return MAKE_COLORS[key] || MAKE_COLORS['default'];
};

// ── Part positions per truck type ──
const PART_MAP = {
  trailer: {
    engine: [
      { id: 'engine_oil', pos: [-4.5, 0.8, 0], label: 'Engine Oil' },
      { id: 'oil_filter', pos: [-4.2, 0.5, 0.5], label: 'Oil Filter' },
      { id: 'air_filter', pos: [-4.8, 1.2, 0], label: 'Air Filter' },
      { id: 'fuel_filter', pos: [-4, 0.3, -0.5], label: 'Fuel Filter' },
      { id: 'turbo', pos: [-4.5, 1.5, 0.3], label: 'Turbocharger' },
      { id: 'water_pump', pos: [-4.7, 0.4, 0], label: 'Water Pump' },
      { id: 'alternator', pos: [-4.3, 0.2, 0.6], label: 'Alternator' },
    ],
    fluids: [
      { id: 'coolant', pos: [-4.6, 1, 0.5], label: 'Coolant' },
      { id: 'urea_def', pos: [-3.5, 0.2, -0.8], label: 'Urea/DEF' },
      { id: 'brake_fluid', pos: [-4, 1.3, -0.3], label: 'Brake Fluid' },
      { id: 'power_steering_fluid', pos: [-4.2, 1.1, 0.4], label: 'Power Steering' },
    ],
    transmission: [
      { id: 'gear_oil', pos: [-2.5, -0.1, 0], label: 'Gear Oil' },
      { id: 'crown_oil', pos: [3, -0.1, 0], label: 'Crown Oil' },
      { id: 'clutch_plate', pos: [-3, 0.1, 0], label: 'Clutch Plate' },
      { id: 'clutch_bearing', pos: [-3.2, 0.2, 0], label: 'Clutch Bearing' },
      { id: 'propeller_shaft', pos: [0, -0.2, 0], label: 'Propeller Shaft' },
      { id: 'crown_wheel', pos: [3.5, -0.1, 0], label: 'Crown Wheel' },
      { id: 'pinion', pos: [3.2, 0, 0], label: 'Pinion' },
      { id: 'main_shaft', pos: [-2.8, 0, 0], label: 'Main Shaft' },
    ],
    tyres: [
      { id: 'tyre_fl', pos: [-3.5, -0.7, 1.1], label: 'Front Left Tyre' },
      { id: 'tyre_fr', pos: [-3.5, -0.7, -1.1], label: 'Front Right Tyre' },
      { id: 'tyre_rl1', pos: [3, -0.7, 1.2], label: 'Rear Left 1' },
      { id: 'tyre_rl2', pos: [4, -0.7, 1.2], label: 'Rear Left 2' },
      { id: 'tyre_rr1', pos: [3, -0.7, -1.2], label: 'Rear Right 1' },
      { id: 'tyre_rr2', pos: [4, -0.7, -1.2], label: 'Rear Right 2' },
      { id: 'spare_tyre', pos: [5.5, -0.3, 0], label: 'Spare Tyre' },
    ],
    brakes: [
      { id: 'brake_pad_front', pos: [-3.5, -0.5, 0.9], label: 'Front Brake Pad' },
      { id: 'brake_pad_rear', pos: [3, -0.5, 0.9], label: 'Rear Brake Pad' },
      { id: 'brake_shoe', pos: [3.5, -0.4, -0.9], label: 'Brake Shoe' },
      { id: 'brake_drum_f', pos: [-3.5, -0.5, -0.9], label: 'Front Drum' },
      { id: 'brake_drum_r', pos: [4, -0.5, 0.9], label: 'Rear Drum' },
      { id: 'air_compressor', pos: [-3, 0.6, 0.7], label: 'Air Compressor' },
      { id: 'air_dryer', pos: [-2.5, 0.5, 0.8], label: 'Air Dryer' },
      { id: 'pressure_pipe', pos: [-1, -0.1, 0.8], label: 'Pressure Pipe' },
      { id: 'pressure_valve', pos: [-2, 0.3, 0.7], label: 'Pressure Valve' },
    ],
    suspension: [
      { id: 'leaf_spring_fl', pos: [-3.5, -0.3, 0.8], label: 'Leaf Spring FL' },
      { id: 'leaf_spring_fr', pos: [-3.5, -0.3, -0.8], label: 'Leaf Spring FR' },
      { id: 'leaf_spring_rl', pos: [3.5, -0.3, 0.8], label: 'Leaf Spring RL' },
      { id: 'leaf_spring_rr', pos: [3.5, -0.3, -0.8], label: 'Leaf Spring RR' },
      { id: 'shock_absorber_f', pos: [-3.8, -0.1, 0.7], label: 'Shock Front' },
      { id: 'shock_absorber_r', pos: [3.8, -0.1, 0.7], label: 'Shock Rear' },
    ],
    electrical: [
      { id: 'battery', pos: [-3.2, 0.2, -0.9], label: 'Battery' },
      { id: 'headlight_left', pos: [-5, 0.8, 0.8], label: 'Headlight L' },
      { id: 'headlight_right', pos: [-5, 0.8, -0.8], label: 'Headlight R' },
      { id: 'tail_light', pos: [6, 1, 0.9], label: 'Tail Light' },
      { id: 'wiring_harness', pos: [-2, 0.5, 0.5], label: 'Wiring' },
    ],
    body: [
      { id: 'windshield', pos: [-4.8, 1.8, 0], label: 'Windshield' },
      { id: 'mirror_left', pos: [-4.5, 1.5, 1.2], label: 'Mirror L' },
      { id: 'mirror_right', pos: [-4.5, 1.5, -1.2], label: 'Mirror R' },
      { id: 'wiper_left', pos: [-4.9, 1.7, 0.4], label: 'Wiper L' },
      { id: 'wiper_right', pos: [-4.9, 1.7, -0.4], label: 'Wiper R' },
    ],
    trailer: [
      { id: 'coupling_pin', pos: [-1.5, 0, 0], label: 'Coupling Pin' },
      { id: 'tarpaulin', pos: [2, 2.5, 0], label: 'Tarpaulin' },
      { id: 'trailer_body', pos: [2, 1.5, 0], label: 'Trailer Body' },
      { id: 'landing_gear', pos: [-0.5, -0.5, 0.8], label: 'Landing Gear' },
      { id: 'trailer_lock', pos: [-1.5, 0.2, 0.5], label: 'Trailer Lock' },
    ],
    axle_hubs: [
      { id: 'front_hub_left', pos: [-3.5, -0.6, 1], label: 'Front Hub L' },
      { id: 'front_hub_right', pos: [-3.5, -0.6, -1], label: 'Front Hub R' },
      { id: 'rear_hub_left_1', pos: [3, -0.6, 1], label: 'Rear Hub L1' },
      { id: 'rear_hub_right_1', pos: [3, -0.6, -1], label: 'Rear Hub R1' },
      { id: 'hub_greasing', pos: [3.5, -0.4, 0], label: 'Hub Greasing' },
    ],
    chassis: [
      { id: 'chassis_crack', pos: [0, -0.3, 0.5], label: 'Chassis' },
      { id: 'cross_member', pos: [1, -0.3, 0], label: 'Cross Member' },
      { id: 'fifth_wheel', pos: [-1.5, 0.2, 0], label: 'Fifth Wheel' },
    ],
    tools: [
      { id: 'jack', pos: [5.8, 0, 0.5], label: 'Jack' },
      { id: 'tool_kit', pos: [5.8, 0.3, -0.5], label: 'Tool Kit' },
      { id: 'fire_extinguisher', pos: [-4.5, 0, -0.9], label: 'Fire Ext.' },
    ],
    damage: [
      { id: 'accident_damage', pos: [-5.2, 0.5, 0], label: 'Accident Damage' },
      { id: 'body_dent', pos: [2, 1, 1], label: 'Body Dent' },
      { id: 'paint_job', pos: [0, 1.5, 1], label: 'Paint Job' },
    ],
  },
};

// Dump truck — same parts, adjusted positions for shorter body
PART_MAP.dump = JSON.parse(JSON.stringify(PART_MAP.trailer));
// Remove trailer-specific parts
PART_MAP.dump.trailer = [];
// Adjust rear positions closer
Object.values(PART_MAP.dump).forEach(parts => {
  parts.forEach(p => {
    if (p.pos[0] > 2) p.pos[0] = p.pos[0] * 0.6;
    if (p.pos[0] > 5) p.pos[0] = 4;
  });
});

// Canter — smaller, no trailer parts, 4 wheels
PART_MAP.canter = JSON.parse(JSON.stringify(PART_MAP.dump));
PART_MAP.canter.trailer = [];
PART_MAP.canter.tyres = PART_MAP.canter.tyres.filter(p => !p.id.includes('rl2') && !p.id.includes('rr2'));

// ── Status colors ──
const STATUS_COLOR = { overdue: '#ef4444', due_soon: '#f59e0b', ok: '#10b981', none: '#64748b' };

// ── Wheel component ──
function Wheel({ position, scale = 1 }) {
  return (
    <group position={position}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.4 * scale, 0.4 * scale, 0.25, 16]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.8} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.2 * scale, 0.2 * scale, 0.26, 8]} />
        <meshStandardMaterial color="#555" metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  );
}

// ── Part Marker (3D sphere + HTML tooltip) ──
function PartMarker({ part, status, data, onClick, visible }) {
  const [hovered, setHovered] = useState(false);
  const ref = useRef();
  const color = STATUS_COLOR[status] || STATUS_COLOR.none;

  useFrame((_, delta) => {
    if (!ref.current) return;
    if (status === 'overdue') {
      ref.current.scale.setScalar(1 + Math.sin(Date.now() * 0.005) * 0.3);
    }
  });

  if (!visible) return null;

  return (
    <group position={part.pos}>
      <mesh ref={ref} onClick={(e) => { e.stopPropagation(); onClick(part.id); }}
        onPointerOver={() => setHovered(true)} onPointerOut={() => setHovered(false)}>
        <sphereGeometry args={[hovered ? 0.15 : 0.1, 12, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hovered ? 1.5 : 0.5} transparent opacity={0.9} />
      </mesh>
      {/* Glow ring */}
      {status === 'overdue' && (
        <mesh>
          <ringGeometry args={[0.15, 0.22, 16]} />
          <meshBasicMaterial color={color} transparent opacity={0.3} side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* Tooltip */}
      {hovered && (
        <Html distanceFactor={8} style={{ pointerEvents: 'none' }}>
          <div style={{
            background: 'rgba(15,23,42,0.95)', color: '#fff', padding: '8px 12px',
            borderRadius: '8px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap',
            border: `1px solid ${color}`, backdropFilter: 'blur(8px)', minWidth: '120px',
            boxShadow: `0 4px 15px ${color}44`,
          }}>
            <div style={{ color, fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '2px' }}>
              {status === 'none' ? 'No Data' : status.replace('_', ' ').toUpperCase()}
            </div>
            <div>{part.label}</div>
            {data && (
              <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '3px' }}>
                {data.lastServiceDate && <div>Last: {data.lastServiceDate}</div>}
                {data.cost > 0 && <div>Cost: ₹{data.cost.toLocaleString()}</div>}
                {data.totalRecords > 1 && <div>Changed {data.totalRecords}x</div>}
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

// ── Trailer Model ──
function TrailerModel({ colors }) {
  return (
    <group>
      {/* Cabin */}
      <mesh position={[-4.2, 1, 0]}>
        <boxGeometry args={[2.2, 2.2, 2]} />
        <meshStandardMaterial color={colors.cabin} roughness={0.4} metalness={0.3} />
      </mesh>
      {/* Windshield */}
      <mesh position={[-5.15, 1.5, 0]}>
        <boxGeometry args={[0.05, 1, 1.6]} />
        <meshStandardMaterial color="#87ceeb" transparent opacity={0.5} metalness={0.8} />
      </mesh>
      {/* Chassis */}
      <mesh position={[0, -0.15, 0.6]}>
        <boxGeometry args={[12, 0.2, 0.15]} />
        <meshStandardMaterial color="#333" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, -0.15, -0.6]}>
        <boxGeometry args={[12, 0.2, 0.15]} />
        <meshStandardMaterial color="#333" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Trailer body */}
      <mesh position={[2, 1.2, 0]}>
        <boxGeometry args={[8, 2.4, 2.4]} />
        <meshStandardMaterial color={colors.body} roughness={0.6} metalness={0.2} />
      </mesh>
      {/* Fuel tank */}
      <mesh position={[-2.5, -0.2, 0.9]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.3, 0.3, 1.2, 12]} />
        <meshStandardMaterial color="#444" metalness={0.7} />
      </mesh>
      {/* Wheels */}
      <Wheel position={[-3.5, -0.7, 1.1]} />
      <Wheel position={[-3.5, -0.7, -1.1]} />
      <Wheel position={[3, -0.7, 1.2]} />
      <Wheel position={[3, -0.7, -1.2]} />
      <Wheel position={[4, -0.7, 1.2]} />
      <Wheel position={[4, -0.7, -1.2]} />
    </group>
  );
}

// ── Dump Truck Model ──
function DumpModel({ colors }) {
  return (
    <group>
      {/* Cabin */}
      <mesh position={[-2.5, 1, 0]}>
        <boxGeometry args={[2.2, 2.2, 2]} />
        <meshStandardMaterial color={colors.cabin} roughness={0.4} metalness={0.3} />
      </mesh>
      <mesh position={[-3.45, 1.5, 0]}>
        <boxGeometry args={[0.05, 1, 1.6]} />
        <meshStandardMaterial color="#87ceeb" transparent opacity={0.5} metalness={0.8} />
      </mesh>
      {/* Chassis */}
      <mesh position={[0.5, -0.15, 0.6]}>
        <boxGeometry args={[7, 0.2, 0.15]} />
        <meshStandardMaterial color="#333" metalness={0.6} />
      </mesh>
      <mesh position={[0.5, -0.15, -0.6]}>
        <boxGeometry args={[7, 0.2, 0.15]} />
        <meshStandardMaterial color="#333" metalness={0.6} />
      </mesh>
      {/* Tipper body */}
      <mesh position={[1.5, 1.3, 0]} rotation={[0, 0, -0.03]}>
        <boxGeometry args={[5, 2, 2.3]} />
        <meshStandardMaterial color={colors.body} roughness={0.5} />
      </mesh>
      {/* Hydraulic ram */}
      <mesh position={[-0.5, 0.3, 0]} rotation={[0, 0, 0.3]}>
        <cylinderGeometry args={[0.05, 0.05, 2, 8]} />
        <meshStandardMaterial color="#888" metalness={0.9} />
      </mesh>
      {/* Wheels */}
      <Wheel position={[-2.2, -0.7, 1.1]} />
      <Wheel position={[-2.2, -0.7, -1.1]} />
      <Wheel position={[2.5, -0.7, 1.2]} />
      <Wheel position={[2.5, -0.7, -1.2]} />
      <Wheel position={[3.3, -0.7, 1.2]} />
      <Wheel position={[3.3, -0.7, -1.2]} />
    </group>
  );
}

// ── Canter Model ──
function CanterModel({ colors }) {
  return (
    <group>
      {/* Cabin (smaller) */}
      <mesh position={[-2, 0.8, 0]}>
        <boxGeometry args={[1.8, 1.8, 1.7]} />
        <meshStandardMaterial color={colors.cabin} roughness={0.4} metalness={0.3} />
      </mesh>
      <mesh position={[-2.75, 1.2, 0]}>
        <boxGeometry args={[0.05, 0.8, 1.3]} />
        <meshStandardMaterial color="#87ceeb" transparent opacity={0.5} metalness={0.8} />
      </mesh>
      {/* Chassis */}
      <mesh position={[0, -0.1, 0.5]}>
        <boxGeometry args={[5.5, 0.15, 0.12]} />
        <meshStandardMaterial color="#333" metalness={0.6} />
      </mesh>
      <mesh position={[0, -0.1, -0.5]}>
        <boxGeometry args={[5.5, 0.15, 0.12]} />
        <meshStandardMaterial color="#333" metalness={0.6} />
      </mesh>
      {/* Box body */}
      <mesh position={[1, 0.9, 0]}>
        <boxGeometry args={[3.5, 1.6, 1.7]} />
        <meshStandardMaterial color={colors.body} roughness={0.6} />
      </mesh>
      {/* Wheels (4 only) */}
      <Wheel position={[-1.8, -0.6, 0.9]} scale={0.85} />
      <Wheel position={[-1.8, -0.6, -0.9]} scale={0.85} />
      <Wheel position={[2, -0.6, 0.9]} scale={0.85} />
      <Wheel position={[2, -0.6, -0.9]} scale={0.85} />
    </group>
  );
}

// ── Auto-rotate group ──
function AutoRotateGroup({ children, autoRotate }) {
  const ref = useRef();
  useFrame((_, delta) => {
    if (ref.current && autoRotate) {
      ref.current.rotation.y += delta * 0.15;
    }
  });
  return <group ref={ref}>{children}</group>;
}

// ── Ground plane ──
function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.15, 0]} receiveShadow>
      <planeGeometry args={[20, 20]} />
      <meshStandardMaterial color="#1a1f2e" roughness={1} />
    </mesh>
  );
}

// ── Main 3D Scene ──
function TruckScene({ truckType, make, summary, onPartClick, visibleCategories }) {
  const colors = getColors(make);
  const type = (truckType || '').toLowerCase();
  const isCanter = type.includes('canter');
  const isDump = type.includes('dump');
  const mapKey = isCanter ? 'canter' : isDump ? 'dump' : 'trailer';
  const partMap = PART_MAP[mapKey] || PART_MAP.trailer;
  const [autoRotate, setAutoRotate] = useState(true);

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 8, 5]} intensity={1} castShadow />
      <directionalLight position={[-5, 4, -3]} intensity={0.3} />
      <pointLight position={[0, 5, 0]} intensity={0.2} />

      <AutoRotateGroup autoRotate={autoRotate}>
        {isCanter ? <CanterModel colors={colors} /> :
         isDump ? <DumpModel colors={colors} /> :
         <TrailerModel colors={colors} />}

        {/* Part markers */}
        {Object.entries(partMap).map(([cat, parts]) =>
          parts.map(part => {
            const data = summary?.[part.id];
            const status = data?.status || 'none';
            const visible = visibleCategories.length === 0 || visibleCategories.includes(cat);
            return (
              <PartMarker key={part.id} part={part} status={status} data={data}
                onClick={onPartClick} visible={visible} />
            );
          })
        )}
      </AutoRotateGroup>

      <Ground />
      <OrbitControls makeDefault enablePan enableZoom enableRotate
        minDistance={4} maxDistance={18} maxPolarAngle={Math.PI / 2.1}
        onStart={() => setAutoRotate(false)} />
    </>
  );
}

// ── Exported Component ──
export default function Truck3D({ summary = {}, onPartClick, vehicle = {}, visibleCategories = [] }) {
  const truckType = vehicle.vehicleType || 'Trailer';
  const make = vehicle.make || 'Tata';

  return (
    <div style={{ width: '100%', height: '350px', borderRadius: '14px', overflow: 'hidden', background: 'linear-gradient(180deg, #0f172a, #1e293b)', position: 'relative' }}>
      <Canvas camera={{ position: [8, 5, 8], fov: 40 }}>
        <TruckScene truckType={truckType} make={make} summary={summary}
          onPartClick={onPartClick} visibleCategories={visibleCategories} />
      </Canvas>
      {/* Legend */}
      <div style={{ position: 'absolute', bottom: '10px', left: '10px', display: 'flex', gap: '8px', zIndex: 10 }}>
        {[
          { color: '#10b981', label: 'OK' },
          { color: '#f59e0b', label: 'Due Soon' },
          { color: '#ef4444', label: 'Overdue' },
          { color: '#64748b', label: 'No Data' },
        ].map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', color: '#94a3b8', fontWeight: 700 }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.color }} />
            {s.label}
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', top: '10px', left: '10px', fontSize: '10px', color: '#64748b', fontWeight: 600 }}>
        Drag to rotate · Scroll to zoom
      </div>
      <div style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '11px', color: '#94a3b8', fontWeight: 800, background: 'rgba(0,0,0,0.4)', padding: '4px 10px', borderRadius: '6px' }}>
        {make} · {truckType}
      </div>
    </div>
  );
}
