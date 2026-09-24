// HTML helpers: readable text, content hashes, link selection, platform detection.
import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';
import type { Platform } from '@cflog/shared';

export function sha256(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Visible text of a page, scripts/styles removed, whitespace collapsed. */
export function cleanText(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, noscript, svg, iframe, template, link, meta').remove();
  $('br, p, div, li, h1, h2, h3, h4, h5, h6, tr, section, article').after('\n');
  return $('body')
    .text()
    .replace(/[ \t\f\v\u00a0]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export type LinkKind = 'menu' | 'coffee' | 'shop' | 'pdf';

export interface PickedLink {
  url: string;
  kind: LinkKind;
}

const SKIP_PATH =
  /\/(cart|checkout|account|login|signin|register|wishlist|search|policies|policy|privacy|terms|blog|news|careers|jobs|wholesale-login|gift-card|subscriptions?)(\/|$)/i;
const SKIP_EXT = /\.(jpe?g|png|gif|webp|svg|mp4|mov|zip|docx?|xlsx?)$/i;

function classify(path: string, text: string): LinkKind | null {
  const hay = `${path} ${text}`.toLowerCase();
  if (/\.pdf$/i.test(path) && /menu|drink|cafe|café|bar/.test(hay)) return 'pdf';
  if (/\bmenus?\b|\/menu/.test(hay)) return 'menu';
  if (/\b(coffees?|beans?|single[- ]origins?|blends?|espresso)\b|\/coffee|\/beans/.test(hay))
    return 'coffee';
  if (/\b(shop|store)\b|\/shop|\/store|\/collections\/all/.test(hay)) return 'shop';
  return null;
}

const RANK: Record<LinkKind, number> = { coffee: 0, menu: 1, pdf: 2, shop: 3 };

const bareHost = (h: string) => h.toLowerCase().replace(/^www\./, '');

/** Picks up to `max` same-site links that likely lead to beans or the menu (02 § Crawler policy). */
export function pickLinks(html: string, pageUrl: string, max: number): PickedLink[] {
  const $ = cheerio.load(html);
  const base = new URL(pageUrl);
  const seen = new Set<string>([base.href.replace(/#.*$/, '')]);
  const found: PickedLink[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    let u: URL;
    try {
      u = new URL(href, base);
    } catch {
      return;
    }
    if (!/^https?:$/.test(u.protocol) || bareHost(u.hostname) !== bareHost(base.hostname)) return;
    u.hash = '';
    if (SKIP_PATH.test(u.pathname) || SKIP_EXT.test(u.pathname)) return;
    const key = u.href;
    if (seen.has(key)) return;
    const kind = classify(u.pathname, $(el).text().trim());
    if (!kind) return;
    seen.add(key);
    found.push({ url: key, kind });
  });
  // Stable: best kind first, then shorter paths (index pages beat product pages), then document order.
  return found
    .map((l, i) => ({ l, i }))
    .sort(
      (a, b) =>
        RANK[a.l.kind] - RANK[b.l.kind] ||
        new URL(a.l.url).pathname.length - new URL(b.l.url).pathname.length ||
        a.i - b.i,
    )
    .slice(0, max)
    .map((x) => x.l);
}

/** Detects the e-commerce platform from HTML markers and response headers. */
export function detectPlatform(html: string, headers: Record<string, string> = {}): Platform {
  const h = html.slice(0, 400_000);
  if (
    headers['x-shopid'] ||
    headers['x-shopify-stage'] ||
    /cdn\.shopify\.com|Shopify\.theme|shopify-section/i.test(h)
  )
    return 'shopify';
  if (/wp-content\/plugins\/woocommerce|woocommerce-page|class="[^"]*\bwoocommerce\b/i.test(h))
    return 'woocommerce';
  if (/square\.site|squareup\.com|editmysite\.com|square-online/i.test(h)) return 'square';
  return 'other';
}
