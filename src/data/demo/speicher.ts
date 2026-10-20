/**
 * The public demo keeps each visitor's copy in their own browser (IndexedDB), so it survives a reload; nothing
 * reaches a server. Kept apart from the seed, so the demo bar can reset without loading the sample data.
 */

const DATENBANK = 'velonify-hub-demo';
const TABELLE = 'stand';
const SCHLUESSEL = 'stand';

/** Demo settings of this browser besides the data: chosen role, tour progress, who you are. */
export const DEMO_EINSTELLUNGEN = {
  rolle: 'velonify-demo.rolle',
  tour: 'velonify-demo.tour',
} as const;
const ICH_KEY = 'velonify-crm.ich';

let gesperrt = false;
// One connection for the whole visit, so a save when the tab closes does not wait for opening it.
let verbindung: Promise<IDBDatabase> | null = null;

function oeffne(): Promise<IDBDatabase> {
  verbindung ??= new Promise<IDBDatabase>((resolve, reject) => {
    const anfrage = indexedDB.open(DATENBANK, 1);
    anfrage.onupgradeneeded = () => anfrage.result.createObjectStore(TABELLE);
    anfrage.onsuccess = () => resolve(anfrage.result);
    anfrage.onerror = () => reject(anfrage.error);
  }).catch((err: unknown) => {
    verbindung = null;
    throw err;
  });
  return verbindung;
}

async function vorgang<T>(modus: IDBTransactionMode, aktion: (tabelle: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await oeffne();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(TABELLE, modus);
    const anfrage = aktion(tx.objectStore(TABELLE));
    tx.oncomplete = () => resolve(anfrage.result as T);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** The saved copy, or null (none yet, private window, storage blocked). */
export async function ladeGespeichert<T>(): Promise<T | null> {
  try {
    return (await vorgang<T | undefined>('readonly', (t) => t.get(SCHLUESSEL))) ?? null;
  } catch {
    return null;
  }
}

/** Saves the copy; fails silently, the demo then simply starts fresh next time. */
export async function speichere(stand: unknown): Promise<void> {
  if (gesperrt) return;
  try {
    await vorgang('readwrite', (t) => t.put(stand, SCHLUESSEL));
  } catch {
    // Storage blocked or full: the demo keeps working in memory.
  }
}

/** Deletes the saved copy and the demo settings, then starts over with fresh sample data. */
export async function demoZuruecksetzen(): Promise<void> {
  // Writes still waiting must not bring the old copy back.
  gesperrt = true;
  try {
    await vorgang('readwrite', (t) => t.delete(SCHLUESSEL));
  } catch {
    // Nothing saved or storage blocked: the reload starts over anyway.
  }
  try {
    for (const key of [...Object.values(DEMO_EINSTELLUNGEN), ICH_KEY]) localStorage.removeItem(key);
  } catch {
    // Storage blocked: nothing was remembered.
  }
  // Fresh sample data gets fresh ids: start on the home page, not on a record that no longer exists.
  window.location.replace(window.location.pathname + window.location.search);
}
