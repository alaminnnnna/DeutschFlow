/**
 * Minimal promise-based IndexedDB wrapper.
 *
 * Stores:
 *   - `cache`  → versioned translation / pronunciation results (CacheEntry)
 *   - `vocab`  → saved vocabulary (VocabEntry, keyed by id)
 *   - `kv`     → small structured values (stats, misc)
 *
 * When IndexedDB is unavailable (SSR, private mode in some browsers) every
 * function transparently falls back to an in-memory Map so the app keeps
 * working — the UI clearly labels storage as session-only in that case.
 */

const DB_NAME = 'deutschflow';
const DB_VERSION = 1;

export type StoreName = 'cache' | 'vocab' | 'kv';

interface CacheRecord {
  key: string;
  value: unknown;
  createdAt: number;
  expiresAt: number;
  version: string;
}

function openDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = window.indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('vocab')) db.createObjectStore('vocab', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

/** In-memory fallback used when IndexedDB is not available. */
const memory = new Map<string, unknown>();
const memKey = (store: StoreName, key: string) => `${store}::${key}`;

function withStore<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  run: (os: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | null> {
  return openDB().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        let result: T | null = null;
        try {
          const tx = db.transaction(store, mode);
          const os = tx.objectStore(store);
          const req = run(os);
          if (req) {
            req.onsuccess = () => {
              result = req.result;
            };
          }
          tx.oncomplete = () => resolve(result);
          tx.onerror = () => resolve(null);
          tx.onabort = () => resolve(null);
        } catch {
          resolve(null);
        }
      })
  );
}

// ── Cache store (keyPath records) ────────────────────────────────────

export async function cacheGet(key: string): Promise<CacheRecord | null> {
  const rec = await withStore<CacheRecord>('cache', 'readonly', (os) => os.get(key));
  if (rec) return rec;
  return (memory.get(memKey('cache', key)) as CacheRecord) ?? null;
}

export async function cachePut(record: CacheRecord): Promise<void> {
  memory.set(memKey('cache', record.key), record);
  await withStore('cache', 'readwrite', (os) => os.put(record));
}

export async function cacheDelete(key: string): Promise<void> {
  memory.delete(memKey('cache', key));
  await withStore('cache', 'readwrite', (os) => os.delete(key));
}

export async function cacheClear(): Promise<void> {
  for (const k of Array.from(memory.keys())) {
    if (k.startsWith('cache::')) memory.delete(k);
  }
  await withStore('cache', 'readwrite', (os) => os.clear());
}

export async function cacheCount(): Promise<number> {
  const n = await withStore<number>('cache', 'readonly', (os) => os.count());
  if (typeof n === 'number') return n;
  let count = 0;
  for (const k of memory.keys()) if (k.startsWith('cache::')) count += 1;
  return count;
}

// ── Generic key/value store ──────────────────────────────────────────

export async function kvGet<T>(key: string): Promise<T | null> {
  const v = await withStore<T>('kv', 'readonly', (os) => os.get(key));
  if (v !== null && v !== undefined) return v;
  return (memory.get(memKey('kv', key)) as T) ?? null;
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  memory.set(memKey('kv', key), value);
  await withStore('kv', 'readwrite', (os) => {
    os.put(value, key);
  });
}

export async function kvDelete(key: string): Promise<void> {
  memory.delete(memKey('kv', key));
  await withStore('kv', 'readwrite', (os) => os.delete(key));
}

// ── Vocabulary store (keyPath id) ────────────────────────────────────

export async function vocabGetAll<T>(): Promise<T[]> {
  const all = await withStore<T[]>('vocab', 'readonly', (os) => os.getAll());
  return all ?? ((memory.get(memKey('vocab', '*')) as T[]) ?? []);
}

export async function vocabPut<T extends { id: string }>(entry: T): Promise<void> {
  const all = (memory.get(memKey('vocab', '*')) as T[] | undefined) ?? [];
  const idx = all.findIndex((e) => e.id === entry.id);
  if (idx >= 0) all[idx] = entry;
  else all.push(entry);
  memory.set(memKey('vocab', '*'), all);
  await withStore('vocab', 'readwrite', (os) => os.put(entry));
}

export async function vocabDelete(id: string): Promise<void> {
  const all = (memory.get(memKey('vocab', '*')) as Array<{ id: string }> | undefined) ?? [];
  memory.set(memKey('vocab', '*'), all.filter((e) => e.id !== id));
  await withStore('vocab', 'readwrite', (os) => os.delete(id));
}

export async function vocabClear(): Promise<void> {
  memory.set(memKey('vocab', '*'), []);
  await withStore('vocab', 'readwrite', (os) => os.clear());
}

export function idbAvailable(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}
