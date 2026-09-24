// Firestore implementation of DataStore (firebase-admin). Writes are batched (≤400 ops per commit).
import type { Cafe, CityDoc, CityIndexDoc, PipelineStateDoc } from '@cflog/shared';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import {
  FieldValue,
  getFirestore,
  type Firestore,
  type WriteBatch,
} from 'firebase-admin/firestore';
import type { DataStore } from './store.js';

/** Firestore rejects commits over 10 MiB; flush well before that. */
const MAX_BATCH_BYTES = 8 * 1024 * 1024;
const approxBytes = (o: unknown) => Buffer.byteLength(JSON.stringify(o ?? null), 'utf8') + 200;

export function firestoreFromEnv(env: NodeJS.ProcessEnv = process.env): Firestore {
  const raw = env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw)
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT is not set (service-account JSON). Use --dry-run to run without Firestore.',
    );
  let creds: { project_id?: string; client_email?: string; private_key?: string };
  try {
    creds = JSON.parse(raw);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON');
  }
  const app =
    getApps()[0] ??
    initializeApp({ credential: cert(creds as never), projectId: creds.project_id });
  const db = getFirestore(app);
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

export class FirestoreStore implements DataStore {
  reads = 0;
  writes = 0;
  private batch: WriteBatch | null = null;
  private ops = 0;
  private bytes = 0;
  /** index doc ids per city as last read, so stale shards can be deleted */
  private readonly indexIds = new Map<string, string[]>();

  constructor(private readonly db: Firestore) {}

  private async op(fn: (b: WriteBatch) => void, payload?: unknown) {
    const size = approxBytes(payload);
    if (this.ops > 0 && this.bytes + size > MAX_BATCH_BYTES) await this.flush();
    this.batch ??= this.db.batch();
    fn(this.batch);
    this.ops++;
    this.bytes += size;
    this.writes++;
    if (this.ops >= 400) await this.flush();
  }

  async flush() {
    if (this.batch && this.ops > 0) await this.batch.commit();
    this.batch = null;
    this.ops = 0;
    this.bytes = 0;
  }

  async getState(cityId: string) {
    this.reads++;
    const snap = await this.db.collection('pipelineState').doc(cityId).get();
    return snap.exists ? (snap.data() as PipelineStateDoc) : null;
  }

  async getCityIndex(cityId: string) {
    this.reads++;
    const city = await this.db.collection('cities').doc(cityId).get();
    const shards = (city.data() as CityDoc | undefined)?.indexShards;
    const ids = shards?.length ? shards : [cityId];
    this.indexIds.set(cityId, ids);
    const docs: CityIndexDoc[] = [];
    for (const id of ids) {
      this.reads++;
      const snap = await this.db.collection('cityIndex').doc(id).get();
      if (snap.exists) docs.push(snap.data() as CityIndexDoc);
    }
    if (docs.length === 0) return null;
    return { ...docs[0]!, cafes: docs.flatMap((d) => d.cafes) };
  }

  async getCafe(id: string) {
    this.reads++;
    const snap = await this.db.collection('cafes').doc(id).get();
    return snap.exists ? (snap.data() as Cafe) : null;
  }

  setCafe(cafe: Cafe) {
    return this.op((b) => b.set(this.db.collection('cafes').doc(cafe.id), cafe), cafe);
  }
  patchCafe(id: string, fields: Partial<Cafe>) {
    return this.op(
      (b) => b.set(this.db.collection('cafes').doc(id), fields, { merge: true }),
      fields,
    );
  }
  deleteCafe(id: string) {
    return this.op((b) => b.delete(this.db.collection('cafes').doc(id)));
  }
  async setCityIndex(docs: CityIndexDoc[], cityId: string) {
    const ids = docs.length === 1 ? [cityId] : docs.map((_, i) => `${cityId}-${i}`);
    for (let i = 0; i < docs.length; i++) {
      await this.op((b) => b.set(this.db.collection('cityIndex').doc(ids[i]!), docs[i]!), docs[i]);
    }
    // Remove shards from a previous, differently sharded index.
    for (const stale of (this.indexIds.get(cityId) ?? []).filter((id) => !ids.includes(id))) {
      await this.op((b) => b.delete(this.db.collection('cityIndex').doc(stale)));
    }
    this.indexIds.set(cityId, ids);
  }
  setCity(doc: CityDoc) {
    return this.op((b) =>
      b.set(
        this.db.collection('cities').doc(doc.id),
        doc.indexShards ? doc : { ...doc, indexShards: FieldValue.delete() },
        { merge: true },
      ),
    );
  }
  setState(doc: PipelineStateDoc) {
    return this.op((b) => b.set(this.db.collection('pipelineState').doc(doc.cityId), doc), doc);
  }
}
