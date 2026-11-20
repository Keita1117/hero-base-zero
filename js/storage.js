import {
  createDefaultState,
  getLocalDateKey,
  sanitizeProfile,
} from './core.js';

const STORAGE_KEY = 'hero_base_zero_state_v1';
const DB_NAME = 'HeroBaseZeroMediaDB';
const DB_VERSION = 1;
const STORES = ['scans', 'drawings'];

const memoryMediaFallback = {
  scans: new Map(),
  drawings: new Map(),
};

function normalizeStoreName(storeName) {
  return STORES.includes(storeName) ? storeName : 'scans';
}

function createRecordId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function rollDailyStateIfNeeded(state, todayKey = getLocalDateKey()) {
  if (state.dailyDate === todayKey) return state;
  return {
    ...state,
    dailyDate: todayKey,
    dailyHabitLog: {},
    missionProgress: {},
    claimedMissions: {},
  };
}

export function loadState() {
  try {
    const rawText = window.localStorage.getItem(STORAGE_KEY);
    if (!rawText) {
      return createDefaultState();
    }
    const parsed = JSON.parse(rawText);
    return rollDailyStateIfNeeded(sanitizeProfile(parsed));
  } catch {
    return createDefaultState();
  }
}

export function saveState(state) {
  const clean = sanitizeProfile(state);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // Ignore storage quota errors gracefully
  }
  return clean;
}

export function resetStateStorage() {
  const fresh = createDefaultState();
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  } catch {
    // Ignore
  }
  return fresh;
}

export function exportStateJson(state) {
  return JSON.stringify(sanitizeProfile(state), null, 2);
}

export function importStateJson(jsonText) {
  const cleanText = String(jsonText ?? '').replace(/^\uFEFF+/, '').trim();
  if (cleanText.length > 2_000_000) {
    throw new Error('JSONサイズが大きすぎます');
  }
  const parsed = JSON.parse(cleanText);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JSONオブジェクトではありません');
  }
  return rollDailyStateIfNeeded(sanitizeProfile(parsed));
}

function openMediaDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' });
        }
      }
    };
    req.onblocked = () => reject(new Error('IndexedDB upgrade blocked'));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
}

export async function saveMediaItem(storeName, item) {
  const safeStore = normalizeStoreName(storeName);
  const record = {
    ...item,
    id: item.id !== undefined && item.id !== null && item.id !== '' ? item.id : createRecordId(safeStore),
    createdAt: item.createdAt || Date.now(),
  };

  let db = null;
  try {
    db = await openMediaDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(safeStore, 'readwrite');
      tx.objectStore(safeStore).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    memoryMediaFallback[safeStore].set(record.id, record);
  } finally {
    if (db) db.close();
  }
  return record;
}

export async function listMediaItems(storeName) {
  const safeStore = normalizeStoreName(storeName);
  let db = null;
  try {
    db = await openMediaDb();
    const items = await new Promise((resolve, reject) => {
      const tx = db.transaction(safeStore, 'readonly');
      const req = tx.objectStore(safeStore).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    return items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } catch {
    return [...memoryMediaFallback[safeStore].values()].sort(
      (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
    );
  } finally {
    if (db) db.close();
  }
}

export async function deleteMediaItem(storeName, id) {
  const safeStore = normalizeStoreName(storeName);
  let db = null;
  try {
    db = await openMediaDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(safeStore, 'readwrite');
      tx.objectStore(safeStore).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    memoryMediaFallback[safeStore].delete(id);
  } finally {
    if (db) db.close();
  }
}

export async function clearAllMedia() {
  for (const storeName of STORES) {
    memoryMediaFallback[storeName].clear();
  }
  let db = null;
  try {
    db = await openMediaDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORES, 'readwrite');
      for (const storeName of STORES) {
        tx.objectStore(storeName).clear();
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore
  } finally {
    if (db) db.close();
  }
}
