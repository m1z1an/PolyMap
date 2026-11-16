import { openDB } from 'idb';
import type { Bundle, Snapshot } from './model';

type Manifest = { version: string; url: string };
const bundled = '/maps/manifest.json';
const api = process.env.EXPO_PUBLIC_API_URL ?? '';

async function json<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-cache', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function loadSnapshot(): Promise<Snapshot> {
  const db = await openDB('polymap', 1, {
    upgrade(database) { database.createObjectStore('maps'); },
  }).catch(() => null);
  let cached: Snapshot | undefined;
  try {
    if (db) {
      const tx = db.transaction('maps');
      const version = await tx.store.get('active') as string | undefined;
      if (version) {
        const meta = await tx.store.get([`campus`, version]) as Omit<Bundle, 'buildings'> & { buildingIds: string[] };
        const buildings = await Promise.all(meta.buildingIds.map(id => tx.store.get([id, version])));
        cached = { version, data: { ...meta, buildings } };
      }
    }
  } catch {
    // The packaged map remains available if browser storage is disabled.
  }
  try {
    const manifest = await json<Manifest>(`${api}/api/maps/current`).catch(() => json<Manifest>(bundled));
    if (cached?.version === manifest.version) return cached;
    const url = manifest.url.startsWith('/api/') ? api + manifest.url : manifest.url;
    const data = await json<Bundle>(url);
    if (!data.revision || !data.buildings?.length || !data.places?.length || !data.nodes?.length) {
      throw new Error('Неполный пакет карты');
    }
    if (db) {
      try {
        const tx = db.transaction('maps', 'readwrite');
        const { buildings, ...campus } = data;
        await tx.store.clear();
        await Promise.all([
          ...buildings.map(building => tx.store.put(building, [building.id, manifest.version])),
          tx.store.put({ ...campus, buildingIds: buildings.map(building => building.id) }, ['campus', manifest.version]),
          tx.store.put(manifest.version, 'active'),
          tx.done,
        ]);
      } catch {
        // Use the intact network snapshot even if IndexedDB is full.
      }
    }
    return { version: manifest.version, data };
  } catch (error) {
    if (cached) return cached;
    throw error;
  } finally {
    db?.close();
  }
}
