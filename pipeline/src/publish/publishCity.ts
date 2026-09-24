// Diff-based publishing for one city (ADR-013): writes only changed café docs, keeps missing beans
// for one run, hides then deletes vanished cafés, rebuilds cityIndex + cities doc, saves pipelineState.
import {
  cityById,
  type Bean,
  type Cafe,
  type CafeSummary,
  type CityIndexDoc,
  type IsoDate,
  type MenuItem,
  type PipelineCafeState,
  type PipelineStateDoc,
} from '@cflog/shared';
import type { Candidate } from '../discover/candidates.js';
import type { CrawlResult } from '../crawl/site.js';
import type { RawBean, RawMenuItem } from '../extract/types.js';
import {
  buildCafeDoc,
  cafeContentHash,
  docBytes,
  fitDoc,
  MAX_DOC_BYTES,
  normaliseBean,
  normaliseMenuItem,
  shortHash,
  toSummary,
} from '../normalise/index.js';
import { WriteBudgetExceeded, type DataStore } from './store.js';

export const BEAN_MISS_LIMIT = 2;
export const HIDDEN_DELETE_AFTER = 4;

export interface Extraction {
  beans: RawBean[];
  menu: RawMenuItem[];
  /** false when a menu job was planned but not run; the previous menu is kept */
  menuFresh: boolean;
}

export interface CafeOutcome {
  candidate: Candidate;
  crawl: CrawlResult;
  pagesHash: string;
  /** null = nothing new to publish (unchanged pages, failed crawl, or extraction skipped) */
  extraction: Extraction | null;
}

export interface PublishStats {
  cafes: number;
  created: number;
  updated: number;
  unchanged: number;
  carried: number;
  hidden: number;
  deleted: number;
  beansAdded: number;
  beansRemoved: number;
  trimmed: string[];
  stoppedAtWriteBudget: boolean;
  indexWritten: boolean;
  indexShards: number;
  stateCompacted: boolean;
}

export interface PublishInput {
  cityId: string;
  outcomes: readonly CafeOutcome[];
  store: DataStore;
  prevState: PipelineStateDoc | null;
  now: IsoDate;
  overtureRelease?: string;
  /** false for partial runs (--max-cafes): vanished cafés are not hidden */
  complete: boolean;
}

const emptyEntry = (): PipelineCafeState => ({
  contentHash: '',
  pagesHash: '',
  crawlStatus: 'no-site',
  beanMiss: {},
  beanFirstSeen: {},
  hiddenRuns: 0,
});

/** Refresh "Updated N days ago" on unchanged cafés at most this often (one small merge write). */
export const FRESHNESS_REFRESH_DAYS = 21;

/** Hash of the place fields and crawl status that show on the café doc but not in its pages. */
export function metaHashOf(c: Candidate, crawlStatus: string): string {
  return shortHash(
    JSON.stringify([
      c.name,
      c.kind,
      c.address,
      c.lat.toFixed(5),
      c.lng.toFixed(5),
      c.website ?? '',
      c.phone ?? '',
      c.instagram ?? '',
      crawlStatus,
    ]),
  );
}

const daysBetween = (a: IsoDate, b: IsoDate) => (Date.parse(b) - Date.parse(a)) / 86_400_000;

/** Splits summaries into index docs under MAX_DOC_BYTES each (never emits an empty shard). */
export function shardIndex(cityId: string, cafes: CafeSummary[], now: IsoDate): CityIndexDoc[] {
  const docs: CityIndexDoc[] = [];
  let current: CafeSummary[] = [];
  const make = (c: CafeSummary[]): CityIndexDoc => ({
    cityId,
    updatedAt: now,
    version: 1,
    cafes: c,
  });
  for (const s of cafes) {
    current.push(s);
    if (current.length > 1 && docBytes(make(current)) > MAX_DOC_BYTES) {
      current.pop();
      docs.push(make(current));
      current = [s];
    }
  }
  docs.push(make(current));
  return docs;
}

export async function publishCity(input: PublishInput): Promise<{
  stats: PublishStats;
  state: PipelineStateDoc;
  summaries: CafeSummary[];
  docs: Cafe[];
}> {
  const { cityId, store, now } = input;
  const city = cityById(cityId);
  if (!city) throw new Error(`Unknown city ${cityId}`);
  const prevState = input.prevState ?? { cityId, updatedAt: now, cafes: {} };
  const prevIndex = await store.getCityIndex(cityId);
  const prevSummaries = new Map((prevIndex?.cafes ?? []).map((s) => [s.id, s]));

  const stats: PublishStats = {
    cafes: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    carried: 0,
    hidden: 0,
    deleted: 0,
    beansAdded: 0,
    beansRemoved: 0,
    trimmed: [],
    stoppedAtWriteBudget: false,
    indexWritten: false,
    indexShards: 0,
    stateCompacted: false,
  };
  const nextCafes: Record<string, PipelineCafeState> = {};
  const summaries: CafeSummary[] = [];
  const written: Cafe[] = [];
  const seen = new Set<string>();

  /** Writes `doc` when forced or when its content hash differs from the previous state. */
  const put = async (
    doc: Cafe,
    prev: PipelineCafeState | undefined,
    force: boolean,
  ): Promise<string> => {
    const hash = cafeContentHash(doc);
    if (!force && prev && prev.contentHash === hash) {
      stats.unchanged++;
      return hash;
    }
    await store.setCafe(doc);
    written.push(doc);
    if (prev) stats.updated++;
    else stats.created++;
    return hash;
  };

  const basicDoc = (o: CafeOutcome): Cafe =>
    buildCafeDoc({
      candidate: o.candidate,
      platform: o.crawl.platform,
      crawlStatus: o.crawl.status,
      beans: [],
      menu: [],
      overtureRelease: input.overtureRelease,
      lastCrawledAt: o.crawl.status === 'ok' ? now : undefined,
      now,
    });

  for (let i = 0; i < input.outcomes.length; i++) {
    const o = input.outcomes[i]!;
    const id = o.candidate.id;
    seen.add(id);
    const prev = prevState.cafes[id];
    const meta = metaHashOf(o.candidate, o.crawl.status);
    const crawledOk = o.crawl.status === 'ok';
    try {
      if (!o.extraction) {
        if (!prev) {
          // New café with nothing extracted yet: publish the basic place so it appears on the map.
          const doc = basicDoc(o);
          const hash = await put(doc, undefined, true);
          summaries.push(toSummary(doc));
          nextCafes[id] = {
            ...emptyEntry(),
            contentHash: hash,
            crawlStatus: o.crawl.status,
            metaHash: meta,
            lastCrawledAt: doc.lastCrawledAt,
          };
          continue;
        }
        const returning = prev.hiddenRuns > 0;
        if (returning || prev.metaHash !== meta || !prevSummaries.has(id)) {
          // Place details, crawl status or visibility changed (or the index lost it): rebuild from the
          // previous doc with the current candidate, keeping its beans and menu.
          const prevDoc = await store.getCafe(id);
          const doc = prevDoc
            ? buildCafeDoc({
                candidate: o.candidate,
                platform: crawledOk ? o.crawl.platform : prevDoc.platform,
                crawlStatus: o.crawl.status,
                beans: prevDoc.beans,
                menu: prevDoc.menu,
                overtureRelease: input.overtureRelease,
                lastCrawledAt: crawledOk ? now : prevDoc.lastCrawledAt,
                now,
              })
            : basicDoc(o);
          const hash = await put(doc, prevDoc ? prev : undefined, returning || !prevDoc);
          summaries.push(toSummary(doc));
          nextCafes[id] = {
            ...(prevDoc ? prev : emptyEntry()),
            contentHash: hash,
            crawlStatus: o.crawl.status,
            metaHash: meta,
            lastCrawledAt: doc.lastCrawledAt,
            hiddenRuns: 0,
            // keep pagesHash only if the doc still carries data extracted from those pages
            pagesHash: prevDoc ? prev.pagesHash : '',
          };
          continue;
        }
        // Unchanged: keep the doc; refresh the "updated" date now and then with one merge write.
        let lastCrawledAt = prev.lastCrawledAt;
        if (
          crawledOk &&
          (!lastCrawledAt || daysBetween(lastCrawledAt, now) >= FRESHNESS_REFRESH_DAYS)
        ) {
          await store.patchCafe(id, { lastCrawledAt: now });
          lastCrawledAt = now;
        }
        summaries.push(prevSummaries.get(id)!);
        nextCafes[id] = { ...prev, hiddenRuns: 0, lastCrawledAt };
        stats.carried++;
        continue;
      }

      // Fresh extraction
      const prevFirstSeen = prev?.beanFirstSeen ?? {};
      const beans: Bean[] = o.extraction.beans.map((b) => {
        const nb = normaliseBean(b, id, now);
        return prevFirstSeen[nb.id] ? { ...nb, firstSeenAt: prevFirstSeen[nb.id]! } : nb;
      });
      const present = new Set(beans.map((b) => b.id));
      const missing = Object.keys(prevFirstSeen).filter((b) => !present.has(b));
      const needPrevDoc = !!prev && (missing.length > 0 || !o.extraction.menuFresh);
      const prevDoc = needPrevDoc ? await store.getCafe(id) : null;

      const beanMiss: Record<string, number> = {};
      const beanFirstSeen: Record<string, IsoDate> = Object.fromEntries(
        beans.map((b) => [b.id, b.firstSeenAt]),
      );
      for (const b of missing) {
        const miss = (prev?.beanMiss[b] ?? 0) + 1;
        const old = prevDoc?.beans.find((x) => x.id === b);
        if (miss < BEAN_MISS_LIMIT && old) {
          beans.push(old);
          beanMiss[b] = miss;
          beanFirstSeen[b] = prevFirstSeen[b]!;
        } else {
          stats.beansRemoved++;
        }
      }
      stats.beansAdded += beans.filter((b) => !prevFirstSeen[b.id]).length;

      const menu: MenuItem[] = o.extraction.menuFresh
        ? o.extraction.menu.map((m) => normaliseMenuItem(m, id, now))
        : (prevDoc?.menu ?? []);

      const built = buildCafeDoc({
        candidate: o.candidate,
        platform: o.crawl.platform,
        crawlStatus: o.crawl.status,
        beans,
        menu,
        overtureRelease: input.overtureRelease,
        lastCrawledAt: now,
        now,
      });
      const { cafe: doc, trimmed } = fitDoc(built);
      if (trimmed) stats.trimmed.push(id);
      const writesBefore = written.length;
      const hash = await put(doc, prev, !!prev && prev.hiddenRuns > 0);
      let lastCrawledAt: IsoDate | undefined =
        written.length > writesBefore ? now : prev?.lastCrawledAt;
      if (!lastCrawledAt || daysBetween(lastCrawledAt, now) >= FRESHNESS_REFRESH_DAYS) {
        await store.patchCafe(id, { lastCrawledAt: now });
        lastCrawledAt = now;
      }
      summaries.push(toSummary(doc));
      nextCafes[id] = {
        contentHash: hash,
        // an incomplete extraction (menu job skipped) is retried next run
        pagesHash: o.extraction.menuFresh ? o.pagesHash : '',
        lastExtractedAt: now,
        crawlStatus: o.crawl.status,
        metaHash: meta,
        lastCrawledAt,
        beanMiss,
        beanFirstSeen,
        hiddenRuns: 0,
      };
    } catch (err) {
      if (!(err instanceof WriteBudgetExceeded)) throw err;
      stats.stoppedAtWriteBudget = true;
      // Keep everything not yet processed exactly as it was, so the next run picks it up.
      for (const rest of input.outcomes.slice(i)) {
        const rid = rest.candidate.id;
        seen.add(rid);
        const rp = prevState.cafes[rid];
        if (rp) {
          nextCafes[rid] = rp;
          const sm = prevSummaries.get(rid);
          if (sm) summaries.push(sm);
        }
      }
      break;
    }
  }

  // Cafés that vanished from discovery
  if (input.complete && !stats.stoppedAtWriteBudget) {
    for (const [id, prev] of Object.entries(prevState.cafes)) {
      if (seen.has(id)) continue;
      const runs = prev.hiddenRuns + 1;
      try {
        if (runs >= HIDDEN_DELETE_AFTER) {
          await store.deleteCafe(id);
          stats.deleted++;
          continue;
        }
        if (runs === 1) {
          await store.patchCafe(id, { hidden: true, lastChangedAt: now });
          stats.hidden++;
        }
        // contentHash cleared so a returning café is always rewritten
        nextCafes[id] = { ...prev, hiddenRuns: runs, contentHash: '' };
      } catch (err) {
        if (!(err instanceof WriteBudgetExceeded)) throw err;
        stats.stoppedAtWriteBudget = true;
        nextCafes[id] = prev;
      }
    }
  } else {
    for (const [id, prev] of Object.entries(prevState.cafes)) {
      if (seen.has(id)) continue;
      nextCafes[id] = prev;
      const sm = prevSummaries.get(id);
      if (sm) summaries.push(sm);
    }
  }

  // City index + city doc
  summaries.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const docs = shardIndex(cityId, summaries, now);
  stats.indexShards = docs.length;
  stats.cafes = summaries.length;
  const changed =
    shortHash(JSON.stringify(prevIndex?.cafes ?? [])) !== shortHash(JSON.stringify(summaries));
  if (changed || !prevIndex) {
    try {
      await store.setCityIndex(docs, cityId);
      await store.setCity({
        id: city.id,
        name: city.name,
        state: city.state,
        bbox: city.bbox,
        center: city.center,
        cafeCount: summaries.length,
        updatedAt: now,
        ...(docs.length > 1 ? { indexShards: docs.map((_, i) => `${cityId}-${i}`) } : {}),
      });
      stats.indexWritten = true;
    } catch (err) {
      if (!(err instanceof WriteBudgetExceeded)) throw err;
      stats.stoppedAtWriteBudget = true;
    }
  }

  let state: PipelineStateDoc = {
    cityId,
    updatedAt: now,
    ...(input.overtureRelease ? { overtureRelease: input.overtureRelease } : {}),
    cafes: nextCafes,
  };
  if (docBytes(state) > MAX_DOC_BYTES) {
    // Safety valve: drop first-seen dates (only used for display) rather than fail the write.
    stats.stateCompacted = true;
    state = {
      ...state,
      cafes: Object.fromEntries(
        Object.entries(nextCafes).map(([k, v]) => [k, { ...v, beanFirstSeen: {} }]),
      ),
    };
  }
  await store.setState(state);
  await store.flush();
  return { stats, state, summaries, docs: written };
}
