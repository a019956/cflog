// Gemini extraction fallback (ADR-002): page text → ExtractionResult via JSON-schema structured output.
// Uses the public REST endpoint directly (no SDK) so the transport is easy to mock and pin.
import { FLAVOR_FAMILIES, MENU_CATEGORIES } from '@cflog/shared';
import type { Sleep } from '../crawl/http.js';
import type { ExtractionResult, RawBean, RawMenuItem } from './types.js';

export const DEFAULT_GEMINI_MODEL = 'gemini-flash-lite-latest';
export const MAX_PROMPT_CHARS = 30_000;

export type ExtractMode = 'beans' | 'menu' | 'both';

export const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    beans: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          url: { type: 'string' },
          originText: { type: 'string' },
          countries: { type: 'array', items: { type: 'string' } },
          region: { type: 'string' },
          farm: { type: 'string' },
          producer: { type: 'string' },
          process: { type: 'string' },
          roast: { type: 'string' },
          varieties: { type: 'array', items: { type: 'string' } },
          notes: { type: 'array', items: { type: 'string' } },
          flavorFamilies: { type: 'array', items: { type: 'string', enum: [...FLAVOR_FAMILIES] } },
          isDecaf: { type: 'boolean' },
          isBlend: { type: 'boolean' },
          priceUsd: { type: 'number' },
          sizeGrams: { type: 'number' },
        },
        required: ['name'],
      },
    },
    menu: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          category: { type: 'string', enum: [...MENU_CATEGORIES] },
          priceUsd: { type: 'number' },
          description: { type: 'string' },
        },
        required: ['name', 'category'],
      },
    },
  },
  required: ['beans', 'menu'],
} as const;

export interface PageText {
  url: string;
  kind: string;
  text: string;
}

export function buildPrompt(
  cafeName: string,
  mode: ExtractMode,
  pages: readonly PageText[],
): string {
  const task =
    mode === 'beans'
      ? 'List the coffee BEANS this business sells (whole bean or ground bags). Return an empty "menu".'
      : mode === 'menu'
        ? 'List the drinks and food on the CAFÉ MENU (what is served in the shop). Return an empty "beans".'
        : 'List (1) the coffee BEANS this business sells as bags and (2) the drinks and food on its CAFÉ MENU.';
  const rules = [
    'Use only information present in the pages. Never invent products, prices or attributes; omit unknown fields.',
    'Beans: one entry per coffee. Exclude merchandise, equipment, tea, subscriptions, gift cards and drinks.',
    'Beans: countries are ISO-3166 alpha-2 codes (e.g. "ET"); roast is one of light, medium-light, medium, medium-dark, dark, omni.',
    'Beans: process as written (e.g. "washed", "natural", "honey", "anaerobic"); notes are the tasting notes as written.',
    'Beans: flavorFamilies maps the tasting notes to the allowed flavor-wheel ids.',
    'Beans: priceUsd is the price of the smallest retail bag and sizeGrams its weight in grams.',
    'Menu: one entry per item with a category; priceUsd only when a single price is shown.',
  ];
  let budget = MAX_PROMPT_CHARS;
  const chunks: string[] = [];
  for (const p of pages) {
    if (budget <= 0) break;
    const body = p.text.slice(0, budget);
    budget -= body.length;
    chunks.push(`--- PAGE (${p.kind}) ${p.url}\n${body}`);
  }
  return `You extract structured data from a coffee business website.\nBusiness: ${cafeName}\nTask: ${task}\nRules:\n- ${rules.join('\n- ')}\n\n${chunks.join('\n\n')}`;
}

const str = (v: unknown, max = 200): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
const strs = (v: unknown, max = 12): string[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .map((x) => str(x, 60))
    .filter((x): x is string => !!x)
    .slice(0, max);
  return out.length ? out : undefined;
};

/** Coerces model output into ExtractionResult, dropping malformed entries. */
export function sanitizeExtraction(json: unknown, mode: ExtractMode): ExtractionResult {
  const root = (json && typeof json === 'object' ? json : {}) as {
    beans?: unknown;
    menu?: unknown;
  };
  const beans: RawBean[] = [];
  const menu: RawMenuItem[] = [];
  if (mode !== 'menu' && Array.isArray(root.beans)) {
    for (const b of root.beans.slice(0, 250) as Record<string, unknown>[]) {
      const name = str(b?.name, 120);
      if (!name) continue;
      beans.push({
        name,
        url: str(b.url, 500),
        originText: str(b.originText),
        countries: strs(b.countries)
          ?.map((c) => c.toUpperCase())
          .filter((c) => /^[A-Z]{2}$/.test(c)),
        region: str(b.region, 80),
        farm: str(b.farm, 80),
        producer: str(b.producer, 80),
        process: str(b.process, 60),
        roast: str(b.roast, 30),
        varieties: strs(b.varieties),
        notes: strs(b.notes, 8),
        flavorFamilies: strs(b.flavorFamilies),
        isDecaf: typeof b.isDecaf === 'boolean' ? b.isDecaf : undefined,
        isBlend: typeof b.isBlend === 'boolean' ? b.isBlend : undefined,
        priceUsd: num(b.priceUsd),
        sizeGrams: num(b.sizeGrams),
        source: 'llm',
      });
    }
  }
  if (mode !== 'beans' && Array.isArray(root.menu)) {
    for (const m of root.menu.slice(0, 200) as Record<string, unknown>[]) {
      const name = str(m?.name, 80);
      if (!name) continue;
      const category = (MENU_CATEGORIES as readonly string[]).includes(String(m.category))
        ? String(m.category)
        : 'other';
      menu.push({
        name,
        category,
        priceUsd: num(m.priceUsd),
        description: str(m.description, 200),
        source: 'llm',
      });
    }
  }
  return { beans, menu };
}

export class LlmBudgetExceeded extends Error {}

export interface GeminiResponse {
  status: number;
  json: unknown;
}
export type GeminiTransport = (
  url: string,
  body: unknown,
  apiKey: string,
) => Promise<GeminiResponse>;

export const geminiFetch: GeminiTransport = async (url, body, apiKey) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
};

export interface GeminiOptions {
  apiKey: string;
  model?: string;
  rpm: number;
  maxCalls: number;
  transport?: GeminiTransport;
  sleep?: Sleep;
  now?: () => number;
  maxRetries?: number;
}

function responseText(json: unknown): string | undefined {
  const parts = (json as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
    ?.candidates?.[0]?.content?.parts;
  return parts?.map((p) => p.text ?? '').join('') || undefined;
}

function retryDelayMs(json: unknown): number | undefined {
  const details =
    (json as { error?: { details?: { retryDelay?: string }[] } })?.error?.details ?? [];
  const d = details.find((x) => x.retryDelay)?.retryDelay;
  const s = d ? Number.parseFloat(d) : NaN;
  return Number.isFinite(s) ? s * 1000 : undefined;
}

/** Rate-limited, budgeted Gemini client. `calls` counts HTTP requests that reached the API. */
export class GeminiExtractor {
  calls = 0;
  private lastAt: number | undefined;
  readonly model: string;

  constructor(private readonly opts: GeminiOptions) {
    this.model = opts.model || DEFAULT_GEMINI_MODEL;
  }

  get remaining(): number {
    return Math.max(0, this.opts.maxCalls - this.calls);
  }

  private async throttle(): Promise<void> {
    const now = this.opts.now ?? Date.now;
    const sleep = this.opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const gap = 60_000 / Math.max(1, this.opts.rpm);
    if (this.lastAt !== undefined) {
      const wait = this.lastAt + gap - now();
      if (wait > 0) await sleep(wait);
    }
    this.lastAt = now();
  }

  async extract(
    cafeName: string,
    mode: ExtractMode,
    pages: readonly PageText[],
  ): Promise<ExtractionResult> {
    const transport = this.opts.transport ?? geminiFetch;
    const sleep = this.opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    const body = {
      contents: [{ role: 'user', parts: [{ text: buildPrompt(cafeName, mode, pages) }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseJsonSchema: EXTRACTION_SCHEMA,
      },
    };
    const maxRetries = this.opts.maxRetries ?? 3;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (this.calls >= this.opts.maxCalls)
        throw new LlmBudgetExceeded(`GEMINI_MAX_CALLS (${this.opts.maxCalls}) reached`);
      await this.throttle();
      this.calls++;
      const res = await transport(url, body, this.opts.apiKey);
      if (res.status === 200) {
        const text = responseText(res.json);
        if (!text) return { beans: [], menu: [] };
        try {
          return sanitizeExtraction(JSON.parse(text), mode);
        } catch {
          return { beans: [], menu: [] };
        }
      }
      if (res.status === 429 || res.status >= 500) {
        await sleep(retryDelayMs(res.json) ?? 5000 * 2 ** attempt);
        continue;
      }
      const msg =
        (res.json as { error?: { message?: string } })?.error?.message ?? `HTTP ${res.status}`;
      throw new Error(`Gemini ${this.model}: ${msg}`);
    }
    throw new Error(`Gemini ${this.model}: still rate-limited after ${maxRetries + 1} attempts`);
  }
}
