// Data store abstraction for publishing: Firestore in production, in-memory for tests and dry runs.
import type { Cafe, CityDoc, CityIndexDoc, PipelineStateDoc } from '@cflog/shared';

export class WriteBudgetExceeded extends Error {}

export interface DataStore {
  getState(cityId: string): Promise<PipelineStateDoc | null>;
  getCityIndex(cityId: string): Promise<CityIndexDoc | null>;
  getCafe(id: string): Promise<Cafe | null>;
  setCafe(cafe: Cafe): Promise<void>;
  /** merge-updates top-level fields of an existing café doc */
  patchCafe(id: string, fields: Partial<Cafe>): Promise<void>;
  deleteCafe(id: string): Promise<void>;
  setCityIndex(docs: CityIndexDoc[], cityId: string): Promise<void>;
  setCity(doc: CityDoc): Promise<void>;
  setState(doc: PipelineStateDoc): Promise<void>;
  flush(): Promise<void>;
  readonly reads: number;
  readonly writes: number;
}

/** Wraps a store so writes stop cleanly at `budget` (ADR-013). State writes are always allowed (1 per city). */
export function withWriteBudget(
  inner: DataStore,
  budget: number,
): DataStore & { remaining: () => number } {
  let used = 0;
  const guard = async (fn: () => Promise<void>, cost = 1) => {
    if (used + cost > budget)
      throw new WriteBudgetExceeded(`PIPELINE_MAX_WRITES (${budget}) reached`);
    used += cost;
    await fn();
  };
  return {
    getState: (c) => inner.getState(c),
    getCityIndex: (c) => inner.getCityIndex(c),
    getCafe: (id) => inner.getCafe(id),
    setCafe: (cafe) => guard(() => inner.setCafe(cafe)),
    patchCafe: (id, fields) => guard(() => inner.patchCafe(id, fields)),
    deleteCafe: (id) => guard(() => inner.deleteCafe(id)),
    setCityIndex: (docs, cityId) => guard(() => inner.setCityIndex(docs, cityId), docs.length),
    setCity: (doc) => guard(() => inner.setCity(doc)),
    setState: (doc) => inner.setState(doc),
    flush: () => inner.flush(),
    get reads() {
      return inner.reads;
    },
    get writes() {
      return inner.writes;
    },
    remaining: () => budget - used,
  };
}

/** In-memory store (tests, `--dry-run`). */
export class MemoryStore implements DataStore {
  readonly cafes = new Map<string, Cafe>();
  readonly states = new Map<string, PipelineStateDoc>();
  readonly cityIndex = new Map<string, CityIndexDoc>();
  readonly cities = new Map<string, CityDoc>();
  reads = 0;
  writes = 0;

  async getState(cityId: string) {
    this.reads++;
    return structuredClone(this.states.get(cityId) ?? null);
  }
  async getCityIndex(cityId: string) {
    this.reads++;
    const shards = [...this.cityIndex.entries()]
      .filter(([k]) => k === cityId || k.startsWith(`${cityId}-`))
      .map(([, v]) => v);
    if (shards.length === 0) return null;
    return structuredClone({ ...shards[0]!, cafes: shards.flatMap((s) => s.cafes) });
  }
  async getCafe(id: string) {
    this.reads++;
    return structuredClone(this.cafes.get(id) ?? null);
  }
  async setCafe(cafe: Cafe) {
    this.writes++;
    this.cafes.set(cafe.id, structuredClone(cafe));
  }
  async patchCafe(id: string, fields: Partial<Cafe>) {
    this.writes++;
    const c = this.cafes.get(id);
    if (c) this.cafes.set(id, { ...c, ...structuredClone(fields) });
  }
  async deleteCafe(id: string) {
    this.writes++;
    this.cafes.delete(id);
  }
  async setCityIndex(docs: CityIndexDoc[], cityId: string) {
    for (const k of [...this.cityIndex.keys()])
      if (k === cityId || k.startsWith(`${cityId}-`)) this.cityIndex.delete(k);
    docs.forEach((d, i) => {
      this.writes++;
      this.cityIndex.set(docs.length === 1 ? cityId : `${cityId}-${i}`, structuredClone(d));
    });
  }
  async setCity(doc: CityDoc) {
    this.writes++;
    this.cities.set(doc.id, structuredClone(doc));
  }
  async setState(doc: PipelineStateDoc) {
    this.writes++;
    this.states.set(doc.cityId, structuredClone(doc));
  }
  async flush() {}
}
