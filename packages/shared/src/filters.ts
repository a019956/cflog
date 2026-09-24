// Pure filter and sort logic shared by the app (02 § Filter semantics, ADR-007, ADR-009).
import { distanceKm } from './cities';
import { familyMatches, type FlavorFamilyId } from './flavor';
import type { Bean, CafeFacets, CafeSummary, Filters, LngLat } from './types';
import type { DataStatus, Kind } from './vocab';
import { normalizeVariety } from './vocab';

const has = <T>(arr: readonly T[] | undefined): arr is readonly T[] => !!arr && arr.length > 0;

/** True when any bean-level dimension is set (these exclude cafés without bean data). */
export function hasBeanFilter(f: Filters): boolean {
  return (
    has(f.roastLevels) ||
    has(f.processes) ||
    has(f.originCountries) ||
    has(f.flavorFamilies) ||
    has(f.varieties) ||
    f.decafOnly === true
  );
}

/** Number of active dimensions (for the "All filters" badge). */
export function countActiveFilters(f: Filters): number {
  return (
    Number(has(f.kinds)) +
    Number(f.sellsOnline === true) +
    Number(has(f.roastLevels)) +
    Number(has(f.processes)) +
    Number(has(f.originCountries)) +
    Number(has(f.flavorFamilies)) +
    Number(has(f.varieties)) +
    Number(f.decafOnly === true)
  );
}

function kindMatches(kind: Kind, wanted: readonly Kind[]): boolean {
  if (wanted.includes(kind)) return true;
  // A roaster with a café matches either "Roaster" or "Café".
  return kind === 'both' && (wanted.includes('roaster') || wanted.includes('cafe'));
}

function flavorsMatch(
  facet: readonly FlavorFamilyId[],
  selected: readonly FlavorFamilyId[],
): boolean {
  return selected.some((s) => facet.some((c) => familyMatches(c, s)));
}

function varietiesMatch(facet: readonly string[], selected: readonly string[]): boolean {
  const wanted = selected.map(normalizeVariety);
  return facet.some((v) => wanted.includes(normalizeVariety(v)));
}

const intersects = <T>(a: readonly T[], b: readonly T[]) => a.some((x) => b.includes(x));

function facetsMatch(c: CafeFacets, f: Filters): boolean {
  if (f.sellsOnline === true && !c.sellsOnline) return false;
  if (hasBeanFilter(f) && c.dataStatus !== 'beans') return false;
  if (has(f.roastLevels) && !intersects(c.roastLevels, f.roastLevels)) return false;
  if (has(f.processes) && !intersects(c.processes, f.processes)) return false;
  if (has(f.originCountries) && !intersects(c.originCountries, f.originCountries)) return false;
  if (has(f.flavorFamilies) && !flavorsMatch(c.flavorFamilies, f.flavorFamilies)) return false;
  if (has(f.varieties) && !varietiesMatch(c.varieties, f.varieties)) return false;
  if (f.decafOnly === true && !c.hasDecaf) return false;
  return true;
}

/** OR within a dimension, AND across dimensions; café-level matching. Returns a new array. */
export function applyFilters(cafes: readonly CafeSummary[], f: Filters): CafeSummary[] {
  return cafes.filter((c) => (!has(f.kinds) || kindMatches(c.kind, f.kinds)) && facetsMatch(c, f));
}

/** Bean-level check, used to highlight and order beans in the café sheet. */
export function beanMatchesFilters(b: Bean, f: Filters): boolean {
  if (!hasBeanFilter(f)) return false;
  if (has(f.roastLevels) && !(b.roastLevel && f.roastLevels.includes(b.roastLevel))) return false;
  if (has(f.processes) && !(b.process && f.processes.includes(b.process))) return false;
  if (has(f.originCountries) && !intersects(b.origin.countries, f.originCountries)) return false;
  if (has(f.flavorFamilies) && !flavorsMatch(b.flavorFamilies, f.flavorFamilies)) return false;
  if (has(f.varieties) && !varietiesMatch(b.varieties, f.varieties)) return false;
  if (f.decafOnly === true && !b.isDecaf) return false;
  return true;
}

/** Beans ordered for display: filter matches first, then in-stock, then name. */
export function orderBeans(beans: readonly Bean[], f: Filters): { bean: Bean; matches: boolean }[] {
  return beans
    .map((bean) => ({ bean, matches: beanMatchesFilters(bean, f) }))
    .sort(
      (a, b) =>
        Number(b.matches) - Number(a.matches) ||
        Number(b.bean.inStock !== false) - Number(a.bean.inStock !== false) ||
        a.bean.name.localeCompare(b.bean.name),
    );
}

const TIER: Record<DataStatus, number> = { beans: 0, 'menu-only': 1, none: 2 };

/**
 * Sort: dataStatus tier (beans > menu-only > none), then distance from `userLocation` when given,
 * else name. Returns a new array.
 */
export function sortCafes(
  cafes: readonly CafeSummary[],
  userLocation?: LngLat | null,
): CafeSummary[] {
  const dist = new Map<string, number>();
  if (userLocation) for (const c of cafes) dist.set(c.id, distanceKm(userLocation, [c.lng, c.lat]));
  return [...cafes].sort(
    (a, b) =>
      TIER[a.dataStatus] - TIER[b.dataStatus] ||
      (userLocation ? (dist.get(a.id) ?? 0) - (dist.get(b.id) ?? 0) : 0) ||
      a.name.localeCompare(b.name),
  );
}

/** Values present in a set of cafés, used to build filter-sheet options. */
export function facetOptions(cafes: readonly CafeSummary[]) {
  const collect = <K extends keyof CafeFacets>(key: K) =>
    [...new Set(cafes.flatMap((c) => c[key] as unknown as string[]))].sort();
  return {
    roastLevels: collect('roastLevels'),
    processes: collect('processes'),
    originCountries: collect('originCountries'),
    flavorFamilies: collect('flavorFamilies'),
    varieties: collect('varieties'),
    hasDecaf: cafes.some((c) => c.hasDecaf),
  };
}
