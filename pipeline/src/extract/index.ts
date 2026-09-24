import type { CrawlResult } from '../crawl/site.js';
import { beansFromShopify } from './shopify.js';
import type { RawBean } from './types.js';
import { beansFromWoo } from './woocommerce.js';

export * from './keywords.js';
export * from './shopify.js';
export * from './types.js';
export * from './woocommerce.js';

/** Beans from store product JSON, if the crawl found any. Returns null when the site has no store JSON. */
export function beansFromStorePages(crawl: CrawlResult): RawBean[] | null {
  const bodies = crawl.pages
    .filter((p) => p.kind === 'products-json' && p.json !== undefined)
    .map((p) => p.json);
  if (bodies.length === 0) return null;
  const home = crawl.pages.find((p) => p.kind === 'home');
  const origin = home ? new URL(home.url).origin : '';
  if (crawl.platform === 'shopify') return beansFromShopify(bodies, origin);
  if (crawl.platform === 'woocommerce') return beansFromWoo(bodies);
  return null;
}
