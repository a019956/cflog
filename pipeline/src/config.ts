// Loads and validates pipeline/config/*.yaml.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KINDS, type Kind } from '@cflog/shared';
import { parse } from 'yaml';

export const CONFIG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../config');

export interface PipelineConfig {
  overture: {
    release: string;
    source: string;
    primaryCategories: string[];
    alternateCategories: string[];
    roasterCategories: string[];
    minConfidence: number;
  };
  discover: { dedupeMeters: number; multiLocationThreshold: number };
  crawler: {
    userAgent: string;
    minIntervalMsPerHost: number;
    hostConcurrency: number;
    maxPagesPerSite: number;
    timeoutMs: number;
    retries: number;
  };
  limits: { maxBeansPerCafe: number; maxMenuItemsPerCafe: number };
}

export interface ChainsConfig {
  deny: string[];
}

export interface OverrideAdd {
  id: string;
  cityId: string;
  name: string;
  kind: Kind;
  lat: number;
  lng: number;
  address?: string;
  website?: string;
}

export interface OverridePatch {
  name?: string;
  kind?: Kind;
  website?: string;
  platform?: string;
}

export interface OverridesConfig {
  add: OverrideAdd[];
  hide: string[];
  patch: Record<string, OverridePatch>;
}

export class ConfigError extends Error {}

function fail(file: string, msg: string): never {
  throw new ConfigError(`${file}: ${msg}`);
}

function obj(v: unknown, file: string, key: string): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(file, `"${key}" must be a mapping`);
  return v as Record<string, unknown>;
}
function str(v: unknown, file: string, key: string): string {
  if (typeof v !== 'string' || v.trim() === '') fail(file, `"${key}" must be a non-empty string`);
  return v;
}
function num(v: unknown, file: string, key: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(file, `"${key}" must be a number`);
  return v;
}
function strList(v: unknown, file: string, key: string): string[] {
  if (v == null) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string'))
    fail(file, `"${key}" must be a list of strings`);
  return v as string[];
}

export function parsePipelineConfig(text: string, file = 'pipeline.yaml'): PipelineConfig {
  const root = obj(parse(text), file, '(root)');
  const o = obj(root.overture, file, 'overture');
  const d = obj(root.discover, file, 'discover');
  const c = obj(root.crawler, file, 'crawler');
  const l = obj(root.limits, file, 'limits');
  const cfg: PipelineConfig = {
    overture: {
      release: str(o.release, file, 'overture.release'),
      source: str(o.source, file, 'overture.source'),
      primaryCategories: strList(o.primaryCategories, file, 'overture.primaryCategories'),
      alternateCategories: strList(o.alternateCategories, file, 'overture.alternateCategories'),
      roasterCategories: strList(o.roasterCategories, file, 'overture.roasterCategories'),
      minConfidence: num(o.minConfidence, file, 'overture.minConfidence'),
    },
    discover: {
      dedupeMeters: num(d.dedupeMeters, file, 'discover.dedupeMeters'),
      multiLocationThreshold: num(
        d.multiLocationThreshold,
        file,
        'discover.multiLocationThreshold',
      ),
    },
    crawler: {
      userAgent: str(c.userAgent, file, 'crawler.userAgent'),
      minIntervalMsPerHost: num(c.minIntervalMsPerHost, file, 'crawler.minIntervalMsPerHost'),
      hostConcurrency: num(c.hostConcurrency, file, 'crawler.hostConcurrency'),
      maxPagesPerSite: num(c.maxPagesPerSite, file, 'crawler.maxPagesPerSite'),
      timeoutMs: num(c.timeoutMs, file, 'crawler.timeoutMs'),
      retries: num(c.retries, file, 'crawler.retries'),
    },
    limits: {
      maxBeansPerCafe: num(l.maxBeansPerCafe, file, 'limits.maxBeansPerCafe'),
      maxMenuItemsPerCafe: num(l.maxMenuItemsPerCafe, file, 'limits.maxMenuItemsPerCafe'),
    },
  };
  if (cfg.overture.primaryCategories.length === 0)
    fail(file, '"overture.primaryCategories" must not be empty');
  return cfg;
}

export function parseChainsConfig(text: string, file = 'chains.yaml'): ChainsConfig {
  const root = obj(parse(text) ?? {}, file, '(root)');
  return { deny: strList(root.deny, file, 'deny') };
}

export function parseOverridesConfig(text: string, file = 'overrides.yaml'): OverridesConfig {
  const root = obj(parse(text) ?? {}, file, '(root)');
  const addRaw = root.add ?? [];
  if (!Array.isArray(addRaw)) fail(file, '"add" must be a list');
  const add = addRaw.map((a, i) => {
    const e = obj(a, file, `add[${i}]`);
    const kind = str(e.kind, file, `add[${i}].kind`);
    if (!(KINDS as readonly string[]).includes(kind))
      fail(file, `add[${i}].kind must be one of ${KINDS.join(', ')}`);
    const id = str(e.id, file, `add[${i}].id`);
    if (!id.startsWith('manual-')) fail(file, `add[${i}].id must start with "manual-"`);
    return {
      id,
      cityId: str(e.cityId, file, `add[${i}].cityId`),
      name: str(e.name, file, `add[${i}].name`),
      kind: kind as Kind,
      lat: num(e.lat, file, `add[${i}].lat`),
      lng: num(e.lng, file, `add[${i}].lng`),
      address: typeof e.address === 'string' ? e.address : undefined,
      website: typeof e.website === 'string' ? e.website : undefined,
    } satisfies OverrideAdd;
  });
  const patchRaw = obj(root.patch ?? {}, file, 'patch');
  const patch: Record<string, OverridePatch> = {};
  for (const [id, p] of Object.entries(patchRaw)) {
    const e = obj(p, file, `patch.${id}`);
    if (e.kind !== undefined && !(KINDS as readonly string[]).includes(String(e.kind)))
      fail(file, `patch.${id}.kind must be one of ${KINDS.join(', ')}`);
    patch[id] = {
      name: typeof e.name === 'string' ? e.name : undefined,
      kind: e.kind as Kind | undefined,
      website: typeof e.website === 'string' ? e.website : undefined,
      platform: typeof e.platform === 'string' ? e.platform : undefined,
    };
  }
  return { add, hide: strList(root.hide, file, 'hide'), patch };
}

export interface AllConfig {
  pipeline: PipelineConfig;
  chains: ChainsConfig;
  overrides: OverridesConfig;
}

export async function loadConfig(dir = CONFIG_DIR): Promise<AllConfig> {
  const read = (f: string) => readFile(path.join(dir, f), 'utf8');
  return {
    pipeline: parsePipelineConfig(await read('pipeline.yaml')),
    chains: parseChainsConfig(await read('chains.yaml')),
    overrides: parseOverridesConfig(await read('overrides.yaml')),
  };
}
