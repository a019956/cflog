// Crawls one café site within the page budget (02 § Crawler policy, § Platform detection).
import type { CrawlStatus, Platform } from '@cflog/shared';
import type { HttpGet, HttpResponse } from './http.js';
import { hostKey, type HostQueue } from './hostQueue.js';
import { cleanText, detectPlatform, pickLinks, sha256, type LinkKind } from './html.js';
import { fetchRobots, type RobotsRules } from './robots.js';

export type PageKind = 'home' | LinkKind | 'products-json';

export interface CrawledPage {
  url: string;
  kind: PageKind;
  contentType: string;
  /** cleaned text for HTML, raw body for JSON, extracted text for PDFs (when a converter is given) */
  text: string;
  /** parsed JSON body for store endpoints */
  json?: unknown;
  /** raw PDF bytes; only kept when no pdfToText converter is given */
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
  /** converts PDF bytes to text right after download so bytes are not held in memory */
  pdfToText?: (bytes: Uint8Array) => Promise<string>;
}

/** Store endpoints and their page sizes. Shopify is asked for 100 per page to keep bodies small. */
const STORE: Partial<
  Record<Platform, { url: (origin: string, page: number) => string; pageSize: number }>
> = {
  shopify: { url: (o, p) => `${o}/products.json?limit=100&page=${p}`, pageSize: 100 },
  woocommerce: {
    url: (o, p) => `${o}/wp-json/wc/store/v1/products?per_page=100&page=${p}`,
    pageSize: 100,
  },
};

function isHtml(res: HttpResponse): boolean {
  return res.contentType.includes('html') || (!res.contentType && /<html|<body/i.test(res.text));
}

async function toPage(res: HttpResponse, kind: PageKind, deps: CrawlDeps): Promise<CrawledPage> {
  if (res.bytes) {
    const hash = sha256(res.bytes);
    const pageKind = kind === 'home' ? 'pdf' : kind;
    if (deps.pdfToText)
      return {
        url: res.url,
        kind: pageKind,
        contentType: res.contentType,
        text: await deps.pdfToText(res.bytes),
        hash,
      };
    return {
      url: res.url,
      kind: pageKind,
      contentType: res.contentType,
      text: '',
      bytes: res.bytes,
      hash,
    };
  }
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
  if (!/^https?:$/.test(start.protocol))
    return { ...base, status: 'no-site', error: `unsupported URL ${site.website}` };

  // robots.txt per origin (a redirect to another origin gets its own robots.txt)
  const robotsByOrigin = new Map<string, RobotsRules>();
  const robotsFor = async (origin: string): Promise<RobotsRules> => {
    let r = robotsByOrigin.get(origin);
    if (!r) {
      r = await deps.queue.run(origin, () => fetchRobots(origin, deps.get));
      robotsByOrigin.set(origin, r);
      if (r.crawlDelay) deps.queue.setHostInterval(new URL(origin).hostname, r.crawlDelay * 1000);
    }
    return r;
  };
  const allowed = async (url: string) => (await robotsFor(new URL(url).origin)).isAllowed(url);
  const fetchAt = (url: string, accept?: string) =>
    deps.queue.run(hostKey(url), () => deps.get(url, accept));

  if (!(await allowed(start.href))) return { ...base, status: 'blocked-robots' };

  const pages: CrawledPage[] = [];
  let budget = deps.maxPages;
  let home: HttpResponse;
  try {
    home = await fetchAt(start.href);
  } catch (err) {
    return { ...base, status: 'error', error: (err as Error).message };
  }
  budget--;
  if (home.status >= 400)
    return { ...base, status: 'error', error: `HTTP ${home.status} for ${start.href}` };
  const finalOrigin = new URL(home.url).origin;
  if (finalOrigin !== start.origin && !(await allowed(home.url)))
    return { ...base, status: 'blocked-robots' };
  pages.push(await toPage(home, 'home', deps));

  const pinned = PLATFORMS.find((p) => p === site.platform);
  const platform = pinned ?? detectPlatform(home.text, home.headers);

  // Store product JSON (Shopify / WooCommerce); a failure here never discards the site.
  const store = STORE[platform];
  if (store) {
    const maxJson = Math.min(deps.maxJsonPages ?? 3, budget);
    for (let p = 1; p <= maxJson; p++) {
      const url = store.url(finalOrigin, p);
      if (!(await allowed(url))) break;
      let res: HttpResponse;
      try {
        res = await fetchAt(url, 'application/json');
      } catch {
        budget--;
        break;
      }
      budget--;
      if (res.status >= 400) break;
      const page = await toPage(res, 'products-json', deps);
      const items = Array.isArray(page.json)
        ? page.json
        : (page.json as { products?: unknown[] } | undefined)?.products;
      if (!Array.isArray(items) || items.length === 0) break;
      pages.push(page);
      if (items.length < store.pageSize) break;
    }
  }

  // Menu / coffee / shop pages linked from home (robots-blocked links don't use the budget)
  if (budget > 0 && isHtml(home)) {
    for (const link of pickLinks(home.text, home.url, 20)) {
      if (budget <= 0) break;
      if (!(await allowed(link.url))) continue;
      try {
        const res = await fetchAt(link.url, link.kind === 'pdf' ? 'application/pdf' : undefined);
        budget--;
        if (res.status < 400) pages.push(await toPage(res, link.kind, deps));
      } catch {
        budget--;
      }
    }
  }
  return { ...base, status: 'ok', platform, pages };
}
