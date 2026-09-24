// Raw extraction → shared Bean / MenuItem / Cafe documents (02 § Data model, ADR-007, ADR-013).
import { createHash } from 'node:crypto';
import {
  COUNTRIES,
  isFlavorFamilyId,
  MAX_BEANS_PER_CAFE,
  MAX_MENU_ITEMS_PER_CAFE,
  MENU_CATEGORIES,
  mapTastingNotes,
  normalizeText,
  normalizeVariety,
  type Bean,
  type Cafe,
  type CafeFacets,
  type CafeSummary,
  type CrawlStatus,
  type FlavorFamilyId,
  type IsoDate,
  type MenuCategory,
  type MenuItem,
  type Platform,
} from '@cflog/shared';
import type { Candidate } from '../discover/candidates.js';
import { parseProcess, parseRoast } from '../extract/keywords.js';
import type { RawBean, RawMenuItem } from '../extract/types.js';
import { geohash } from './geohash.js';

export { geohash } from './geohash.js';

export const shortHash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);

export const beanId = (cafeId: string, name: string) =>
  shortHash(`${cafeId}|${normalizeText(name)}`);

const uniq = <T>(xs: readonly T[]) => [...new Set(xs)];
const inRange = (v: number | undefined, min: number, max: number) =>
  v !== undefined && Number.isFinite(v) && v >= min && v <= max
    ? Math.round(v * 100) / 100
    : undefined;

/** Drops undefined values so documents are stable and Firestore-safe. */
export function compact<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

export function normaliseBean(
  raw: RawBean,
  cafeId: string,
  now: IsoDate,
  firstSeenAt?: IsoDate,
): Bean {
  const { families } = mapTastingNotes(raw.notes ?? []);
  const llmFamilies = (raw.flavorFamilies ?? []).filter(isFlavorFamilyId) as FlavorFamilyId[];
  const countries = uniq(
    (raw.countries ?? []).map((c) => c.toUpperCase()).filter((c) => c in COUNTRIES),
  );
  return compact({
    id: beanId(cafeId, raw.name),
    name: raw.name.trim().slice(0, 120),
    url: raw.url,
    origin: compact({ countries, region: raw.region, farm: raw.farm, producer: raw.producer }),
    isBlend: raw.isBlend ?? countries.length > 1,
    process: parseProcess(raw.process),
    roastLevel: parseRoast(raw.roast),
    varieties: uniq((raw.varieties ?? []).map(normalizeVariety).filter(Boolean)),
    isDecaf: raw.isDecaf ?? false,
    tastingNotesRaw: (raw.notes ?? []).slice(0, 8),
    flavorFamilies: uniq([...families, ...llmFamilies]),
    priceUsd: inRange(raw.priceUsd, 3, 500),
    sizeGrams: inRange(raw.sizeGrams, 50, 5000),
    inStock: raw.inStock,
    source: raw.source,
    // date only: keeps pipelineState small (beanFirstSeen map)
    firstSeenAt: firstSeenAt ?? now.slice(0, 10),
    lastSeenAt: now,
  });
}

export function normaliseMenuItem(raw: RawMenuItem, cafeId: string, now: IsoDate): MenuItem {
  const category = (MENU_CATEGORIES as readonly string[]).includes(raw.category ?? '')
    ? (raw.category as MenuCategory)
    : 'other';
  return compact({
    id: shortHash(`${cafeId}|menu|${normalizeText(raw.name)}|${category}`),
    name: raw.name.trim().slice(0, 80),
    category,
    priceUsd: inRange(raw.priceUsd, 0.5, 100),
    description: raw.description,
    source: raw.source,
    lastSeenAt: now,
  });
}

/** Removes duplicate beans (same id) keeping the first; in-stock first; capped at MAX_BEANS_PER_CAFE. */
export function finaliseBeans(beans: readonly Bean[]): Bean[] {
  const seen = new Set<string>();
  const out = beans.filter((b) => !seen.has(b.id) && seen.add(b.id));
  return out
    .map((b, i) => ({ b, i }))
    .sort((x, y) => Number(y.b.inStock !== false) - Number(x.b.inStock !== false) || x.i - y.i)
    .map((x) => x.b)
    .slice(0, MAX_BEANS_PER_CAFE);
}

export function finaliseMenu(menu: readonly MenuItem[]): MenuItem[] {
  const seen = new Set<string>();
  return menu.filter((m) => !seen.has(m.id) && seen.add(m.id)).slice(0, MAX_MENU_ITEMS_PER_CAFE);
}

export function computeFacets(
  beans: readonly Bean[],
  menu: readonly MenuItem[],
  platform: Platform,
): CafeFacets {
  return {
    dataStatus: beans.length > 0 ? 'beans' : menu.length > 0 ? 'menu-only' : 'none',
    beanCount: beans.length,
    sellsOnline:
      beans.length > 0 &&
      (platform === 'shopify' || platform === 'woocommerce' || beans.some((b) => !!b.url)),
    roastLevels: uniq(beans.flatMap((b) => (b.roastLevel ? [b.roastLevel] : []))).sort(),
    processes: uniq(beans.flatMap((b) => (b.process ? [b.process] : []))).sort(),
    originCountries: uniq(beans.flatMap((b) => b.origin.countries)).sort(),
    flavorFamilies: uniq(beans.flatMap((b) => b.flavorFamilies)).sort(),
    varieties: uniq(beans.flatMap((b) => b.varieties)).sort(),
    hasDecaf: beans.some((b) => b.isDecaf),
  };
}

export interface CafeDocInput {
  candidate: Candidate;
  platform: Platform;
  crawlStatus: CrawlStatus;
  beans: readonly Bean[];
  menu: readonly MenuItem[];
  overtureRelease?: string;
  lastCrawledAt?: IsoDate;
  now: IsoDate;
}

export function buildCafeDoc(i: CafeDocInput): Cafe {
  const beans = finaliseBeans(i.beans);
  const menu = finaliseMenu(i.menu);
  const facets = computeFacets(beans, menu, i.platform);
  const c = i.candidate;
  // A café that sells its own bags is also a roaster-retailer (02 § Data model: kind).
  const kind = c.kind === 'cafe' && beans.length > 0 && facets.sellsOnline ? 'both' : c.kind;
  return compact({
    id: c.id,
    cityId: c.cityId,
    name: c.name,
    kind,
    address: compact(c.address),
    lat: c.lat,
    lng: c.lng,
    geohash: geohash(c.lat, c.lng, 9),
    website: c.website,
    phone: c.phone,
    instagram: c.instagram,
    platform: i.platform,
    dataStatus: facets.dataStatus,
    facets,
    sources: compact({
      overtureId: c.overtureId,
      overtureRelease: c.overtureId ? i.overtureRelease : undefined,
    }),
    lastCrawledAt: i.lastCrawledAt,
    lastChangedAt: i.now,
    crawlStatus: i.crawlStatus,
    hidden: false,
    beans,
    menu,
  });
}

/** Stable hash of a café doc ignoring volatile timestamps. */
export function cafeContentHash(cafe: Cafe): string {
  const strip = (o: unknown): unknown => {
    if (Array.isArray(o)) return o.map(strip);
    if (o && typeof o === 'object') {
      return Object.fromEntries(
        Object.entries(o as Record<string, unknown>)
          .filter(
            ([k]) => !['lastCrawledAt', 'lastChangedAt', 'lastSeenAt', 'firstSeenAt'].includes(k),
          )
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, strip(v)]),
      );
    }
    return o;
  };
  return shortHash(JSON.stringify(strip(cafe)));
}

export function toSummary(cafe: Cafe): CafeSummary {
  return {
    id: cafe.id,
    name: cafe.name,
    kind: cafe.kind,
    lat: cafe.lat,
    lng: cafe.lng,
    ...cafe.facets,
  };
}

export const docBytes = (o: unknown) => Buffer.byteLength(JSON.stringify(o), 'utf8');
export const MAX_DOC_BYTES = 900_000;

/** Trims beans/menu until the doc fits under MAX_DOC_BYTES; returns whether it had to trim. */
export function fitDoc(cafe: Cafe): { cafe: Cafe; trimmed: boolean } {
  let doc = cafe;
  let trimmed = false;
  while (docBytes(doc) > MAX_DOC_BYTES && (doc.beans.length > 0 || doc.menu.length > 0)) {
    trimmed = true;
    doc = {
      ...doc,
      menu: doc.menu.slice(0, Math.floor(doc.menu.length * 0.8)),
      beans: doc.beans.slice(0, Math.floor(doc.beans.length * 0.8)),
    };
  }
  return { cafe: doc, trimmed };
}
