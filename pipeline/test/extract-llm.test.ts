import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CrawlResult } from '../src/crawl/site.js';
import {
  buildPrompt,
  DEFAULT_GEMINI_MODEL,
  GeminiExtractor,
  LlmBudgetExceeded,
  MAX_PROMPT_CHARS,
  sanitizeExtraction,
  type GeminiTransport,
} from '../src/extract/llm.js';
import { pdfText } from '../src/extract/pdf.js';
import { planLlmJobs } from '../src/extract/plan.js';

const ok = (payload: unknown) => ({
  status: 200,
  json: { candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] },
});

function fakeGemini(responses: { status: number; json: unknown }[]) {
  const requests: { url: string; body: unknown; apiKey: string }[] = [];
  const transport: GeminiTransport = async (url, body, apiKey) => {
    requests.push({ url, body, apiKey });
    return responses.shift() ?? ok({ beans: [], menu: [] });
  };
  return { transport, requests };
}

function clock() {
  let t = 0;
  const sleeps: number[] = [];
  return { now: () => t, sleep: async (ms: number) => void (sleeps.push(ms), (t += ms)), sleeps };
}

const PAGES = [
  {
    url: 'https://sample.example/coffee',
    kind: 'coffee',
    text: 'Ethiopia Guji — natural — blueberry, jasmine — $22 / 12 oz',
  },
];

describe('prompt and sanitising', () => {
  it('builds a bounded prompt with rules', () => {
    const p = buildPrompt('Sample Roasters', 'both', [
      { url: 'u', kind: 'home', text: 'x'.repeat(MAX_PROMPT_CHARS * 2) },
    ]);
    expect(p).toContain('Business: Sample Roasters');
    expect(p).toContain('Never invent');
    expect(p.length).toBeLessThan(MAX_PROMPT_CHARS + 2000);
  });
  it('coerces model output and drops junk', () => {
    const r = sanitizeExtraction(
      {
        beans: [
          {
            name: 'Ethiopia Guji',
            countries: ['et', 'Ethiopia'],
            roast: 'light',
            notes: ['blueberry', 7],
            priceUsd: 22,
            sizeGrams: 340,
            isDecaf: 'no',
          },
          { name: '' },
          { roast: 'dark' },
        ],
        menu: [
          { name: 'Latte', category: 'espresso', priceUsd: 5.5 },
          { name: 'Toast', category: 'breakfast' },
        ],
      },
      'both',
    );
    expect(r.beans).toEqual([
      expect.objectContaining({
        name: 'Ethiopia Guji',
        countries: ['ET'],
        roast: 'light',
        notes: ['blueberry'],
        priceUsd: 22,
        sizeGrams: 340,
        isDecaf: undefined,
        source: 'llm',
      }),
    ]);
    expect(r.menu).toEqual([
      expect.objectContaining({ name: 'Latte', category: 'espresso', priceUsd: 5.5 }),
      expect.objectContaining({ name: 'Toast', category: 'other' }),
    ]);
    expect(
      sanitizeExtraction({ beans: [{ name: 'X' }], menu: [{ name: 'Y', category: 'tea' }] }, 'menu')
        .beans,
    ).toEqual([]);
    expect(sanitizeExtraction('garbage', 'both')).toEqual({ beans: [], menu: [] });
  });
});

describe('GeminiExtractor', () => {
  it('sends a structured-output request and parses the answer', async () => {
    const { transport, requests } = fakeGemini([
      ok({ beans: [{ name: 'Ethiopia Guji', countries: ['ET'] }], menu: [] }),
    ]);
    const g = new GeminiExtractor({ apiKey: 'k', rpm: 10, maxCalls: 5, transport });
    const r = await g.extract('Sample', 'beans', PAGES);
    expect(r.beans[0]).toMatchObject({ name: 'Ethiopia Guji', countries: ['ET'] });
    expect(requests[0]!.url).toBe(
      `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent`,
    );
    expect(requests[0]!.apiKey).toBe('k');
    expect(requests[0]!.body).toMatchObject({
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    });
    expect(g.calls).toBe(1);
  });

  it('throttles to the configured RPM', async () => {
    const c = clock();
    const { transport } = fakeGemini([]);
    const g = new GeminiExtractor({
      apiKey: 'k',
      model: 'm',
      rpm: 10,
      maxCalls: 5,
      transport,
      sleep: c.sleep,
      now: c.now,
    });
    await g.extract('A', 'both', PAGES);
    await g.extract('B', 'both', PAGES);
    expect(c.sleeps).toEqual([6000]);
  });

  it('backs off on 429 using retryDelay and counts every attempt', async () => {
    const c = clock();
    const { transport } = fakeGemini([
      { status: 429, json: { error: { message: 'quota', details: [{ retryDelay: '12s' }] } } },
      ok({ beans: [], menu: [{ name: 'Latte', category: 'espresso' }] }),
    ]);
    const g = new GeminiExtractor({
      apiKey: 'k',
      rpm: 60,
      maxCalls: 5,
      transport,
      sleep: c.sleep,
      now: c.now,
    });
    const r = await g.extract('A', 'menu', PAGES);
    expect(r.menu).toHaveLength(1);
    expect(c.sleeps[0]).toBe(12000);
    expect(g.calls).toBe(2);
  });

  it('stops at the call budget and surfaces API errors', async () => {
    const { transport } = fakeGemini([
      { status: 400, json: { error: { message: 'API key not valid' } } },
    ]);
    const g = new GeminiExtractor({
      apiKey: 'bad',
      rpm: 60,
      maxCalls: 1,
      transport,
      sleep: async () => {},
    });
    await expect(g.extract('A', 'both', PAGES)).rejects.toThrow(/API key not valid/);
    await expect(g.extract('B', 'both', PAGES)).rejects.toBeInstanceOf(LlmBudgetExceeded);
    expect(g.remaining).toBe(0);
  });

  it('returns empty results for unparseable output', async () => {
    const { transport } = fakeGemini([
      { status: 200, json: { candidates: [{ content: { parts: [{ text: 'not json' }] } }] } },
    ]);
    const g = new GeminiExtractor({ apiKey: 'k', rpm: 60, maxCalls: 2, transport });
    expect(await g.extract('A', 'both', PAGES)).toEqual({ beans: [], menu: [] });
  });
});

describe('planLlmJobs', () => {
  const page = (kind: string, text = 'x'.repeat(60)) => ({
    url: `https://s.example/${kind}`,
    kind: kind as never,
    contentType: 'text/html',
    text,
    hash: kind,
  });
  const crawl = (
    cafeId: string,
    kinds: string[],
    status: CrawlResult['status'] = 'ok',
  ): CrawlResult => ({
    cafeId,
    status,
    platform: 'other',
    pages: kinds.map((k) => page(k)),
  });
  it('orders jobs by priority and picks the right mode', () => {
    const jobs = planLlmJobs([
      { cafeName: 'Home only', crawl: crawl('c3', ['home']), hasStoreBeans: false },
      {
        cafeName: 'Store + menu',
        crawl: crawl('c2', ['home', 'products-json', 'menu']),
        hasStoreBeans: true,
      },
      { cafeName: 'No store', crawl: crawl('c1', ['home', 'coffee', 'pdf']), hasStoreBeans: false },
      {
        cafeName: 'Store, no menu',
        crawl: crawl('c4', ['home', 'products-json']),
        hasStoreBeans: true,
      },
      { cafeName: 'Blocked', crawl: crawl('c5', [], 'blocked-robots'), hasStoreBeans: false },
    ]);
    expect(jobs.map((j) => [j.cafeId, j.mode, j.priority])).toEqual([
      ['c1', 'both', 1],
      ['c2', 'menu', 2],
      ['c3', 'both', 3],
    ]);
    expect(jobs[0]!.pages.map((p) => p.kind)).toEqual(['coffee', 'pdf', 'home']);
  });
  it('skips pages without text', () => {
    const c: CrawlResult = {
      cafeId: 'x',
      status: 'ok',
      platform: 'other',
      pages: [page('home', ''), page('pdf', '')],
    };
    expect(planLlmJobs([{ cafeName: 'X', crawl: c, hasStoreBeans: false }])).toEqual([]);
  });
});

describe('pdfText', () => {
  it('extracts text from a PDF menu', async () => {
    const bytes = new Uint8Array(readFileSync(new URL('../fixtures/menu.pdf', import.meta.url)));
    const text = await pdfText(bytes);
    expect(text).toContain('Latte 5.50');
    expect(text).toContain('Cortado 4.25');
  });
  it('returns an empty string for non-PDF bytes', async () => {
    expect(await pdfText(new Uint8Array([1, 2, 3]))).toBe('');
  });
});
