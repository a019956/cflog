// End-to-end city run with fake Overture rows, a fake web and a fake Gemini (no network).
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import type { HttpResponse, Transport } from '../src/crawl/http.js';
import type { OverturePlace } from '../src/discover/overture.js';
import { GeminiExtractor, type GeminiTransport } from '../src/extract/llm.js';
import { MemoryStore, withWriteBudget } from '../src/publish/store.js';
import { reportMarkdown, runCity } from '../src/run.js';

const place = (id: string, name: string, website?: string): OverturePlace => ({
  id,
  name,
  category: 'coffee_shop',
  alternates: [],
  confidence: 0.9,
  websites: website ? [website] : [],
  socials: [],
  phones: [],
  brand: null,
  street: '1 Sample St',
  locality: 'Boston',
  region: 'MA',
  postcode: '02110',
  operatingStatus: 'open',
  lng: -71.06,
  lat: 42.36,
});

const PLACES = [
  place('shop1', 'Sample Roasters', 'https://roasters.example'),
  place('cafe1', 'Corner Cafe', 'https://corner.example'),
  place('nosite', 'Tiny Bar'),
  place('chain', 'Starbucks', 'https://starbucks.example'),
];

function web(version: number) {
  const routes: Record<string, Partial<HttpResponse>> = {
    'https://roasters.example/robots.txt': { status: 404 },
    'https://roasters.example/': {
      text: '<html><script src="https://cdn.shopify.com/a.js"></script><body><a href="/pages/menu">Menu</a></body></html>',
    },
    'https://roasters.example/products.json?limit=100&page=1': {
      contentType: 'application/json',
      text: JSON.stringify({
        products: [
          {
            title: 'Ethiopia Guji',
            handle: 'guji',
            product_type: 'Coffee',
            body_html:
              '<p>Tasting notes: blueberry, jasmine</p><p>Process: Natural</p><p>Light roast</p>',
            variants: [{ title: '12 oz', price: '22.00', available: true }],
          },
          ...(version === 1
            ? [
                {
                  title: 'Colombia Huila',
                  handle: 'huila',
                  product_type: 'Coffee',
                  body_html: '<p>Notes: caramel, red apple. Washed process. Medium roast.</p>',
                  variants: [{ title: '12 oz', price: '19.00' }],
                },
              ]
            : []),
        ],
      }),
    },
    'https://roasters.example/pages/menu': {
      text: `<body><h1>Menu</h1><p>Latte 5.50</p><p>Cortado 4.25</p><p>${'Pastries daily. '.repeat(5)}</p></body>`,
    },
    'https://corner.example/robots.txt': { status: 404 },
    'https://corner.example/': {
      text: `<body><a href="/coffee">Our coffee</a><p>${'Welcome to the corner. '.repeat(5)}</p></body>`,
    },
    'https://corner.example/coffee': {
      text: `<body><h2>Kenya Nyeri — washed — blackcurrant, grapefruit — $20</h2><p>${'Seasonal coffee. '.repeat(5)}</p></body>`,
    },
  };
  const calls: string[] = [];
  const transport: Transport = async (url) => {
    calls.push(url);
    const r = routes[url];
    return { url, status: r ? 200 : 404, contentType: 'text/html', text: '', headers: {}, ...r };
  };
  return { transport, calls };
}

function gemini() {
  const prompts: string[] = [];
  const transport: GeminiTransport = async (_url, body) => {
    const prompt = (body as { contents: { parts: { text: string }[] }[] }).contents[0]!.parts[0]!
      .text;
    prompts.push(prompt);
    const payload = prompt.includes('Corner Cafe')
      ? {
          beans: [
            {
              name: 'Kenya Nyeri',
              countries: ['KE'],
              process: 'washed',
              notes: ['blackcurrant', 'grapefruit'],
              priceUsd: 20,
            },
          ],
          menu: [],
        }
      : {
          beans: [],
          menu: [
            { name: 'Latte', category: 'espresso', priceUsd: 5.5 },
            { name: 'Cortado', category: 'espresso', priceUsd: 4.25 },
          ],
        };
    return {
      status: 200,
      json: { candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] },
    };
  };
  return {
    g: new GeminiExtractor({
      apiKey: 'k',
      rpm: 1000,
      maxCalls: 10,
      transport,
      sleep: async () => {},
    }),
    prompts,
  };
}

describe('runCity end to end', () => {
  it('discovers, crawls, extracts, publishes; then skips unchanged sites on the next run', async () => {
    const config = await loadConfig();
    const mem = new MemoryStore();
    const store = withWriteBudget(mem, 1000);
    const base = {
      cityId: 'boston',
      config,
      store,
      contactUrl: 'https://c.example',
      maxCafes: null,
      query: async () => PLACES,
      sleep: async () => {},
    };

    const w1 = web(1);
    const g1 = gemini();
    const r1 = await runCity({
      ...base,
      gemini: g1.g,
      now: '2026-09-28T09:00:00.000Z',
      transport: w1.transport,
    });
    expect(r1.candidates).toBe(3);
    expect(r1.dropped).toEqual({ chain: 1 });
    expect(r1.crawl).toEqual({ ok: 2, 'no-site': 1 });
    expect(r1.storeJsonCafes).toBe(1);
    expect(r1.llm).toMatchObject({ planned: 2, done: 2, calls: 2 });
    expect(r1.publish).toMatchObject({ created: 3, indexWritten: true });

    const roasters = mem.cafes.get('shop1')!;
    expect(roasters.kind).toBe('roaster'); // name says Roasters
    expect(roasters.beans.map((b) => b.name).sort()).toEqual(['Colombia Huila', 'Ethiopia Guji']);
    expect(roasters.beans.find((b) => b.name === 'Ethiopia Guji')).toMatchObject({
      process: 'natural',
      roastLevel: 'light',
      priceUsd: 22,
      sizeGrams: 340,
    });
    expect(roasters.menu.map((m) => m.name)).toEqual(['Latte', 'Cortado']);
    expect(mem.cafes.get('cafe1')!.beans[0]).toMatchObject({
      name: 'Kenya Nyeri',
      origin: { countries: ['KE'] },
      process: 'washed',
      source: 'llm',
    });
    expect(mem.cafes.get('nosite')!.dataStatus).toBe('none');
    expect(mem.cityIndex.get('boston')!.cafes).toHaveLength(3);
    expect(reportMarkdown(r1)).toContain('3 new');

    // Run 2: the corner café is unchanged; the roaster dropped Huila (kept for one run).
    const w2 = web(2);
    const g2 = gemini();
    const writes = mem.writes;
    const r2 = await runCity({
      ...base,
      gemini: g2.g,
      now: '2026-10-05T09:00:00.000Z',
      transport: w2.transport,
    });
    expect(r2.unchangedPages).toBe(1);
    expect(g2.prompts.every((p) => !p.includes('Corner Cafe'))).toBe(true);
    // Huila is kept for one run, so the visible doc is identical → no café write
    expect(r2.publish).toMatchObject({ unchanged: 1, carried: 2, updated: 0 });
    expect(
      mem.cafes
        .get('shop1')!
        .beans.map((b) => b.name)
        .sort(),
    ).toEqual(['Colombia Huila', 'Ethiopia Guji']);
    expect(mem.writes - writes).toBeLessThanOrEqual(4);
  });

  it('retries next run when Gemini is unavailable', async () => {
    const config = await loadConfig();
    const mem = new MemoryStore();
    const r = await runCity({
      cityId: 'boston',
      config,
      store: withWriteBudget(mem, 1000),
      gemini: null,
      contactUrl: 'https://c.example',
      maxCafes: null,
      now: '2026-09-28T09:00:00.000Z',
      query: async () => PLACES,
      transport: web(1).transport,
      sleep: async () => {},
    });
    expect(r.llm.skippedBudget).toBe(2);
    // store beans still published; menu kept pending; corner café published without data and retried later
    expect(mem.cafes.get('shop1')!.beans).toHaveLength(2);
    expect(mem.states.get('boston')!.cafes.cafe1!.pagesHash).toBe('');
    // the menu job didn't run, so the roaster is re-processed next run too
    expect(mem.states.get('boston')!.cafes.shop1!.pagesHash).toBe('');
  });
});
