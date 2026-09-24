import type { PipelineStateDoc } from '@cflog/shared';
import { describe, expect, it } from 'vitest';
import type { CrawlResult } from '../src/crawl/site.js';
import type { Candidate } from '../src/discover/candidates.js';
import {
  beanId,
  buildCafeDoc,
  computeFacets,
  geohash,
  normaliseBean,
  normaliseMenuItem,
} from '../src/normalise/index.js';
import { publishCity, shardIndex, type CafeOutcome } from '../src/publish/publishCity.js';
import { MemoryStore, withWriteBudget } from '../src/publish/store.js';
import type { RawBean } from '../src/extract/types.js';

const T1 = '2026-09-28T09:00:00.000Z';
const T2 = '2026-10-05T09:00:00.000Z';
const T3 = '2026-10-12T09:00:00.000Z';

const cand = (id: string, over: Partial<Candidate> = {}): Candidate => ({
  id,
  cityId: 'boston',
  name: `Cafe ${id}`,
  kind: 'cafe',
  lat: 42.36,
  lng: -71.06,
  address: { city: 'Boston', state: 'MA' },
  website: `https://${id}.example`,
  source: 'overture',
  ...over,
});
const crawl = (
  id: string,
  status: CrawlResult['status'] = 'ok',
  platform: CrawlResult['platform'] = 'shopify',
): CrawlResult => ({ cafeId: id, status, platform, pages: [] });
const raw = (name: string, over: Partial<RawBean> = {}): RawBean => ({
  name,
  countries: ['ET'],
  roast: 'light',
  process: 'washed',
  notes: ['blueberry', 'jasmine'],
  url: `https://x.example/products/${name}`,
  source: 'shopify',
  ...over,
});
function outcome(
  id: string,
  beans: RawBean[] | null,
  opts: {
    hash?: string;
    menu?: string[];
    menuFresh?: boolean;
    status?: CrawlResult['status'];
  } = {},
): CafeOutcome {
  return {
    candidate: cand(id),
    crawl: crawl(id, opts.status),
    pagesHash: opts.hash ?? `h-${id}`,
    extraction: beans
      ? {
          beans,
          menu: (opts.menu ?? []).map((n) => ({
            name: n,
            category: 'espresso',
            source: 'llm' as const,
          })),
          menuFresh: opts.menuFresh ?? true,
        }
      : null,
  };
}

async function run(store: MemoryStore, outcomes: CafeOutcome[], now: string, complete = true) {
  const prev = (await store.getState('boston')) as PipelineStateDoc | null;
  return publishCity({
    cityId: 'boston',
    outcomes,
    store,
    prevState: prev,
    now,
    complete,
    overtureRelease: '2026-09-23.0',
  });
}

describe('normalise', () => {
  it('maps a raw bean to vocabularies and flavor families', () => {
    const b = normaliseBean(
      raw('Ethiopia Guji', {
        varieties: ['Geisha'],
        flavorFamilies: ['floral/tea', 'bogus'],
        priceUsd: 2,
      }),
      'c1',
      T1,
    );
    expect(b).toMatchObject({
      id: beanId('c1', 'Ethiopia Guji'),
      origin: { countries: ['ET'] },
      roastLevel: 'light',
      process: 'washed',
      varieties: ['gesha'],
      flavorFamilies: ['fruity/berry', 'floral/floral', 'floral/tea'],
      isBlend: false,
      isDecaf: false,
      firstSeenAt: '2026-09-28',
      lastSeenAt: T1,
    });
    expect(b.priceUsd).toBeUndefined(); // below the sanity range
    expect(
      normaliseMenuItem({ name: 'Latte', category: 'nope', source: 'llm' }, 'c1', T1).category,
    ).toBe('other');
  });
  it('computes facets and upgrades a café selling its own beans to "both"', () => {
    const beans = [
      normaliseBean(raw('A'), 'c', T1),
      normaliseBean(raw('B', { countries: ['CO'], roast: 'dark', isDecaf: true }), 'c', T1),
    ];
    const f = computeFacets(beans, [], 'shopify');
    expect(f).toMatchObject({
      dataStatus: 'beans',
      beanCount: 2,
      sellsOnline: true,
      roastLevels: ['dark', 'light'],
      originCountries: ['CO', 'ET'],
      hasDecaf: true,
    });
    const doc = buildCafeDoc({
      candidate: cand('c'),
      platform: 'shopify',
      crawlStatus: 'ok',
      beans,
      menu: [],
      now: T1,
    });
    expect(doc.kind).toBe('both');
    expect(doc.geohash).toHaveLength(9);
    expect(
      computeFacets([], [normaliseMenuItem({ name: 'Latte', source: 'llm' }, 'c', T1)], 'other')
        .dataStatus,
    ).toBe('menu-only');
  });
  it('encodes geohashes', () => {
    expect(geohash(57.64911, 10.40744, 11)).toBe('u4pruydqqvj');
  });
});

describe('publishCity', () => {
  it('creates docs, index and state on the first run', async () => {
    const store = new MemoryStore();
    const { stats } = await run(
      store,
      [
        outcome('a', [raw('Guji'), raw('Huila', { countries: ['CO'] })]),
        outcome('b', null, { status: 'no-site' }),
      ],
      T1,
    );
    expect(stats).toMatchObject({
      created: 2,
      updated: 0,
      beansAdded: 2,
      indexWritten: true,
      cafes: 2,
    });
    expect(store.cafes.get('a')!.facets.dataStatus).toBe('beans');
    expect(store.cafes.get('b')!.dataStatus).toBe('none');
    expect(store.cityIndex.get('boston')!.cafes.map((c) => c.id)).toEqual(['a', 'b']);
    expect(store.cities.get('boston')).toMatchObject({ cafeCount: 2, updatedAt: T1 });
    expect(store.states.get('boston')!.cafes.a!.pagesHash).toBe('h-a');
    expect(store.states.get('boston')!.cafes.b!.pagesHash).toBe('');
  });

  it('writes nothing but the state when nothing changed', async () => {
    const store = new MemoryStore();
    await run(store, [outcome('a', [raw('Guji')])], T1);
    const w = store.writes;
    const { stats } = await run(store, [outcome('a', null)], T2);
    expect(stats).toMatchObject({ carried: 1, created: 0, updated: 0, indexWritten: false });
    expect(store.writes - w).toBe(1); // pipelineState only
    // identical re-extraction with new timestamps is also not a change
    const { stats: s3 } = await run(store, [outcome('a', [raw('Guji')], { hash: 'h-a2' })], T3);
    expect(s3.unchanged).toBe(1);
  });

  it('keeps a missing bean for one run, then removes it', async () => {
    const store = new MemoryStore();
    await run(store, [outcome('a', [raw('Guji'), raw('Huila', { countries: ['CO'] })])], T1);
    const r2 = await run(store, [outcome('a', [raw('Guji')], { hash: 'h2' })], T2);
    expect(
      store.cafes
        .get('a')!
        .beans.map((b) => b.name)
        .sort(),
    ).toEqual(['Guji', 'Huila']);
    expect(r2.state.cafes.a!.beanMiss).toEqual({ [beanId('a', 'Huila')]: 1 });
    const r3 = await run(store, [outcome('a', [raw('Guji')], { hash: 'h3' })], T3);
    expect(store.cafes.get('a')!.beans.map((b) => b.name)).toEqual(['Guji']);
    expect(r3.stats.beansRemoved).toBe(1);
    expect(store.cafes.get('a')!.beans[0]!.firstSeenAt).toBe('2026-09-28');
  });

  it('keeps the previous menu when the menu job was skipped', async () => {
    const store = new MemoryStore();
    await run(store, [outcome('a', [raw('Guji')], { menu: ['Latte', 'Cortado'] })], T1);
    await run(
      store,
      [
        outcome('a', [raw('Guji'), raw('Kenya', { countries: ['KE'] })], {
          hash: 'h2',
          menuFresh: false,
        }),
      ],
      T2,
    );
    expect(store.cafes.get('a')!.menu.map((m) => m.name)).toEqual(['Latte', 'Cortado']);
    expect(store.cafes.get('a')!.beans).toHaveLength(2);
  });

  it('hides vanished cafés, deletes them after 4 runs, and skips this on partial runs', async () => {
    const store = new MemoryStore();
    await run(store, [outcome('a', [raw('Guji')]), outcome('b', [raw('X')])], T1);
    await run(store, [outcome('a', null)], T2, false);
    expect(store.cafes.get('b')!.hidden).toBe(false);
    expect(store.cityIndex.get('boston')!.cafes.map((c) => c.id)).toEqual(['a', 'b']);
    await run(store, [outcome('a', null)], T2);
    expect(store.cafes.get('b')!.hidden).toBe(true);
    expect(store.cityIndex.get('boston')!.cafes.map((c) => c.id)).toEqual(['a']);
    await run(store, [outcome('a', null)], T3);
    await run(store, [outcome('a', null)], T3);
    expect(store.cafes.has('b')).toBe(true);
    const r = await run(store, [outcome('a', null)], T3);
    expect(r.stats.deleted).toBe(1);
    expect(store.cafes.has('b')).toBe(false);
    expect(r.state.cafes.b).toBeUndefined();
  });

  it('stops cleanly at the write budget and resumes next run', async () => {
    const mem = new MemoryStore();
    const outs = ['a', 'b', 'c', 'd'].map((id) => outcome(id, [raw(`Bean ${id}`)]));
    const prev = await mem.getState('boston');
    const r1 = await publishCity({
      cityId: 'boston',
      outcomes: outs,
      store: withWriteBudget(mem, 2),
      prevState: prev,
      now: T1,
      complete: true,
    });
    expect(r1.stats.stoppedAtWriteBudget).toBe(true);
    expect(Object.keys(r1.state.cafes)).toEqual(['a', 'b']);
    expect(mem.cafes.size).toBe(2);
    const r2 = await publishCity({
      cityId: 'boston',
      outcomes: outs,
      store: withWriteBudget(mem, 100),
      prevState: r1.state,
      now: T2,
      complete: true,
    });
    expect(r2.stats).toMatchObject({ created: 2, unchanged: 2, stoppedAtWriteBudget: false });
    expect(mem.cityIndex.get('boston')!.cafes).toHaveLength(4);
  });

  it('shards the city index above the size limit', () => {
    const big = Array.from({ length: 4000 }, (_, i) => ({
      id: `cafe-${i}`,
      name: `Cafe ${i} ${'x'.repeat(100)}`,
      kind: 'cafe' as const,
      lat: 42,
      lng: -71,
      dataStatus: 'beans' as const,
      beanCount: 3,
      sellsOnline: true,
      roastLevels: ['light' as const],
      processes: ['washed' as const],
      originCountries: ['ET', 'CO', 'KE'],
      flavorFamilies: ['fruity/berry' as const, 'floral/tea' as const],
      varieties: ['gesha', 'sl28'],
      hasDecaf: false,
    }));
    const docs = shardIndex('nyc', big, T1);
    expect(docs.length).toBeGreaterThan(1);
    expect(docs.flatMap((d) => d.cafes)).toHaveLength(4000);
    for (const d of docs) expect(JSON.stringify(d).length).toBeLessThan(900_000);
  });

  it('brings a hidden café back and rewrites it', async () => {
    const store = new MemoryStore();
    await run(store, [outcome('a', [raw('Guji')]), outcome('b', [raw('X')])], T1);
    await run(store, [outcome('a', null)], T2); // b hidden
    expect(store.cafes.get('b')!.hidden).toBe(true);
    const r = await run(store, [outcome('a', null), outcome('b', null)], T3); // b back, pages unchanged
    expect(store.cafes.get('b')!.hidden).toBe(false);
    expect(store.cafes.get('b')!.beans.map((x) => x.name)).toEqual(['X']);
    expect(store.cityIndex.get('boston')!.cafes.map((c) => c.id)).toEqual(['a', 'b']);
    expect(r.state.cafes.b!.hiddenRuns).toBe(0);
  });

  it('rewrites the doc when place details change without re-extraction', async () => {
    const store = new MemoryStore();
    await run(store, [outcome('a', [raw('Guji')])], T1);
    const renamed = {
      ...outcome('a', null),
      candidate: cand('a', { name: 'Renamed Cafe', website: 'https://new.example' }),
    };
    const r = await run(store, [renamed], T2);
    expect(r.stats.updated).toBe(1);
    expect(store.cafes.get('a')).toMatchObject({
      name: 'Renamed Cafe',
      website: 'https://new.example',
    });
    expect(store.cafes.get('a')!.beans).toHaveLength(1);
    expect(store.cityIndex.get('boston')!.cafes[0]!.name).toBe('Renamed Cafe');
  });

  it('refreshes lastCrawledAt on unchanged cafés every 21 days with one merge write', async () => {
    const store = new MemoryStore();
    await run(store, [outcome('a', [raw('Guji')])], T1);
    const w = store.writes;
    await run(store, [outcome('a', null)], '2026-10-20T09:00:00.000Z'); // 22 days later
    expect(store.cafes.get('a')!.lastCrawledAt).toBe('2026-10-20T09:00:00.000Z');
    expect(store.writes - w).toBe(2); // patch + state
  });

  it('never emits an empty index shard', () => {
    const huge = {
      id: 'x',
      name: 'y'.repeat(950_000),
      kind: 'cafe' as const,
      lat: 0,
      lng: 0,
      dataStatus: 'none' as const,
      beanCount: 0,
      sellsOnline: false,
      roastLevels: [],
      processes: [],
      originCountries: [],
      flavorFamilies: [],
      varieties: [],
      hasDecaf: false,
    };
    const docs = shardIndex('nyc', [huge, { ...huge, id: 'z' }], T1);
    expect(docs.every((d) => d.cafes.length > 0)).toBe(true);
  });
});
