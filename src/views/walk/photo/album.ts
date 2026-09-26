// 相册 · the last twelve photographs taken in the painting, kept in IndexedDB (the picture and a
// thumbnail, as bytes: Safari has been shy of storing Blobs). Where IndexedDB cannot be had — a
// sandboxed frame, a private window, storage refused — the album lives for the session only.

export interface AlbumPhoto {
  id: string;
  /** When it was taken (ms). */
  at: number;
  name: string;
  w: number;
  h: number;
  blob: Blob;
  thumb: Blob;
}

interface Row { id: string; at: number; name: string; w: number; h: number; type: string; data: ArrayBuffer; thumbType: string; thumb: ArrayBuffer }

export const ALBUM_KEEP = 12;
const DB = 'banmu-photos';
const STORE = 'photos';

let dbp: Promise<IDBDatabase | null> | null = null;
/** The photos of this session when there is no database. */
const memory: AlbumPhoto[] = [];

function openDb(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise<IDBDatabase | null>((resolve) => {
    let idb: IDBFactory | undefined;
    try { idb = globalThis.indexedDB; } catch { idb = undefined; }
    if (!idb) { resolve(null); return; }
    let req: IDBOpenDBRequest;
    try { req = idb.open(DB, 1); } catch { resolve(null); return; }
    const timer = setTimeout(() => resolve(null), 3000);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => { clearTimeout(timer); resolve(req.result); };
    req.onerror = () => { clearTimeout(timer); resolve(null); };
    req.onblocked = () => { clearTimeout(timer); resolve(null); };
  });
  return dbp;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function all(db: IDBDatabase): Promise<Row[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as Row[]);
    req.onerror = () => reject(req.error);
  });
}

const toPhoto = (r: Row): AlbumPhoto => ({
  id: r.id, at: r.at, name: r.name, w: r.w, h: r.h,
  blob: new Blob([r.data], { type: r.type }),
  thumb: new Blob([r.thumb], { type: r.thumbType }),
});

/** Newest first. */
export async function listPhotos(): Promise<AlbumPhoto[]> {
  const db = await openDb();
  if (!db) return memory.slice();
  try {
    const rows = await all(db);
    return rows.sort((a, b) => b.at - a.at).slice(0, ALBUM_KEEP).map(toPhoto);
  } catch {
    return memory.slice();
  }
}

/** Keep a photograph (the oldest beyond twelve go). Returns whether it was stored to last beyond the session. */
export async function addPhoto(p: Omit<AlbumPhoto, 'id'>): Promise<boolean> {
  const id = `${p.at.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const photo: AlbumPhoto = { ...p, id };
  memory.unshift(photo);
  memory.splice(ALBUM_KEEP);
  const db = await openDb();
  if (!db) return false;
  try {
    const row: Row = { id, at: p.at, name: p.name, w: p.w, h: p.h, type: p.blob.type, data: await p.blob.arrayBuffer(), thumbType: p.thumb.type, thumb: await p.thumb.arrayBuffer() };
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(row);
    await done(tx);
    // trim to the newest twelve
    const rows = await all(db);
    if (rows.length > ALBUM_KEEP) {
      const old = rows.sort((a, b) => b.at - a.at).slice(ALBUM_KEEP);
      const t2 = db.transaction(STORE, 'readwrite');
      for (const r of old) t2.objectStore(STORE).delete(r.id);
      await done(t2);
    }
    return true;
  } catch {
    return false;
  }
}

export async function removePhoto(id: string): Promise<void> {
  const i = memory.findIndex((m) => m.id === id);
  if (i >= 0) memory.splice(i, 1);
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    await done(tx);
  } catch { /* already gone */ }
}

/** Whether the album outlives the session here. */
export async function albumLasts(): Promise<boolean> {
  return (await openDb()) !== null;
}
