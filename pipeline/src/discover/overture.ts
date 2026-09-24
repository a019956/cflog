// Reads Overture Maps places for a bounding box with DuckDB (ADR-001).
import { DuckDBInstance } from '@duckdb/node-api';
import type { PipelineConfig } from '../config.js';

/** One row as returned by the discovery query. */
export interface OverturePlace {
  id: string;
  name: string | null;
  category: string | null;
  alternates: string[];
  confidence: number | null;
  websites: string[];
  socials: string[];
  phones: string[];
  brand: string | null;
  street: string | null;
  locality: string | null;
  region: string | null;
  postcode: string | null;
  operatingStatus: string | null;
  lng: number;
  lat: number;
}

const sqlString = (s: string) => `'${s.replace(/'/g, "''")}'`;
const sqlList = (xs: readonly string[]) => `[${xs.map(sqlString).join(', ')}]::VARCHAR[]`;

export function resolveSource(cfg: PipelineConfig['overture'], override?: string): string {
  return (override ?? cfg.source).replace('{release}', cfg.release);
}

/** Builds the bbox + category query. Coordinates are numbers from config, so inlining is safe. */
export function buildDiscoveryQuery(
  source: string,
  bbox: readonly [number, number, number, number],
  cfg: Pick<PipelineConfig['overture'], 'primaryCategories' | 'alternateCategories'>,
): string {
  const [minLng, minLat, maxLng, maxLat] = bbox.map(Number) as [number, number, number, number];
  if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite))
    throw new Error('bbox must be numeric');
  return `
SELECT
  id,
  names.primary AS name,
  taxonomy.primary AS category,
  coalesce(taxonomy.alternates, []::VARCHAR[]) AS alternates,
  CAST(confidence AS DOUBLE) AS confidence,
  coalesce(websites, []::VARCHAR[]) AS websites,
  coalesce(socials, []::VARCHAR[]) AS socials,
  coalesce(phones, []::VARCHAR[]) AS phones,
  brand.names.primary AS brand,
  addresses[1].freeform AS street,
  addresses[1].locality AS locality,
  addresses[1].region AS region,
  addresses[1].postcode AS postcode,
  operating_status AS operating_status,
  CAST((bbox.xmin + bbox.xmax) / 2 AS DOUBLE) AS lng,
  CAST((bbox.ymin + bbox.ymax) / 2 AS DOUBLE) AS lat
FROM read_parquet(${sqlString(source)}, hive_partitioning = true)
WHERE bbox.xmin >= ${minLng} AND bbox.xmax <= ${maxLng}
  AND bbox.ymin >= ${minLat} AND bbox.ymax <= ${maxLat}
  AND (
    taxonomy.primary IN (${cfg.primaryCategories.map(sqlString).join(', ')})
    OR list_has_any(coalesce(taxonomy.alternates, []::VARCHAR[]), ${sqlList(cfg.alternateCategories)})
  )
ORDER BY id`;
}

/** Debug query: coffee-sounding places in the box grouped by their primary category. */
export function buildCategoryInspectionQuery(
  source: string,
  bbox: readonly [number, number, number, number],
): string {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  return `
SELECT taxonomy.primary AS category, count(*) AS n, any_value(names.primary) AS example
FROM read_parquet(${sqlString(source)}, hive_partitioning = true)
WHERE bbox.xmin >= ${minLng} AND bbox.xmax <= ${maxLng} AND bbox.ymin >= ${minLat} AND bbox.ymax <= ${maxLat}
  AND (regexp_matches(lower(names.primary), 'coffee|espresso|roast|cafe|café')
       OR taxonomy.primary ILIKE '%coffee%' OR taxonomy.primary ILIKE '%cafe%')
GROUP BY 1 ORDER BY n DESC LIMIT 40`;
}

const asStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
const asString = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const asNumber = (v: unknown): number | null =>
  v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null;

export function rowToPlace(r: Record<string, unknown>): OverturePlace {
  return {
    id: String(r.id),
    name: asString(r.name),
    category: asString(r.category),
    alternates: asStrings(r.alternates),
    confidence: asNumber(r.confidence),
    websites: asStrings(r.websites),
    socials: asStrings(r.socials),
    phones: asStrings(r.phones),
    brand: asString(r.brand),
    street: asString(r.street),
    locality: asString(r.locality),
    region: asString(r.region),
    postcode: asString(r.postcode),
    operatingStatus: asString(r.operating_status),
    lng: Number(r.lng),
    lat: Number(r.lat),
  };
}

/** Runs a query against a fresh in-memory DuckDB, loading httpfs for s3:// / https:// sources. */
export async function runDuckDb(sql: string, source: string): Promise<Record<string, unknown>[]> {
  const instance = await DuckDBInstance.create(':memory:');
  const conn = await instance.connect();
  try {
    if (/^(s3|https?):\/\//.test(source)) {
      await conn.run('INSTALL httpfs; LOAD httpfs;');
      await conn.run("SET s3_region = 'us-west-2';");
    }
    const reader = await conn.runAndReadAll(sql);
    return reader.getRowObjectsJson() as Record<string, unknown>[];
  } finally {
    conn.closeSync();
    instance.closeSync();
  }
}

export async function queryOverturePlaces(
  cfg: PipelineConfig['overture'],
  bbox: readonly [number, number, number, number],
  sourceOverride?: string,
): Promise<OverturePlace[]> {
  const source = resolveSource(cfg, sourceOverride);
  const rows = await runDuckDb(buildDiscoveryQuery(source, bbox, cfg), source);
  return rows.map(rowToPlace);
}
