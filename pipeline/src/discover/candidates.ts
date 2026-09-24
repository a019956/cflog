// Turns Overture rows into café candidates: category/confidence/closed filters, chain deny-list,
// de-duplication, kind detection and overrides (ADR-001, ADR-007, ADR-008, ADR-014).
import { distanceKm, normalizeText, type Kind } from '@cflog/shared';
import type { ChainsConfig, OverridesConfig, PipelineConfig } from '../config.js';
import type { OverturePlace } from './overture.js';

export interface Candidate {
  id: string;
  cityId: string;
  name: string;
  kind: Kind;
  lat: number;
  lng: number;
  address: { line1?: string; city?: string; state?: string; postcode?: string };
  website?: string;
  phone?: string;
  instagram?: string;
  overtureId?: string;
  confidence?: number;
  source: 'overture' | 'manual';
  /** override-pinned platform, if any */
  platform?: string;
}

export interface DropRecord {
  id: string;
  name: string;
  reason: 'no-name' | 'closed' | 'low-confidence' | 'chain' | 'duplicate' | 'hidden';
}

export interface DiscoveryResult {
  cityId: string;
  candidates: Candidate[];
  dropped: DropRecord[];
}

const ROASTER_NAME = /\broast(er|ers|ery|eries|ing|works)\b/;

/** Chain match: normalised name or brand equals a deny entry or starts with it followed by a space. */
export function isChain(name: string, brand: string | null, chains: ChainsConfig): boolean {
  const deny = chains.deny.map(normalizeText).filter(Boolean);
  const candidates = [name, brand ?? ''].map(normalizeText).filter(Boolean);
  return candidates.some((n) => deny.some((d) => n === d || n.startsWith(`${d} `)));
}

/** Keeps scheme + host + path, drops query/fragment tracking; returns undefined for non-http URLs. */
export function cleanWebsite(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  // Other schemes (mailto:, tel:, javascript:) are not websites; "host:8080" is allowed.
  if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(raw) && !/^https?:/i.test(raw)) return undefined;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!/^https?:$/.test(u.protocol)) return undefined;
    const host = u.hostname.toLowerCase();
    // Social profiles are not café websites.
    if (/(^|\.)(instagram|facebook|twitter|x|tiktok|yelp|linktr)\.(com|ee)$/.test(host))
      return undefined;
    const p = u.pathname.replace(/\/+$/, '');
    return `${u.protocol}//${host}${p}`;
  } catch {
    return undefined;
  }
}

function instagramOf(urls: readonly string[]): string | undefined {
  const ig = urls.find((u) => /instagram\.com\//i.test(u));
  return ig?.replace(/[?#].*$/, '').replace(/\/+$/, '');
}

function normalizeRegion(region: string | null): string | undefined {
  if (!region) return undefined;
  return region.replace(/^US-/i, '').toUpperCase();
}

export function detectKind(
  place: Pick<OverturePlace, 'name' | 'category' | 'alternates'>,
  roasterCategories: readonly string[],
): Kind {
  const cats = [place.category ?? '', ...place.alternates];
  if (cats.some((c) => roasterCategories.includes(c))) return 'roaster';
  if (place.name && ROASTER_NAME.test(normalizeText(place.name))) return 'roaster';
  return 'cafe';
}

function toCandidate(p: OverturePlace, cityId: string, cfg: PipelineConfig['overture']): Candidate {
  const website = p.websites.map(cleanWebsite).find(Boolean);
  return {
    id: p.id,
    cityId,
    name: (p.name ?? '').trim(),
    kind: detectKind(p, cfg.roasterCategories),
    lat: p.lat,
    lng: p.lng,
    address: {
      line1: p.street ?? undefined,
      city: p.locality ?? undefined,
      state: normalizeRegion(p.region),
      postcode: p.postcode ?? undefined,
    },
    website,
    phone: p.phones[0],
    instagram: instagramOf([...p.socials, ...p.websites]),
    overtureId: p.id,
    confidence: p.confidence ?? undefined,
    source: 'overture',
  };
}

/** Pure: Overture rows for one city → candidates + drop log. */
export function toCandidates(
  places: readonly OverturePlace[],
  cityId: string,
  cfg: PipelineConfig,
  chains: ChainsConfig,
  overrides: OverridesConfig,
): DiscoveryResult {
  const dropped: DropRecord[] = [];
  const kept: Candidate[] = [];
  const hidden = new Set(overrides.hide);

  for (const p of places) {
    const name = p.name?.trim() ?? '';
    if (!name) {
      dropped.push({ id: p.id, name: '', reason: 'no-name' });
      continue;
    }
    if (hidden.has(p.id)) {
      dropped.push({ id: p.id, name, reason: 'hidden' });
      continue;
    }
    if (p.operatingStatus === 'permanently_closed' || p.operatingStatus === 'closed') {
      dropped.push({ id: p.id, name, reason: 'closed' });
      continue;
    }
    if (p.confidence != null && p.confidence < cfg.overture.minConfidence) {
      dropped.push({ id: p.id, name, reason: 'low-confidence' });
      continue;
    }
    if (isChain(name, p.brand, chains)) {
      dropped.push({ id: p.id, name, reason: 'chain' });
      continue;
    }
    kept.push(toCandidate(p, cityId, cfg.overture));
  }

  // De-duplicate: same normalised name within dedupeMeters → keep the higher-confidence one
  // (ties: the one with a website, then the lower id).
  kept.sort(
    (a, b) =>
      (b.confidence ?? 0) - (a.confidence ?? 0) ||
      Number(!!b.website) - Number(!!a.website) ||
      a.id.localeCompare(b.id),
  );
  const unique: Candidate[] = [];
  for (const c of kept) {
    const key = normalizeText(c.name);
    const dup = unique.find(
      (u) =>
        normalizeText(u.name) === key &&
        distanceKm([u.lng, u.lat], [c.lng, c.lat]) * 1000 <= cfg.discover.dedupeMeters,
    );
    if (dup) dropped.push({ id: c.id, name: c.name, reason: 'duplicate' });
    else unique.push(c);
  }

  // Patches
  for (const c of unique) {
    const patch = overrides.patch[c.id];
    if (!patch) continue;
    if (patch.name) c.name = patch.name;
    if (patch.kind) c.kind = patch.kind;
    if (patch.website) c.website = cleanWebsite(patch.website); // rejected URLs (social profiles, mailto:) clear the website
    if (patch.platform) c.platform = patch.platform;
  }

  // Manual additions for this city (skipped if hidden)
  for (const a of overrides.add) {
    if (a.cityId !== cityId || hidden.has(a.id)) continue;
    unique.push({
      id: a.id,
      cityId,
      name: a.name,
      kind: a.kind,
      lat: a.lat,
      lng: a.lng,
      address: { line1: a.address },
      website: cleanWebsite(a.website),
      source: 'manual',
      ...(overrides.patch[a.id]?.platform ? { platform: overrides.patch[a.id]!.platform } : {}),
    });
  }

  unique.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return { cityId, candidates: unique, dropped };
}

/** Names appearing at ≥ threshold locations across all launch cities (for the run report, ADR-014). */
export function findMultiLocation(
  all: readonly Candidate[],
  threshold: number,
): { name: string; count: number }[] {
  const counts = new Map<string, { name: string; count: number }>();
  for (const c of all) {
    const key = normalizeText(c.name);
    const e = counts.get(key) ?? { name: c.name, count: 0 };
    e.count++;
    counts.set(key, e);
  }
  return [...counts.values()]
    .filter((e) => e.count >= threshold)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
