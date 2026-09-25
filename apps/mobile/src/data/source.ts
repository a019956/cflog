// Data access (02 § Contracts): one cityIndex read per city, one café doc read per sheet.
import {
  CITIES,
  type Cafe,
  type CafeSummary,
  type CityDoc,
  type CityIndexDoc,
} from '@cflog/shared';

import { CONFIG, firebaseConfigured } from '@/config';

export interface DataSource {
  readonly kind: 'firestore' | 'sample';
  cityIndex(cityId: string): Promise<CafeSummary[]>;
  cityCounts(): Promise<Record<string, number>>;
  cafe(id: string): Promise<Cafe | null>;
}

/** Minimal document reader so the Firestore source can be tested without the SDK. */
export type DocReader = (collection: string, id: string) => Promise<unknown | null>;

export function createFirestoreSource(read: DocReader): DataSource {
  return {
    kind: 'firestore',
    async cityIndex(cityId) {
      const base = (await read('cityIndex', cityId)) as CityIndexDoc | null;
      if (base) return base.cafes;
      // Sharded index: the city doc lists the shard ids (ADR-013).
      const city = (await read('cities', cityId)) as CityDoc | null;
      if (!city?.indexShards?.length) return [];
      const shards = await Promise.all(
        city.indexShards.map((id) => read('cityIndex', id) as Promise<CityIndexDoc | null>),
      );
      return shards.flatMap((s) => s?.cafes ?? []);
    },
    async cityCounts() {
      const docs = await Promise.all(
        CITIES.map((c) => read('cities', c.id) as Promise<CityDoc | null>),
      );
      return Object.fromEntries(
        docs.filter((d): d is CityDoc => !!d).map((d) => [d.id, d.cafeCount]),
      );
    },
    async cafe(id) {
      return (await read('cafes', id)) as Cafe | null;
    },
  };
}

/** Session cache in front of any source (R: café sheet cached per session). */
export function withCache(src: DataSource): DataSource {
  const index = new Map<string, Promise<CafeSummary[]>>();
  const cafes = new Map<string, Promise<Cafe | null>>();
  let counts: Promise<Record<string, number>> | null = null;
  const remember = <T>(map: Map<string, Promise<T>>, key: string, load: () => Promise<T>) => {
    const hit = map.get(key);
    if (hit) return hit;
    const p = load().catch((err) => {
      map.delete(key); // failed loads are retried
      throw err;
    });
    map.set(key, p);
    return p;
  };
  return {
    kind: src.kind,
    cityIndex: (id) => remember(index, id, () => src.cityIndex(id)),
    cafe: (id) => remember(cafes, id, () => src.cafe(id)),
    cityCounts: () => {
      counts ??= src.cityCounts().catch((err) => {
        counts = null;
        throw err;
      });
      return counts;
    },
  };
}

let current: DataSource | null = null;

async function firestoreReader(): Promise<DocReader> {
  const { initializeApp, getApps } = await import('firebase/app');
  const { doc, getDoc, getFirestore } = await import('firebase/firestore');
  const app = getApps()[0] ?? initializeApp(CONFIG.firebase);
  const db = getFirestore(app);
  return async (collection, id) => {
    const snap = await getDoc(doc(db, collection, id));
    return snap.exists() ? snap.data() : null;
  };
}

/** Firestore when configured, otherwise bundled sample data (clearly labelled in the UI). */
export function getDataSource(): DataSource {
  if (current) return current;
  if (firebaseConfigured() && !CONFIG.useSampleData) {
    let reader: Promise<DocReader> | null = null;
    const read: DocReader = async (c, id) => (await (reader ??= firestoreReader()))(c, id);
    current = withCache(createFirestoreSource(read));
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { sampleSource } = require('./sample') as typeof import('./sample');
    current = withCache(sampleSource);
  }
  return current;
}

/** Test hook. */
export function setDataSource(src: DataSource | null): void {
  current = src;
}
