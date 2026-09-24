// Runs the real discovery SQL against a small local Parquet fixture built with DuckDB (no network).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { discoverCity } from '../src/discover/index.js';
import { queryOverturePlaces, runDuckDb } from '../src/discover/overture.js';

interface Row {
  id: string;
  name: string;
  primary: string;
  alternates?: string[];
  confidence?: number;
  websites?: string[];
  socials?: string[];
  brand?: string;
  status?: string;
  lng: number;
  lat: number;
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const list = (xs: string[] = []) => (xs.length ? `[${xs.map(q).join(', ')}]` : '[]::VARCHAR[]');

function rowSql(r: Row): string {
  return `SELECT ${q(r.id)} AS id,
    struct_pack("primary" := ${q(r.name)}) AS names,
    struct_pack("primary" := ${q(r.primary)}, hierarchy := ['food_and_drink', ${q(r.primary)}], alternates := ${list(r.alternates)}) AS taxonomy,
    ${r.confidence ?? 0.9}::DOUBLE AS confidence,
    ${list(r.websites)} AS websites,
    ${list(r.socials)} AS socials,
    ['+1 555 0100'] AS phones,
    struct_pack(names := struct_pack("primary" := ${r.brand ? q(r.brand) : 'NULL::VARCHAR'})) AS brand,
    [struct_pack(freeform := '1 Sample St', locality := 'Boston', region := 'MA', postcode := '02110')] AS addresses,
    ${q(r.status ?? 'open')} AS operating_status,
    struct_pack(xmin := ${r.lng}::FLOAT, xmax := ${r.lng}::FLOAT, ymin := ${r.lat}::FLOAT, ymax := ${r.lat}::FLOAT) AS bbox`;
}

const ROWS: Row[] = [
  {
    id: 'p1',
    name: 'Sample Roasters',
    primary: 'coffee_roastery',
    alternates: ['coffee_shop'],
    websites: ['https://sample.example/?utm=1'],
    socials: ['https://instagram.com/sample'],
    lng: -71.06,
    lat: 42.36,
  },
  { id: 'p2', name: 'Corner Café', primary: 'cafe', confidence: 0.8, lng: -71.1, lat: 42.37 },
  {
    id: 'p3',
    name: 'Starbucks',
    primary: 'coffee_shop',
    brand: 'Starbucks',
    lng: -71.05,
    lat: 42.35,
  },
  {
    id: 'p4',
    name: 'Bakery Place',
    primary: 'bakery',
    alternates: ['cafe'],
    lng: -71.05,
    lat: 42.35,
  },
  { id: 'p5', name: 'Far Coffee', primary: 'coffee_shop', lng: -73.99, lat: 40.73 },
  {
    id: 'p6',
    name: 'Closed Coffee',
    primary: 'coffee_shop',
    status: 'permanently_closed',
    lng: -71.07,
    lat: 42.34,
  },
  {
    id: 'p7',
    name: 'Maybe Coffee',
    primary: 'coffee_shop',
    confidence: 0.2,
    lng: -71.08,
    lat: 42.33,
  },
  {
    id: 'p8',
    name: 'Sample Roasters',
    primary: 'coffee_shop',
    confidence: 0.7,
    lng: -71.06,
    lat: 42.36018,
  },
  {
    id: 'p9',
    name: 'Espresso Bar',
    primary: 'restaurant',
    alternates: ['coffee_shop'],
    lng: -71.09,
    lat: 42.38,
  },
];

let dir: string;
let fixture: string;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'cflog-overture-'));
  fixture = path.join(dir, 'places.parquet');
  const sql = `COPY (${ROWS.map(rowSql).join('\nUNION ALL\n')}) TO ${q(fixture)} (FORMAT PARQUET)`;
  await runDuckDb(sql, fixture);
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('Overture discovery query', () => {
  it('selects coffee places inside the bbox by primary or alternate category', async () => {
    const cfg = (await loadConfig()).pipeline.overture;
    const places = await queryOverturePlaces(cfg, [-71.191, 42.227, -70.986, 42.42], fixture);
    expect(places.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p6', 'p7', 'p8', 'p9']);
    const p1 = places[0]!;
    expect(p1).toMatchObject({
      name: 'Sample Roasters',
      category: 'coffee_roastery',
      alternates: ['coffee_shop'],
      region: 'MA',
      operatingStatus: 'open',
    });
    expect(p1.lng).toBeCloseTo(-71.06, 4);
    expect(p1.lat).toBeCloseTo(42.36, 4);
    expect(p1.confidence).toBeCloseTo(0.9);
    expect(places.find((p) => p.id === 'p3')?.brand).toBe('Starbucks');
  });

  it('discovers Boston candidates end to end', async () => {
    const config = await loadConfig();
    config.pipeline.overture.source = fixture;
    const r = await discoverCity('boston', config);
    expect(r.candidates.map((c) => c.id)).toEqual(['p2', 'p9', 'p1']);
    expect(r.dropped.map((d) => `${d.id}:${d.reason}`).sort()).toEqual([
      'p3:chain',
      'p6:closed',
      'p7:low-confidence',
      'p8:duplicate',
    ]);
  });
});
