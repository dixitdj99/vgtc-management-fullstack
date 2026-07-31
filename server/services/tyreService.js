const { db, admin, isAvailable } = require('../firebase');
const localStore = require('../utils/localStore');
const firebaseAvailable = () => isAvailable();
const COLLECTION = 'tyres';

const createTyre = async (orgId, data) => {
  const payload = {
    orgId,
    serialNo: String(data.serialNo || '').trim().toUpperCase(),
    brand: data.brand || '',
    size: data.size || '',
    type: data.type || 'new', // new, retread, old
    purchasePrice: parseFloat(data.purchasePrice) || 0,
    purchaseDate: data.purchaseDate || new Date().toISOString().slice(0, 10),
    status: 'available', // available, fitted, scrapped, retreading
    fitment: null,
    rotationHistory: [],
    totalKmRun: 0,
    notes: data.notes || '',
    createdAt: new Date().toISOString()
  };

  if (!payload.serialNo) throw new Error('Tyre serial number is required');

  if (firebaseAvailable()) {
    // Check for duplicate serialNo in this org
    const dup = await db.collection(COLLECTION)
      .where('orgId', '==', orgId)
      .where('serialNo', '==', payload.serialNo)
      .get();
    if (!dup.empty) throw new Error(`Tyre with Serial No "${payload.serialNo}" already exists.`);

    const ref = db.collection(COLLECTION).doc();
    await ref.set({ ...payload, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    return { id: ref.id, ...payload };
  } else {
    const existing = localStore.getAll(COLLECTION).find(t => t.orgId === orgId && t.serialNo === payload.serialNo);
    if (existing) throw new Error(`Tyre with Serial No "${payload.serialNo}" already exists.`);
    return localStore.insert(COLLECTION, payload);
  }
};

const getAllTyres = async (orgId) => {
  if (firebaseAvailable()) {
    const snapshot = await db.collection(COLLECTION)
      .where('orgId', '==', orgId)
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }
  return localStore.getAll(COLLECTION).filter(t => t.orgId === orgId);
};

const getTyreById = async (orgId, id) => {
  if (firebaseAvailable()) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    if (!doc.exists || doc.data().orgId !== orgId) throw new Error('Tyre not found');
    return { id: doc.id, ...doc.data() };
  }
  const t = localStore.getById(COLLECTION, id);
  if (!t || t.orgId !== orgId) throw new Error('Tyre not found');
  return t;
};

const fitTyre = async (orgId, id, data) => {
  const { truckNo, position, fittedAtKm, fittedDate } = data;
  if (!truckNo || !position || fittedAtKm === undefined || !fittedDate) {
    throw new Error('Missing fitment details (truckNo, position, fittedAtKm, fittedDate)');
  }

  const cleanTruck = String(truckNo).toUpperCase().replace(/\s/g, '');

  if (firebaseAvailable()) {
    // Check if another tyre is already fitted to the same position on this truck
    const occupied = await db.collection(COLLECTION)
      .where('orgId', '==', orgId)
      .where('status', '==', 'fitted')
      .where('fitment.truckNo', '==', cleanTruck)
      .where('fitment.position', '==', position)
      .get();
    if (!occupied.empty) {
      const occupiedTyre = occupied.docs[0].data();
      throw new Error(`Position "${position}" on vehicle "${cleanTruck}" is already occupied by Tyre Serial No "${occupiedTyre.serialNo}".`);
    }

    const ref = db.collection(COLLECTION).doc(id);
    const tyreDoc = await ref.get();
    if (!tyreDoc.exists || tyreDoc.data().orgId !== orgId) throw new Error('Tyre not found');
    const tyre = tyreDoc.data();

    if (tyre.status !== 'available') throw new Error(`Tyre is currently "${tyre.status}" and cannot be fitted.`);

    const fitment = {
      truckNo: cleanTruck,
      position,
      fittedAtKm: parseInt(fittedAtKm) || 0,
      fittedDate
    };

    await ref.update({
      status: 'fitted',
      fitment,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return { id, ...tyre, status: 'fitted', fitment };
  } else {
    // Local fallback
    const tyres = localStore.getAll(COLLECTION).filter(t => t.orgId === orgId && t.status === 'fitted' && t.fitment?.truckNo === cleanTruck && t.fitment?.position === position);
    if (tyres.length > 0) {
      throw new Error(`Position "${position}" on vehicle "${cleanTruck}" is already occupied.`);
    }

    const tyre = localStore.getById(COLLECTION, id);
    if (!tyre || tyre.orgId !== orgId) throw new Error('Tyre not found');
    if (tyre.status !== 'available') throw new Error(`Tyre is currently "${tyre.status}"`);

    const fitment = {
      truckNo: cleanTruck,
      position,
      fittedAtKm: parseInt(fittedAtKm) || 0,
      fittedDate
    };
    const patch = { status: 'fitted', fitment };
    localStore.update(COLLECTION, id, patch);
    return { ...tyre, ...patch };
  }
};

const removeTyre = async (orgId, id, data) => {
  const { removalDate, removalKm, nextStatus } = data; // nextStatus: available, scrapped, retreading
  if (!removalDate || removalKm === undefined || !nextStatus) {
    throw new Error('Missing removal details (removalDate, removalKm, nextStatus)');
  }

  if (firebaseAvailable()) {
    const ref = db.collection(COLLECTION).doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().orgId !== orgId) throw new Error('Tyre not found');
    const tyre = doc.data();

    if (tyre.status !== 'fitted' || !tyre.fitment) throw new Error('Tyre is not currently fitted to any vehicle.');

    const kmRun = Math.max(0, (parseInt(removalKm) || 0) - tyre.fitment.fittedAtKm);
    const historyEntry = {
      ...tyre.fitment,
      removedDate: removalDate,
      removedAtKm: parseInt(removalKm) || 0,
      kmRun
    };

    const rotationHistory = [...(tyre.rotationHistory || []), historyEntry];
    const totalKmRun = (tyre.totalKmRun || 0) + kmRun;

    const patch = {
      status: nextStatus,
      fitment: null,
      rotationHistory,
      totalKmRun,
      scrapDate: nextStatus === 'scrapped' ? removalDate : null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await ref.update(patch);
    return { id, ...tyre, ...patch };
  } else {
    const tyre = localStore.getById(COLLECTION, id);
    if (!tyre || tyre.orgId !== orgId) throw new Error('Tyre not found');
    if (tyre.status !== 'fitted' || !tyre.fitment) throw new Error('Tyre is not fitted');

    const kmRun = Math.max(0, (parseInt(removalKm) || 0) - tyre.fitment.fittedAtKm);
    const historyEntry = {
      ...tyre.fitment,
      removedDate: removalDate,
      removedAtKm: parseInt(removalKm) || 0,
      kmRun
    };

    const rotationHistory = [...(tyre.rotationHistory || []), historyEntry];
    const totalKmRun = (tyre.totalKmRun || 0) + kmRun;

    const patch = {
      status: nextStatus,
      fitment: null,
      rotationHistory,
      totalKmRun,
      scrapDate: nextStatus === 'scrapped' ? removalDate : null
    };

    localStore.update(COLLECTION, id, patch);
    return { ...tyre, ...patch };
  }
};

const retreadTyre = async (orgId, id, data) => {
  const { retreadDate, retreadCost, retreaderName, notes } = data;
  if (!retreadDate) throw new Error('Retread date is required');

  if (firebaseAvailable()) {
    const ref = db.collection(COLLECTION).doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().orgId !== orgId) throw new Error('Tyre not found');
    const tyre = doc.data();

    if (tyre.status !== 'retreading' && tyre.status !== 'available') {
      throw new Error(`Tyre is currently "${tyre.status}" and cannot be retreaded.`);
    }

    const price = (tyre.purchasePrice || 0) + (parseFloat(retreadCost) || 0);

    const patch = {
      status: 'available',
      type: 'retread',
      purchasePrice: price,
      notes: `${tyre.notes || ''}\nRetreaded on ${retreadDate} by ${retreaderName || 'Unknown'} (Cost: ₹${retreadCost || 0}). ${notes || ''}`.trim(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await ref.update(patch);
    return { id, ...tyre, ...patch };
  } else {
    const tyre = localStore.getById(COLLECTION, id);
    if (!tyre || tyre.orgId !== orgId) throw new Error('Tyre not found');
    if (tyre.status !== 'retreading' && tyre.status !== 'available') throw new Error('Cannot retread tyre');

    const price = (tyre.purchasePrice || 0) + (parseFloat(retreadCost) || 0);

    const patch = {
      status: 'available',
      type: 'retread',
      purchasePrice: price,
      notes: `${tyre.notes || ''}\nRetreaded on ${retreadDate} by ${retreaderName || 'Unknown'} (Cost: ₹${retreadCost || 0}). ${notes || ''}`.trim()
    };
    localStore.update(COLLECTION, id, patch);
    return { ...tyre, ...patch };
  }
};

const scrapTyre = async (orgId, id, data) => {
  const { scrapDate, notes } = data;
  const sDate = scrapDate || new Date().toISOString().slice(0, 10);

  if (firebaseAvailable()) {
    const ref = db.collection(COLLECTION).doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().orgId !== orgId) throw new Error('Tyre not found');
    const tyre = doc.data();

    const patch = {
      status: 'scrapped',
      scrapDate: sDate,
      notes: `${tyre.notes || ''}\nScrapped on ${sDate}. ${notes || ''}`.trim(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await ref.update(patch);
    return { id, ...tyre, ...patch };
  } else {
    const tyre = localStore.getById(COLLECTION, id);
    if (!tyre || tyre.orgId !== orgId) throw new Error('Tyre not found');

    const patch = {
      status: 'scrapped',
      scrapDate: sDate,
      notes: `${tyre.notes || ''}\nScrapped on ${sDate}. ${notes || ''}`.trim()
    };
    localStore.update(COLLECTION, id, patch);
    return { ...tyre, ...patch };
  }
};

const deleteTyre = async (orgId, id) => {
  if (firebaseAvailable()) {
    const ref = db.collection(COLLECTION).doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().orgId !== orgId) throw new Error('Tyre not found');
    await ref.delete();
  } else {
    const tyre = localStore.getById(COLLECTION, id);
    if (!tyre || tyre.orgId !== orgId) throw new Error('Tyre not found');
    localStore.delete(COLLECTION, id);
  }
};

module.exports = {
  createTyre,
  getAllTyres,
  getTyreById,
  fitTyre,
  removeTyre,
  retreadTyre,
  scrapTyre,
  deleteTyre
};
