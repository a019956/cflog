import { describe, expect, it } from 'vitest';
import {
  cleanWebsite,
  detectKind,
  findMultiLocation,
  isChain,
  toCandidates,
} from '../src/discover/candidates.js';
import type { OverturePlace } from '../src/discover/overture.js';
import { parsePipelineConfig } from '../src/config.js';
import { readFileSync } from 'node:fs';

const cfg = parsePipelineConfig(
  readFileSync(new URL('../config/pipeline.yaml', import.meta.url), 'utf8'),
);
const chains = { deny: ['Starbucks', "Dunkin'", "Peet's Coffee"] };
const noOverrides = { add: [], hide: [], patch: {} };

function place(p: Partial<OverturePlace> & { id: string }): OverturePlace {
  return {
    name: p.id,
    category: 'coffee_shop',
    alternates: [],
    confidence: 0.9,
    websites: [],
    socials: [],
    phones: [],
    brand: null,
    street: null,
    locality: null,
    region: null,
    postcode: null,
    operatingStatus: 'open',
    lng: -71.06,
    lat: 42.36,
    ...p,
  };
}

describe('chain matching', () => {
  it('matches deny entries case/punctuation-insensitively, by prefix or brand', () => {
    expect(isChain('STARBUCKS', null, chains)).toBe(true);
    expect(isChain('Starbucks Reserve Roastery', null, chains)).toBe(true);
    expect(isChain('Dunkin', null, chains)).toBe(true);
    expect(isChain('Peets Coffee & Tea', null, chains)).toBe(true);
    expect(isChain('Peetsburgh Coffee', null, chains)).toBe(false);
    expect(isChain('Peets Coffee', null, chains)).toBe(true);
    expect(isChain('Corner Shop', 'Starbucks', chains)).toBe(true);
    expect(isChain('Starbucksy Independent', null, chains)).toBe(false);
  });
});

describe('helpers', () => {
  it('cleans websites and rejects social profiles', () => {
    expect(cleanWebsite('https://Sample.example/shop/?utm_source=x#top')).toBe(
      'https://sample.example/shop',
    );
    expect(cleanWebsite('sample.example')).toBe('https://sample.example');
    expect(cleanWebsite('https://www.instagram.com/sample')).toBeUndefined();
    expect(cleanWebsite('mailto:a@b.c')).toBeUndefined();
  });
  it('detects roasters by category or name', () => {
    expect(
      detectKind({ name: 'X', category: 'coffee_roastery', alternates: [] }, ['coffee_roastery']),
    ).toBe('roaster');
    expect(
      detectKind({ name: 'X', category: 'cafe', alternates: ['coffee_roastery'] }, [
        'coffee_roastery',
      ]),
    ).toBe('roaster');
    expect(
      detectKind({ name: 'Sample Coffee Roasters', category: 'coffee_shop', alternates: [] }, [
        'coffee_roastery',
      ]),
    ).toBe('roaster');
    expect(
      detectKind({ name: 'Roast Beef Deli Cafe', category: 'cafe', alternates: [] }, [
        'coffee_roastery',
      ]),
    ).toBe('cafe');
  });
});

describe('toCandidates', () => {
  const places = [
    place({
      id: 'p1',
      name: 'Sample Roasters',
      category: 'coffee_roastery',
      websites: ['https://sample.example/?utm=1'],
      socials: ['https://instagram.com/sample/'],
      region: 'US-MA',
      locality: 'Boston',
    }),
    place({ id: 'p2', name: 'Corner Café', category: 'cafe', confidence: 0.8 }),
    place({ id: 'p3', name: 'Starbucks', brand: 'Starbucks' }),
    place({ id: 'p6', name: 'Closed Coffee', operatingStatus: 'permanently_closed' }),
    place({ id: 'p7', name: 'Maybe Coffee', confidence: 0.2 }),
    place({ id: 'p8', name: 'Sample Roasters', confidence: 0.7, lat: 42.36018 }),
    place({ id: 'p10', name: '  ' }),
  ];
  it('filters, de-duplicates and maps fields', () => {
    const r = toCandidates(places, 'boston', cfg, chains, noOverrides);
    expect(r.candidates.map((c) => c.id)).toEqual(['p2', 'p1']);
    expect(Object.fromEntries(r.dropped.map((d) => [d.id, d.reason]))).toEqual({
      p3: 'chain',
      p6: 'closed',
      p7: 'low-confidence',
      p8: 'duplicate',
      p10: 'no-name',
    });
    const p1 = r.candidates.find((c) => c.id === 'p1')!;
    expect(p1).toMatchObject({
      kind: 'roaster',
      website: 'https://sample.example',
      instagram: 'https://instagram.com/sample',
      address: { state: 'MA', city: 'Boston' },
      source: 'overture',
    });
  });
  it('keeps same-name places that are far apart', () => {
    const r = toCandidates(
      [place({ id: 'a', name: 'Twin' }), place({ id: 'b', name: 'Twin', lat: 42.37 })],
      'boston',
      cfg,
      chains,
      noOverrides,
    );
    expect(r.candidates).toHaveLength(2);
  });
  it('applies hide, patch and add overrides', () => {
    const r = toCandidates(places, 'boston', cfg, chains, {
      hide: ['p2', 'manual-gone'],
      patch: { p1: { kind: 'both', website: 'https://shop.sample.example/' } },
      add: [
        {
          id: 'manual-new',
          cityId: 'boston',
          name: 'New Spot',
          kind: 'cafe',
          lat: 42.35,
          lng: -71.07,
          website: 'newspot.example',
        },
        { id: 'manual-nyc', cityId: 'nyc', name: 'Elsewhere', kind: 'cafe', lat: 40.7, lng: -74 },
        {
          id: 'manual-gone',
          cityId: 'boston',
          name: 'Gone',
          kind: 'cafe',
          lat: 42.35,
          lng: -71.07,
        },
      ],
    });
    expect(r.candidates.map((c) => c.id)).toEqual(['manual-new', 'p1']);
    expect(r.candidates.find((c) => c.id === 'p1')).toMatchObject({
      kind: 'both',
      website: 'https://shop.sample.example',
    });
    expect(r.candidates[0]).toMatchObject({ source: 'manual', website: 'https://newspot.example' });
    expect(r.dropped.find((d) => d.id === 'p2')?.reason).toBe('hidden');
  });
});

describe('findMultiLocation', () => {
  it('flags names at or above the threshold', () => {
    const mk = (id: string, name: string) => ({
      id,
      cityId: 'x',
      name,
      kind: 'cafe' as const,
      lat: 0,
      lng: 0,
      address: {},
      source: 'overture' as const,
    });
    const all = [
      ...Array.from({ length: 5 }, (_, i) => mk(`a${i}`, 'Multi Coffee')),
      mk('b', 'Solo'),
      mk('c', 'multi coffee'),
    ];
    expect(findMultiLocation(all, 5)).toEqual([{ name: 'Multi Coffee', count: 6 }]);
  });
});
