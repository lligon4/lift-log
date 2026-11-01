const DB_NAME = 'fitness-tracker';
const DB_VERSION = 2;

let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('exercises')) db.createObjectStore('exercises', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('workouts')) {
          const ws = db.createObjectStore('workouts', { keyPath: 'id' });
          ws.createIndex('date', 'date');
        }
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('templates')) db.createObjectStore('templates', { keyPath: 'id' });
      };
      // An older copy of the app open in another tab/window holds the old version.
      req.onblocked = () => alert('Lift Log is open somewhere else. Close it there to finish updating.');
      req.onsuccess = () => {
        const db = req.result;
        // A newer copy needs to upgrade: step aside and reload into the new version.
        db.onversionchange = () => { db.close(); location.reload(); };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name, mode = 'readonly') {
  const db = await open();
  return db.transaction(name, mode).objectStore(name);
}

export async function get(name, id) {
  return wrap((await store(name)).get(id));
}

export async function getAll(name) {
  return wrap((await store(name)).getAll());
}

export async function put(name, value) {
  return wrap((await store(name, 'readwrite')).put(value));
}

export async function del(name, id) {
  return wrap((await store(name, 'readwrite')).delete(id));
}

export async function putMany(name, values) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, 'readwrite');
    const s = tx.objectStore(name);
    values.forEach((v) => s.put(v));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Small key/value helpers backed by the "meta" store.
export async function getMeta(key) {
  const row = await get('meta', key);
  return row ? row.value : undefined;
}

export async function setMeta(key, value) {
  return put('meta', { key, value });
}

export async function exportAll() {
  return {
    app: 'fitness-tracker',
    schema: DB_VERSION,
    exportedAt: new Date().toISOString(),
    exercises: await getAll('exercises'),
    workouts: await getAll('workouts'),
    templates: await getAll('templates'),
  };
}

// mode: 'replace' wipes existing exercises/workouts first; 'merge' upserts by id.
// Templates are only replaced when the file has them (pre-v1.2 exports don't).
export async function importAll(data, mode = 'merge') {
  if (!data || !Array.isArray(data.exercises) || !Array.isArray(data.workouts)) {
    throw new Error('File is not a fitness-tracker export.');
  }
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['exercises', 'workouts', 'templates', 'meta'], 'readwrite');
    const ex = tx.objectStore('exercises');
    const wo = tx.objectStore('workouts');
    const tp = tx.objectStore('templates');
    const templates = Array.isArray(data.templates) ? data.templates : null;
    if (mode === 'replace') {
      ex.clear();
      wo.clear();
      if (templates) tp.clear();
      tx.objectStore('meta').delete('activeWorkoutId');
    }
    data.exercises.forEach((e) => ex.put(e));
    data.workouts.forEach((w) => wo.put(w));
    templates?.forEach((t) => tp.put(t));
    tx.oncomplete = () => resolve({ exercises: data.exercises.length, workouts: data.workouts.length });
    tx.onerror = () => reject(tx.error);
  });
}

