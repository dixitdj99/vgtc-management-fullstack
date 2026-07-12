const { db, admin, isAvailable } = require('../firebase');
const localStore = require('../utils/localStore');
const firebaseAvailable = () => isAvailable();
const COLLECTION = 'vehicle_maintenance';

// Comprehensive Parts Catalog with Brands and default intervals
const PARTS_CATALOG = {

  // ── FLUIDS ──
  engine_oil:        { name: 'Engine Oil', category: 'fluids', defaultKmInterval: 40000, defaultDayInterval: 180 },
  coolant:           { name: 'Coolant / Antifreeze', category: 'fluids', defaultKmInterval: 40000, defaultDayInterval: 365 },
  urea_def:          { name: 'Urea / DEF Fluid', category: 'fluids', defaultKmInterval: 5000, defaultDayInterval: 30 },
  brake_fluid:       { name: 'Brake Fluid', category: 'fluids', defaultKmInterval: 50000, defaultDayInterval: 365 },
  power_steering_fluid: { name: 'Power Steering Fluid', category: 'fluids', defaultKmInterval: 60000, defaultDayInterval: 730 },
  clutch_oil:        { name: 'Clutch Oil', category: 'fluids', defaultKmInterval: 40000, defaultDayInterval: 365 },
  tata_engine_oil:   { name: 'Engine Oil CK-4 15W-40 (Tata 1916)', category: 'fluids', partCode: 'TGP-2527091101', vehicleModel: 'Tata 1916', defaultKmInterval: 40000, defaultDayInterval: 180 },
  tata_def_fluid:    { name: 'Genuine DEF / AdBlue (Tata 1916)', category: 'fluids', partCode: 'TGP-DEF-020L', vehicleModel: 'Tata 1916', defaultKmInterval: 10000, defaultDayInterval: 90, errorCodes: [{ code: 'P203F', desc: 'Reductant Level Too Low' }] },
  leyland_engine_oil: { name: 'Engine Oil CK-4 15W-40 Leypower (Leyland 5525)', category: 'fluids', partCode: 'AL-4527091101', vehicleModel: 'Leyland 5525', defaultKmInterval: 40000, defaultDayInterval: 180 },
  leyland_def_fluid:  { name: 'Leyblue DEF / AdBlue Fluid (Leyland 5525)', category: 'fluids', partCode: 'AL-DEF-026L', vehicleModel: 'Leyland 5525', defaultKmInterval: 10000, defaultDayInterval: 90, errorCodes: [{ code: 'P203F', desc: 'Reductant Level Low' }] },

  // ── TRANSMISSION & DRIVETRAIN ──
  gear_oil:          { name: 'Gear Oil (Gearbox)', category: 'transmission', defaultKmInterval: 40000, defaultDayInterval: 180 },
  crown_oil:         { name: 'Crown Oil (Differential)', category: 'transmission', defaultKmInterval: 40000, defaultDayInterval: 180 },
  clutch_plate:      { name: 'Clutch Plate', category: 'transmission', defaultKmInterval: 100000, defaultDayInterval: 730 },
  clutch_bearing:    { name: 'Clutch Bearing', category: 'transmission', defaultKmInterval: 80000, defaultDayInterval: 730 },
  propeller_shaft:   { name: 'Propeller Shaft', category: 'transmission', defaultKmInterval: 0, defaultDayInterval: 1095 },
  crown_wheel:       { name: 'Crown Wheel', category: 'transmission', defaultKmInterval: 200000, defaultDayInterval: 1460 },
  pinion:            { name: 'Pinion', category: 'transmission', defaultKmInterval: 200000, defaultDayInterval: 1460 },
  main_shaft:        { name: 'Main Shaft', category: 'transmission', defaultKmInterval: 0, defaultDayInterval: 1460 },
  tata_gear_oil:     { name: 'Gearbox Oil SAE 80W-90 (Tata 1916)', category: 'transmission', partCode: 'TGP-2527091202', vehicleModel: 'Tata 1916', defaultKmInterval: 80000, defaultDayInterval: 365 },
  tata_diff_oil:     { name: 'Differential Oil SAE 85W-140 (Tata 1916)', category: 'transmission', partCode: 'TGP-2527091203', vehicleModel: 'Tata 1916', defaultKmInterval: 80000, defaultDayInterval: 365 },
  leyland_gear_oil:  { name: 'Gearbox Oil SAE 80W-90 (Leyland 5525)', category: 'transmission', partCode: 'AL-4527091202', vehicleModel: 'Leyland 5525', defaultKmInterval: 80000, defaultDayInterval: 365 },
  leyland_diff_oil:  { name: 'Differential Oil SAE 85W-140 (Leyland 5525)', category: 'transmission', partCode: 'AL-4527091203', vehicleModel: 'Leyland 5525', defaultKmInterval: 80000, defaultDayInterval: 365 },

  // ── ENGINE & FILTERS ──
  air_filter:        { name: 'Air Filter (Generic)', category: 'engine', defaultKmInterval: 40000, defaultDayInterval: 365 },
  tata_oil_filter:   { name: 'Engine Oil Filter (Tata 1916)', category: 'engine', partCode: 'TGP-5412180302', vehicleModel: 'Tata 1916', defaultKmInterval: 40000, defaultDayInterval: 180, errorCodes: [{ code: 'P0196', desc: 'Engine Oil Temp Sensor Range/Performance' }] },
  tata_fuel_filter_primary: { name: 'Primary Fuel Filter (Water Separator) (Tata 1916)', category: 'engine', partCode: 'TGP-2773091301', vehicleModel: 'Tata 1916', defaultKmInterval: 40000, defaultDayInterval: 180, errorCodes: [{ code: 'P0087', desc: 'Fuel Rail Pressure Too Low' }] },
  tata_fuel_filter_secondary: { name: 'Secondary Fuel Filter (Fine) (Tata 1916)', category: 'engine', partCode: 'TGP-2773091302', vehicleModel: 'Tata 1916', defaultKmInterval: 40000, defaultDayInterval: 180, errorCodes: [{ code: 'P0088', desc: 'Fuel Rail Pressure Too High' }] },
  tata_air_filter:   { name: 'Air Filter Kit (Primary & Secondary) (Tata 1916)', category: 'engine', partCode: 'TGP-2773091901', vehicleModel: 'Tata 1916', defaultKmInterval: 40000, defaultDayInterval: 365, errorCodes: [{ code: 'P0101', desc: 'MAF Sensor Circuit Range/Performance' }] },
  tata_dpf_filter:   { name: 'DPF Filter Assembly (Tata 1916)', category: 'engine', partCode: 'TGP-5847490201', vehicleModel: 'Tata 1916', defaultKmInterval: 120000, defaultDayInterval: 730, errorCodes: [{ code: 'P2002', desc: 'DPF Efficiency Below Threshold' }, { code: 'P2463', desc: 'DPF Soot Accumulation' }] },
  leyland_oil_filter: { name: 'Engine Oil Filter (Leyland 5525)', category: 'engine', partCode: 'AL-5412180402', vehicleModel: 'Leyland 5525', defaultKmInterval: 40000, defaultDayInterval: 180, errorCodes: [{ code: 'P0196', desc: 'Engine Oil Temp Sensor Range/Performance' }] },
  leyland_fuel_filter_primary: { name: 'Primary Fuel Filter (Separator) (Leyland 5525)', category: 'engine', partCode: 'AL-2773091401', vehicleModel: 'Leyland 5525', defaultKmInterval: 40000, defaultDayInterval: 180, errorCodes: [{ code: 'P0087', desc: 'Fuel Rail Pressure Too Low' }] },
  leyland_fuel_filter_secondary: { name: 'Secondary Fuel Filter (Leyland 5525)', category: 'engine', partCode: 'AL-2773091402', vehicleModel: 'Leyland 5525', defaultKmInterval: 40000, defaultDayInterval: 180, errorCodes: [{ code: 'P0088', desc: 'Fuel Rail Pressure Too High' }] },
  leyland_air_filter: { name: 'Air Filter Kit Dual-Stage (Leyland 5525)', category: 'engine', partCode: 'AL-2773091902', vehicleModel: 'Leyland 5525', defaultKmInterval: 40000, defaultDayInterval: 365, errorCodes: [{ code: 'P0101', desc: 'MAF Sensor Circuit Range/Performance' }] },
  leyland_dpf_filter: { name: 'DPF Muffler Filter Assembly (Leyland 5525)', category: 'engine', partCode: 'AL-5847490202', vehicleModel: 'Leyland 5525', defaultKmInterval: 120000, defaultDayInterval: 730, errorCodes: [{ code: 'P2002', desc: 'DPF Efficiency Below Threshold' }, { code: 'P2463', desc: 'DPF Soot Accumulation' }] },

  // ── AXLE & HUBS ──
  front_hub_left:    { name: 'Front Hub - Left', category: 'axle_hubs', defaultKmInterval: 80000, defaultDayInterval: 365 },
  front_hub_right:   { name: 'Front Hub - Right', category: 'axle_hubs', defaultKmInterval: 80000, defaultDayInterval: 365 },
  rear_hub_left_1:   { name: 'Rear Hub - Left Inner', category: 'axle_hubs', defaultKmInterval: 80000, defaultDayInterval: 365 },
  rear_hub_left_2:   { name: 'Rear Hub - Left Outer', category: 'axle_hubs', defaultKmInterval: 80000, defaultDayInterval: 365 },
  rear_hub_right_1:  { name: 'Rear Hub - Right Inner', category: 'axle_hubs', defaultKmInterval: 80000, defaultDayInterval: 365 },
  rear_hub_right_2:  { name: 'Rear Hub - Right Outer', category: 'axle_hubs', defaultKmInterval: 80000, defaultDayInterval: 365 },
  hub_bearing_fl:    { name: 'Bearing - Front Left Hub', category: 'axle_hubs', defaultKmInterval: 60000, defaultDayInterval: 365 },
  hub_bearing_fr:    { name: 'Bearing - Front Right Hub', category: 'axle_hubs', defaultKmInterval: 60000, defaultDayInterval: 365 },
  hub_bearing_rl:    { name: 'Bearing - Rear Left Hub', category: 'axle_hubs', defaultKmInterval: 60000, defaultDayInterval: 365 },
  hub_bearing_rr:    { name: 'Bearing - Rear Right Hub', category: 'axle_hubs', defaultKmInterval: 60000, defaultDayInterval: 365 },
  hub_greasing:      { name: 'Hub Greasing (All)', category: 'axle_hubs', defaultKmInterval: 30000, defaultDayInterval: 90 },

  // ── SUSPENSION & LEAF SPRINGS ──
  leaf_spring_fl:    { name: 'Leaf Spring - Front Left', category: 'suspension', defaultKmInterval: 100000, defaultDayInterval: 730 },
  leaf_spring_fr:    { name: 'Leaf Spring - Front Right', category: 'suspension', defaultKmInterval: 100000, defaultDayInterval: 730 },
  leaf_spring_rl:    { name: 'Leaf Spring - Rear Left', category: 'suspension', defaultKmInterval: 100000, defaultDayInterval: 730 },
  leaf_spring_rr:    { name: 'Leaf Spring - Rear Right', category: 'suspension', defaultKmInterval: 100000, defaultDayInterval: 730 },
  leaf_greasing:     { name: 'Leaf Spring Greasing', category: 'suspension', defaultKmInterval: 20000, defaultDayInterval: 60 },
  shock_absorber_f:  { name: 'Shock Absorber - Front', category: 'suspension', defaultKmInterval: 80000, defaultDayInterval: 730 },
  shock_absorber_r:  { name: 'Shock Absorber - Rear', category: 'suspension', defaultKmInterval: 80000, defaultDayInterval: 730 },
  u_bolt:            { name: 'U-Bolt', category: 'suspension', defaultKmInterval: 0, defaultDayInterval: 730 },

  // ── BRAKES & PRESSURE ──
  brake_pad_front:   { name: 'Brake Pad - Front', category: 'brakes', defaultKmInterval: 50000, defaultDayInterval: 365 },
  brake_pad_rear:    { name: 'Brake Pad - Rear', category: 'brakes', defaultKmInterval: 50000, defaultDayInterval: 365 },
  brake_shoe:        { name: 'Brake Shoe / Liner', category: 'brakes', defaultKmInterval: 60000, defaultDayInterval: 365 },
  brake_drum_f:      { name: 'Brake Drum - Front', category: 'brakes', defaultKmInterval: 150000, defaultDayInterval: 1095 },
  brake_drum_r:      { name: 'Brake Drum - Rear', category: 'brakes', defaultKmInterval: 150000, defaultDayInterval: 1095 },
  air_compressor:    { name: 'Air Compressor', category: 'brakes', defaultKmInterval: 100000, defaultDayInterval: 730 },
  air_dryer:         { name: 'Air Dryer', category: 'brakes', defaultKmInterval: 80000, defaultDayInterval: 365 },
  pressure_pipe:     { name: 'Air Pressure Pipes / Hoses', category: 'brakes', defaultKmInterval: 0, defaultDayInterval: 730 },
  pressure_valve:    { name: 'Pressure Valve / Relay', category: 'brakes', defaultKmInterval: 0, defaultDayInterval: 730 },
  pressure_leakage:  { name: 'Pressure Leakage Repair', category: 'brakes', defaultKmInterval: 0, defaultDayInterval: 0 },

  // ── TYRES & RIMS ──
  tyre_fl:           { name: 'Tyre - Front Left', category: 'tyres', defaultKmInterval: 80000, defaultDayInterval: 365 },
  tyre_fr:           { name: 'Tyre - Front Right', category: 'tyres', defaultKmInterval: 80000, defaultDayInterval: 365 },
  tyre_rl1:          { name: 'Tyre - Rear Left 1', category: 'tyres', defaultKmInterval: 80000, defaultDayInterval: 365 },
  tyre_rl2:          { name: 'Tyre - Rear Left 2', category: 'tyres', defaultKmInterval: 80000, defaultDayInterval: 365 },
  tyre_rr1:          { name: 'Tyre - Rear Right 1', category: 'tyres', defaultKmInterval: 80000, defaultDayInterval: 365 },
  tyre_rr2:          { name: 'Tyre - Rear Right 2', category: 'tyres', defaultKmInterval: 80000, defaultDayInterval: 365 },
  spare_tyre:        { name: 'Spare Tyre', category: 'tyres', defaultKmInterval: 80000, defaultDayInterval: 365 },
  rim_fl:            { name: 'Rim - Front Left', category: 'tyres', defaultKmInterval: 0, defaultDayInterval: 1460 },
  rim_fr:            { name: 'Rim - Front Right', category: 'tyres', defaultKmInterval: 0, defaultDayInterval: 1460 },
  rim_rear:          { name: 'Rim - Rear (Any)', category: 'tyres', defaultKmInterval: 0, defaultDayInterval: 1460 },

  // ── ELECTRICAL & SENSORS ──
  battery:           { name: 'Battery', category: 'electrical', defaultKmInterval: 0, defaultDayInterval: 730 },
  parking_lights:    { name: 'Parking Lights', category: 'electrical', defaultKmInterval: 0, defaultDayInterval: 365 },
  alternator:        { name: 'Alternator', category: 'electrical', defaultKmInterval: 100000, defaultDayInterval: 730 },
  self_motor:        { name: 'Self Motor / Starter Motor', category: 'electrical', defaultKmInterval: 100000, defaultDayInterval: 730 },
  headlight_left:    { name: 'Headlight - Left', category: 'electrical', defaultKmInterval: 0, defaultDayInterval: 365 },
  headlight_right:   { name: 'Headlight - Right', category: 'electrical', defaultKmInterval: 0, defaultDayInterval: 365 },
  fog_light_left:    { name: 'Fog Light - Left', category: 'electrical', defaultKmInterval: 0, defaultDayInterval: 365 },
  fog_light_right:   { name: 'Fog Light - Right', category: 'electrical', defaultKmInterval: 0, defaultDayInterval: 365 },
  tail_light:        { name: 'Tail Light / Indicator', category: 'electrical', defaultKmInterval: 0, defaultDayInterval: 365 },
  wiring_harness:    { name: 'Wiring Harness', category: 'electrical', defaultKmInterval: 0, defaultDayInterval: 1460 },
  trailer_wiring:    { name: 'Trailer Wiring / Socket', category: 'electrical', defaultKmInterval: 0, defaultDayInterval: 730 },
  sensor_speed:      { name: 'Speed Sensor', category: 'electrical', defaultKmInterval: 0, defaultDayInterval: 730 },
  sensor_temp:       { name: 'Temperature Sensor', category: 'electrical', defaultKmInterval: 0, defaultDayInterval: 730 },
  sensor_pressure:   { name: 'Pressure Sensor', category: 'electrical', defaultKmInterval: 0, defaultDayInterval: 730 },
  sensor_urea:       { name: 'Urea / NOx Sensor', category: 'electrical', defaultKmInterval: 0, defaultDayInterval: 365 },
  sensor_exhaust:    { name: 'Exhaust Temp Sensor', category: 'electrical', defaultKmInterval: 0, defaultDayInterval: 730 },
  urea_fault:        { name: 'Urea System Fault Repair', category: 'electrical', defaultKmInterval: 0, defaultDayInterval: 0 },
  
  // BS6 Electrical Engine Sensors & Errors (Tata 1916)
  tata_sensor_maf:   { name: 'Mass Air Flow (MAF) Sensor (Tata 1916)', category: 'electrical', partCode: 'TGP-5749020301', vehicleModel: 'Tata 1916', defaultKmInterval: 60000, defaultDayInterval: 365, errorCodes: [{ code: 'P0100', desc: 'MAF Sensor Circuit Malfunction' }, { code: 'P0101', desc: 'MAF Sensor Circuit Range/Performance' }] },
  tata_sensor_nox_upstream: { name: 'Upstream NOx Sensor (Tata 1916)', category: 'electrical', partCode: 'TGP-5749020401', vehicleModel: 'Tata 1916', defaultKmInterval: 80000, defaultDayInterval: 365, errorCodes: [{ code: 'P2200', desc: 'NOx Sensor Circuit Bank 1' }, { code: 'P220A', desc: 'NOx Sensor Supply Voltage Bank 1' }] },
  tata_sensor_nox_downstream: { name: 'Downstream NOx Sensor (Tata 1916)', category: 'electrical', partCode: 'TGP-5749020402', vehicleModel: 'Tata 1916', defaultKmInterval: 80000, defaultDayInterval: 365, errorCodes: [{ code: 'P2201', desc: 'NOx Sensor Range/Performance Bank 1' }, { code: 'P229F', desc: 'NOx Sensor 2 Circuit Range/Performance' }] },
  tata_sensor_dpf_pressure: { name: 'DPF Differential Pressure Sensor (Tata 1916)', category: 'electrical', partCode: 'TGP-5749020501', vehicleModel: 'Tata 1916', defaultKmInterval: 60000, defaultDayInterval: 365, errorCodes: [{ code: 'P2452', desc: 'DPF Pressure Sensor A Circuit' }, { code: 'P2453', desc: 'DPF Pressure Sensor A Circuit Range/Performance' }] },
  tata_sensor_egt:   { name: 'Exhaust Gas Temp (EGT) Sensor (Tata 1916)', category: 'electrical', partCode: 'TGP-5749020601', vehicleModel: 'Tata 1916', defaultKmInterval: 80000, defaultDayInterval: 365, errorCodes: [{ code: 'P0544', desc: 'EGT Sensor Circuit Bank 1 Sensor 1' }, { code: 'P0546', desc: 'EGT Sensor Circuit High Bank 1 Sensor 1' }] },
  tata_sensor_rail_pressure: { name: 'Fuel Rail Pressure Sensor (Tata 1916)', category: 'electrical', partCode: 'TGP-5749020701', vehicleModel: 'Tata 1916', defaultKmInterval: 80000, defaultDayInterval: 365, errorCodes: [{ code: 'P0190', desc: 'Fuel Rail Pressure Sensor Circuit' }, { code: 'P0191', desc: 'Fuel Rail Pressure Sensor Range/Performance' }] },
  tata_sensor_coolant_temp: { name: 'Coolant Temp Sensor (ECT) (Tata 1916)', category: 'electrical', partCode: 'TGP-5749020801', vehicleModel: 'Tata 1916', defaultKmInterval: 60000, defaultDayInterval: 365, errorCodes: [{ code: 'P0117', desc: 'ECT Sensor Circuit Low Input' }, { code: 'P0118', desc: 'ECT Sensor Circuit High Input' }] },
  tata_sensor_crank_position: { name: 'Crankshaft Position Sensor (Tata 1916)', category: 'electrical', partCode: 'TGP-5749020901', vehicleModel: 'Tata 1916', defaultKmInterval: 80000, defaultDayInterval: 730, errorCodes: [{ code: 'P0335', desc: 'Crankshaft Position Sensor A Circuit Malfunction' }, { code: 'P0336', desc: 'Crankshaft Position Sensor A Circuit Range/Performance' }] },

  // BS6 Electrical Engine Sensors & Errors (Ashok Leyland 5525)
  leyland_sensor_oil_pressure: { name: 'Oil Pressure & Temp Sensor (Leyland 5525)', category: 'electrical', partCode: 'AL-FPV00400', vehicleModel: 'Leyland 5525', defaultKmInterval: 60000, defaultDayInterval: 365, errorCodes: [{ code: 'P0196', desc: 'Engine Oil Temperature Sensor Range' }, { code: 'P0198', desc: 'Engine Oil Temperature Sensor Circuit High' }] },
  leyland_sensor_nox_upstream: { name: 'Upstream NOx Sensor (Leyland 5525)', category: 'electrical', partCode: 'AL-5749020411', vehicleModel: 'Leyland 5525', defaultKmInterval: 80000, defaultDayInterval: 365, errorCodes: [{ code: 'P2200', desc: 'NOx Sensor Circuit Bank 1 Sensor 1' }, { code: 'P2202', desc: 'NOx Sensor Circuit Low Bank 1 Sensor 1' }] },
  leyland_sensor_nox_downstream: { name: 'Downstream NOx Sensor (Leyland 5525)', category: 'electrical', partCode: 'AL-5749020412', vehicleModel: 'Leyland 5525', defaultKmInterval: 80000, defaultDayInterval: 365, errorCodes: [{ code: 'P2201', desc: 'NOx Sensor Circuit Range/Performance Bank 1' }, { code: 'P229E', desc: 'NOx Sensor 2 Circuit Bank 1 Sensor 2' }] },
  leyland_sensor_dpf_pressure: { name: 'DPF Differential Pressure Sensor (Leyland 5525)', category: 'electrical', partCode: 'AL-5749020511', vehicleModel: 'Leyland 5525', defaultKmInterval: 60000, defaultDayInterval: 365, errorCodes: [{ code: 'P2452', desc: 'DPF Differential Pressure Sensor Circuit' }, { code: 'P2454', desc: 'DPF Differential Pressure Sensor Circuit Low' }] },
  leyland_sensor_egt: { name: 'Exhaust Gas Temp (EGT) Sensor (Leyland 5525)', category: 'electrical', partCode: 'AL-5749020611', vehicleModel: 'Leyland 5525', defaultKmInterval: 80000, defaultDayInterval: 365, errorCodes: [{ code: 'P0544', desc: 'Exhaust Gas Temperature Sensor Circuit Bank 1 Sensor 1' }, { code: 'P0545', desc: 'Exhaust Gas Temperature Sensor Circuit Low Bank 1' }] },
  leyland_sensor_rail_pressure: { name: 'Fuel Rail Pressure Sensor (Leyland 5525)', category: 'electrical', partCode: 'AL-5749020711', vehicleModel: 'Leyland 5525', defaultKmInterval: 80000, defaultDayInterval: 365, errorCodes: [{ code: 'P0190', desc: 'Fuel Rail Pressure Sensor Circuit Malfunction' }, { code: 'P0193', desc: 'Fuel Rail Pressure Sensor Circuit High Input' }] },
  leyland_sensor_coolant_temp: { name: 'Coolant Temp Sensor (ECT) (Leyland 5525)', category: 'electrical', partCode: 'AL-5749020811', vehicleModel: 'Leyland 5525', defaultKmInterval: 60000, defaultDayInterval: 365, errorCodes: [{ code: 'P0117', desc: 'Engine Coolant Temperature Sensor Circuit Low' }, { code: 'P0118', desc: 'Engine Coolant Temperature Sensor Circuit High' }] },
  leyland_sensor_crank_position: { name: 'Crankshaft Position Sensor (Leyland 5525)', category: 'electrical', partCode: 'AL-5749020911', vehicleModel: 'Leyland 5525', defaultKmInterval: 80000, defaultDayInterval: 730, errorCodes: [{ code: 'P0335', desc: 'Crankshaft Position Sensor Circuit Malfunction' }, { code: 'P0339', desc: 'Crankshaft Position Sensor Circuit Intermittent' }] },

  // ── BODY & GLASS ──
  windshield:        { name: 'Windshield Glass', category: 'body', defaultKmInterval: 0, defaultDayInterval: 1460 },
  side_glass_left:   { name: 'Side Glass - Left', category: 'body', defaultKmInterval: 0, defaultDayInterval: 1460 },
  side_glass_right:  { name: 'Side Glass - Right', category: 'body', defaultKmInterval: 0, defaultDayInterval: 1460 },
  rear_window:       { name: 'Rear Window Glass', category: 'body', defaultKmInterval: 0, defaultDayInterval: 1460 },
  door_lock_left:    { name: 'Door Lock - Left', category: 'body', defaultKmInterval: 0, defaultDayInterval: 730 },
  door_lock_right:   { name: 'Door Lock - Right', category: 'body', defaultKmInterval: 0, defaultDayInterval: 730 },
  wiper_left:        { name: 'Wiper - Left', category: 'body', defaultKmInterval: 0, defaultDayInterval: 180 },
  wiper_right:       { name: 'Wiper - Right', category: 'body', defaultKmInterval: 0, defaultDayInterval: 180 },
  mirror_left:       { name: 'Side Mirror - Left', category: 'body', defaultKmInterval: 0, defaultDayInterval: 730 },
  mirror_right:      { name: 'Side Mirror - Right', category: 'body', defaultKmInterval: 0, defaultDayInterval: 730 },
  cabin_damage:      { name: 'Cabin Body Damage', category: 'body', defaultKmInterval: 0, defaultDayInterval: 0 },
  tata_ac_filter:    { name: 'AC Cabin Filter (Tata 1916)', category: 'body', partCode: 'TGP-2873830201', vehicleModel: 'Tata 1916', defaultKmInterval: 20000, defaultDayInterval: 180 },
  leyland_ac_filter: { name: 'AC Cabin Filter (Leyland 5525)', category: 'body', partCode: 'AL-2873830202', vehicleModel: 'Leyland 5525', defaultKmInterval: 20000, defaultDayInterval: 180 },

  // ── TRAILER / CARGO ──
  coupling_pin:      { name: 'Coupling Pin', category: 'trailer', defaultKmInterval: 0, defaultDayInterval: 365 },
  coupling_greasing: { name: 'Coupling Pin Greasing', category: 'trailer', defaultKmInterval: 10000, defaultDayInterval: 30 },
  tarpaulin:         { name: 'Tarpaulin', category: 'trailer', defaultKmInterval: 0, defaultDayInterval: 365 },
  trailer_body:      { name: 'Trailer Body Repair', category: 'trailer', defaultKmInterval: 0, defaultDayInterval: 0 },
  landing_gear:      { name: 'Landing Gear / Jack', category: 'trailer', defaultKmInterval: 0, defaultDayInterval: 730 },
  trailer_lock:      { name: 'Trailer Lock / Pin', category: 'trailer', defaultKmInterval: 0, defaultDayInterval: 365 },

  // ── TOOLS & ACCESSORIES ──
  jack:              { name: 'Jack', category: 'tools', defaultKmInterval: 0, defaultDayInterval: 730 },
  rod:               { name: 'Rod / Wheel Spanner', category: 'tools', defaultKmInterval: 0, defaultDayInterval: 730 },
  blanket:           { name: 'Blanket', category: 'tools', defaultKmInterval: 0, defaultDayInterval: 365 },
  tool_kit:          { name: 'Tool Kit', category: 'tools', defaultKmInterval: 0, defaultDayInterval: 730 },
  fire_extinguisher: { name: 'Fire Extinguisher', category: 'tools', defaultKmInterval: 0, defaultDayInterval: 365 },

  // ── CHASSIS ──
  chassis_crack:     { name: 'Chassis Crack / Welding', category: 'chassis', defaultKmInterval: 0, defaultDayInterval: 0 },
  cross_member:      { name: 'Cross Member', category: 'chassis', defaultKmInterval: 0, defaultDayInterval: 1460 },
  fifth_wheel:       { name: 'Fifth Wheel Plate', category: 'chassis', defaultKmInterval: 0, defaultDayInterval: 730 },

  // ── DAMAGE LOG ──
  accident_damage:   { name: 'Accident / Collision Damage', category: 'damage', defaultKmInterval: 0, defaultDayInterval: 0 },
  body_dent:         { name: 'Body Dent / Scratch', category: 'damage', defaultKmInterval: 0, defaultDayInterval: 0 },
  paint_job:         { name: 'Paint / Touch Up', category: 'damage', defaultKmInterval: 0, defaultDayInterval: 0 },
};

// ── CRUD Functions ──
const createRecord = async (orgId, data) => {
  const partName = data.partId === 'custom' ? data.customPartName : (PARTS_CATALOG[data.partId]?.name || 'Unknown Part');

  const payload = {
    truckNo: String(data.truckNo || '').toUpperCase().replace(/\s/g, ''),
    partId: data.partId || '',
    partName,
    orgId,
    category: PARTS_CATALOG[data.partId]?.category || 'other',
    date: data.date || new Date().toISOString().slice(0, 10),
    kmAtChange: parseInt(data.kmAtChange) || 0,
    cost: parseFloat(data.cost) || 0,
    labourCost: parseFloat(data.labourCost) || 0,
    customIntervalKm: parseInt(data.customIntervalKm) || null,
    customIntervalDays: parseInt(data.customIntervalDays) || null,
    vendor: data.vendor || '',
    notes: data.notes || '',
    warrantyExpiry: data.warrantyExpiry || '',
    warrantyClaimed: data.warrantyClaimed === true || data.warrantyClaimed === 'true',
    quantity: parseInt(data.quantity) || 1,
    damageDescription: data.damageDescription || '',
    avgBefore: parseFloat(data.avgBefore) || 0,
    avgAfter: parseFloat(data.avgAfter) || 0,
    source: data.source || 'manual',
  };
  if (!payload.truckNo || !payload.partId) throw new Error('truckNo and partId are required');
  if (firebaseAvailable()) {
    const ref = db.collection(COLLECTION).doc();
    await ref.set({ ...payload, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    return { id: ref.id, ...payload };
  }
  return localStore.insert(COLLECTION, payload);
};

const getByTruckNo = async (orgId, truckNo) => {
  const n = String(truckNo).toUpperCase().replace(/\s/g, '');
  if (firebaseAvailable()) {
    const s = await db.collection(COLLECTION)
      .where('orgId', '==', orgId)
      .where('truckNo', '==', n)
      .get();
    const docs = s.docs.map(d => ({ id: d.id, ...d.data() }));
    return docs.sort((a, b) => new Date(b.date) - new Date(a.date));
  }
  return localStore.getAll(COLLECTION)
    .filter(r => r.orgId === orgId && r.truckNo === n)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
};

const getAll = async (orgId) => {
  if (firebaseAvailable()) {
    const s = await db.collection(COLLECTION)
      .where('orgId', '==', orgId)
      .get();
    const docs = s.docs.map(d => ({ id: d.id, ...d.data() }));
    return docs.sort((a, b) => new Date(b.date) - new Date(a.date));
  }
  return localStore.getAll(COLLECTION)
    .filter(r => r.orgId === orgId)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
};

const updateRecord = async (id, data) => {
  const patch = { ...data }; delete patch.id; delete patch.createdAt;
  if (firebaseAvailable()) {
    await db.collection(COLLECTION).doc(id).update({ ...patch, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  } else { localStore.update(COLLECTION, id, patch); }
};

const deleteRecord = async (id) => {
  if (firebaseAvailable()) { await db.collection(COLLECTION).doc(id).delete(); }
  else { localStore.delete(COLLECTION, id); }
};

const getMaintenanceSummary = async (orgId, truckNo) => {
  const records = await getByTruckNo(orgId, truckNo);
  const summary = {};
  // Track recurring damages
  const damageCount = {};
  for (const r of records) {
    damageCount[r.partId] = (damageCount[r.partId] || 0) + 1;
    if (!summary[r.partId]) {
      const cat = PARTS_CATALOG[r.partId] || {};
      const daysSince = Math.floor((Date.now() - new Date(r.date).getTime()) / (1000*60*60*24));
      const daysInterval = cat.defaultDayInterval || 365;
      const daysRemaining = daysInterval > 0 ? daysInterval - daysSince : 999;
      summary[r.partId] = {
        partId: r.partId, partName: r.partName, category: r.category,
        lastServiceDate: r.date, lastServiceKm: r.kmAtChange,
        cost: r.cost, labourCost: r.labourCost || 0, vendor: r.vendor,
        warrantyExpiry: r.warrantyExpiry, warrantyClaimed: r.warrantyClaimed,
        quantity: r.quantity || 1,
        daysSinceService: daysSince, daysRemaining,
        kmInterval: cat.defaultKmInterval || 0,
        status: daysRemaining < 0 ? 'overdue' : daysRemaining < 30 ? 'due_soon' : 'ok',
        totalRecords: 0, recurring: false,
        avgBefore: r.avgBefore, avgAfter: r.avgAfter,
        damageDescription: r.damageDescription,
      };
    }
  }
  // Mark recurring & total
  for (const [partId, count] of Object.entries(damageCount)) {
    if (summary[partId]) {
      summary[partId].totalRecords = count;
      summary[partId].recurring = count >= 3;
    }
  }
  return summary;
};

const getMaintenanceAlerts = async (orgId) => {
  const allRecords = await getAll(orgId);
  const alerts = {};
  for (const r of allRecords) {
    const key = `${r.truckNo}_${r.partId}`;
    if (!alerts[key]) {
      const partInfo = PARTS_CATALOG[r.partId];
      if (!partInfo) continue;

      // Check for custom intervals in the latest record
      const kmInterval = r.customIntervalKm !== undefined && r.customIntervalKm !== null 
        ? r.customIntervalKm 
        : partInfo.defaultKmInterval;
      
      const dayInterval = r.customIntervalDays !== undefined && r.customIntervalDays !== null 
        ? r.customIntervalDays 
        : partInfo.defaultDayInterval;

      let status = 'ok';
      let daysRemaining = null;

      const daysSince = Math.floor((Date.now() - new Date(r.date).getTime()) / (1000*60*60*24));
      
      if (dayInterval > 0) {
        daysRemaining = dayInterval - daysSince;
        if (daysRemaining <= 0) status = 'overdue';
        else if (status !== 'overdue' && daysRemaining < dayInterval * 0.15) status = 'due_soon';
      }
      
      if (status !== 'ok') {
        alerts[key] = { truckNo: r.truckNo, partName: r.partName, lastServiceDate: r.date, daysRemaining, status: status.toUpperCase() };
      }
    }
  }
  return Object.values(alerts);
};

module.exports = { PARTS_CATALOG, createRecord, getByTruckNo, getAll, updateRecord, deleteRecord, getMaintenanceSummary, getMaintenanceAlerts };
