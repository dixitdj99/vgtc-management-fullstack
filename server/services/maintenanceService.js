const { db, admin, isAvailable } = require('../firebase');
const localStore = require('../utils/localStore');
const firebaseAvailable = () => isAvailable();
const COLLECTION = 'vehicle_maintenance';

// Comprehensive Parts Catalog with Brands and default intervals
const PARTS_CATALOG = {

  // ── FLUIDS ──
  coolant:           { name: 'Coolant / Antifreeze', category: 'fluids', defaultKmInterval: 40000, defaultDayInterval: 365 },
  urea_def:          { name: 'Urea / DEF Fluid', category: 'fluids', defaultKmInterval: 5000, defaultDayInterval: 30 },
  brake_fluid:       { name: 'Brake Fluid', category: 'fluids', defaultKmInterval: 50000, defaultDayInterval: 365 },
  power_steering_fluid: { name: 'Power Steering Fluid', category: 'fluids', defaultKmInterval: 60000, defaultDayInterval: 730 },

  // ── TRANSMISSION & DRIVETRAIN ──
  gear_oil:          { name: 'Gear Oil (Gearbox)', category: 'transmission', defaultKmInterval: 40000, defaultDayInterval: 180 },
  crown_oil:         { name: 'Crown Oil (Differential)', category: 'transmission', defaultKmInterval: 40000, defaultDayInterval: 180 },
  clutch_plate:      { name: 'Clutch Plate', category: 'transmission', defaultKmInterval: 100000, defaultDayInterval: 730 },
  clutch_bearing:    { name: 'Clutch Bearing', category: 'transmission', defaultKmInterval: 80000, defaultDayInterval: 730 },
  propeller_shaft:   { name: 'Propeller Shaft', category: 'transmission', defaultKmInterval: 0, defaultDayInterval: 1095 },
  crown_wheel:       { name: 'Crown Wheel', category: 'transmission', defaultKmInterval: 200000, defaultDayInterval: 1460 },
  pinion:            { name: 'Pinion', category: 'transmission', defaultKmInterval: 200000, defaultDayInterval: 1460 },
  main_shaft:        { name: 'Main Shaft', category: 'transmission', defaultKmInterval: 0, defaultDayInterval: 1460 },

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
const createRecord = async (data) => {
  const partName = data.partId === 'custom' ? data.customPartName : (PARTS_CATALOG[data.partId]?.name || 'Unknown Part');

  const payload = {
    truckNo: String(data.truckNo || '').toUpperCase().replace(/\s/g, ''),
    partId: data.partId || '',
    partName,
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

const getByTruckNo = async (truckNo) => {
  const n = String(truckNo).toUpperCase().replace(/\s/g, '');
  if (firebaseAvailable()) {
    const s = await db.collection(COLLECTION).where('truckNo', '==', n).orderBy('date', 'desc').get();
    return s.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  return localStore.getAll(COLLECTION).filter(r => r.truckNo === n).sort((a, b) => new Date(b.date) - new Date(a.date));
};

const getAll = async () => {
  if (firebaseAvailable()) {
    const s = await db.collection(COLLECTION).orderBy('date', 'desc').get();
    return s.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  return localStore.getAll(COLLECTION).sort((a, b) => new Date(b.date) - new Date(a.date));
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

const getMaintenanceSummary = async (truckNo) => {
  const records = await getByTruckNo(truckNo);
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

const getMaintenanceAlerts = async () => {
  const allRecords = await getAll();
  const alerts = {};
  for (const r of allRecords) {
    const key = `${r.truckNo}_${r.partId}`;
    if (!alerts[key]) {
      const partInfo = PARTS_CATALOG[r.partId];
      if (!partInfo) return;

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
