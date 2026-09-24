// Crawls one café site within the page budget (02 § Crawler policy, § Platform detection).
import type { CrawlStatus, Platform } from '@cflog/shared';
import type { HttpGet, HttpResponse } from './http.js';
import type { HostQueue } from './hostQueue.js';
import { cleanText, detectPlatform, pickLinks, sha256, type LinkKind } from './html.js';
import { fetchRobots } from './robots.js';

export type PageKind = 'home' | LinkKind | 'products-json';

export interface CrawledPage {
  url: string;
  kind: PageKind;
  contentType: string;
  /** cleaned text for HTML, raw body for JSON, '' for PDF (text is extracted later) */
  text: string;
  /** parsed JSON body for store endpoints */
  json?: unknown;
  /** raw bytes for PDFs (kept in memory only) */
  bytes?: Uint8Array;
  hash: string;
}

export interface SiteInput {
  cafeId: string;
  website?: string;
  /** override-pinned platform */
  platform?: string;
}

export interface CrawlResult {
  cafeId: string;
  status: CrawlStatus;
  platform: Platform;
  pages: CrawledPage[];
  error?: string;
}

export interface CrawlDeps {
  get: HttpGet;
  queue: HostQueue;
  maxPages: number;
  /** max product-JSON pages to fetch (each counts toward maxPages) */
  maxJsonPages?: number;
}

const STORE_ENDPOINT: Partial<Record<Platform, (origin: string, page: number) => string>> = {
  shopify: (o, p) => `${o}/products.json?limit=250&page=${p}`,
  woocommerce: (o, p) => `${o}/wp-json/wc/store/v1/products?per_page=100&page=${p}`,
};

function isHtml(res: HttpResponse): boolean {
  return res.contentType.includes('html') || (!res.contentType && /<html|<body/i.test(res.text));
}

function toPage(res: HttpResponse, kind: PageKind): CrawledPage {
  if (res.bytes)
    return {
      url: res.url,
      kind: kind === 'home' ? 'pdf' : kind,
      contentType: res.contentType,
      text: '',
      bytes: res.bytes,
      hash: sha256(res.bytes),
    };
  if (res.contentType.includes('json') || kind === 'products-json') {
    let json: unknown;
    try {
      json = JSON.parse(res.text);
    } catch {
      json = undefined;
    }
    return {
      url: res.url,
      kind,
      contentType: res.contentType,
      text: res.text,
      json,
      hash: sha256(res.text),
    };
  }
  const text = isHtml(res) ? cleanText(res.text) : res.text;
  return { url: res.url, kind, contentType: res.contentType, text, hash: sha256(text) };
}

const PLATFORMS: readonly Platform[] = ['shopify', 'woocommerce', 'square', 'other', 'unknown'];

export async function crawlSite(site: SiteInput, deps: CrawlDeps): Promise<CrawlResult> {
  const base: Omit<CrawlResult, 'status'> = { cafeId: site.cafeId, platform: 'unknown', pages: [] };
  if (!site.website) return { ...base, status: 'no-site' };

  let start: URL;
  try {
    start = new URL(site.website);
  } catch {
    return { ...base, status: 'no-site', error: `bad website URL ${site.website}` };
  }

  const host = start.hostname;
  const origin = start.origin;
  const fetchAt = (url: string, accept?: string) =>
    deps.queue.run(new URL(url).hostname, () => deps.get(url, accept));

  const robots = await deps.queue.run(host, () => fetchRobots(origin, deps.get));
  if (robots.crawlDelay) deps.queue.setHostInterval(host, robots.crawlDelay * 1000);
  if (!robots.isAllowed(start.href)) return { ...base, status: 'blocked-robots' };

  const pages: CrawledPage[] = [];
  let budget = deps.maxPages;
  try {
    const home = await fetchAt(start.href);
    budget--;
    if (home.status >= 400)
      return { ...base, status: 'error', error: `HTTP ${home.status} for ${start.href}` };
    pages.push(toPage(home, 'home'));

    const pinned = PLATFORMS.find((p) => p === site.platform);
    const platform = pinned ?? detectPlatform(home.text, home.headers);
    const finalOrigin = new URL(home.url).origin;

    // Store product JSON (Shopify / WooCommerce)
    const endpoint = STORE_ENDPOINT[platform];
    if (endpoint) {
      const maxJson = Math.min(deps.maxJsonPages ?? 2, budget);
      for (let p = 1; p <= maxJson; p++) {
        const url = endpoint(finalOrigin, p);
        if (!robots.isAllowed(url)) break;
        const res = await fetchAt(url, 'application/json');
        budget--;
        if (res.status >= 400) break;
        const page = toPage(res, 'products-json');
        const items = Array.isArray(page.json)
          ? page.json
          : (page.json as { products?: unknown[] } | undefined)?.products;
        if (!Array.isArray(items) || items.length === 0) break;
        pages.push(page);
        if (items.length < (platform === 'shopify' ? 250 : 100)) break;
      }
    }

    // Menu / coffee / shop pages linked from home
    if (budget > 0 && isHtml(home)) {
      const rawHome = home.text;
      for (const link of pickLinks(rawHome, home.url, budget)) {
        if (!robots.isAllowed(link.url)) continue;
        try {
          const res = await fetchAt(link.url, link.kind === 'pdf' ? 'application/pdf' : undefined);
          budget--;
          if (res.status < 400) pages.push(toPage(res, link.kind));
        } catch {
          budget--;
        }
        if (budget <= 0) break;
      }
    }
    return { ...base, status: 'ok', platform, pages };
  } catch (err) {
    return { ...base, status: 'error', pages, error: (err as Error).message };
  }
}
