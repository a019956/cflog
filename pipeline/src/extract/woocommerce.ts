// WooCommerce Store API (`/wp-json/wc/store/v1/products`) → RawBean[].
import { isCoffeeProduct } from '@cflog/shared';
import {
  enrichFromText,
  htmlToText,
  parseProcess,
  parseRoast,
  parseSizeGrams,
  splitNotes,
} from './keywords.js';
import type { RawBean } from './types.js';

interface WooTerm {
  name?: string;
}
interface WooAttribute {
  name?: string;
  terms?: WooTerm[];
}
interface WooProduct {
  name?: string;
  permalink?: string;
  short_description?: string;
  description?: string;
  prices?: { price?: string; currency_minor_unit?: number; currency_code?: string };
  categories?: WooTerm[];
  tags?: WooTerm[];
  attributes?: WooAttribute[];
  is_in_stock?: boolean;
}

const names = (xs?: WooTerm[]) =>
  (Array.isArray(xs) ? xs : [])
    .map((x) => (x && typeof x.name === 'string' ? x.name : ''))
    .filter(Boolean);

function attr(p: WooProduct, re: RegExp): string[] {
  return (Array.isArray(p.attributes) ? p.attributes : [])
    .filter((a) => a && re.test(a.name ?? ''))
    .flatMap((a) => names(a.terms));
}

export function beansFromWoo(bodies: readonly unknown[]): RawBean[] {
  const out: RawBean[] = [];
  const seen = new Set<string>();
  for (const body of bodies) {
    if (!Array.isArray(body)) continue;
    for (const p of body as WooProduct[]) {
      if (!p || typeof p !== 'object') continue;
      const title = typeof p.name === 'string' ? htmlToText(p.name).trim() : '';
      if (!title || seen.has(title.toLowerCase())) continue;
      const cats = names(p.categories);
      const tags = names(p.tags);
      if (!isCoffeeProduct({ title, type: cats.join(' '), tags })) continue;
      seen.add(title.toLowerCase());
      const minor = p.prices?.currency_minor_unit ?? 2;
      const raw = Number(p.prices?.price);
      const price =
        p.prices?.currency_code && p.prices.currency_code !== 'USD'
          ? undefined
          : Number.isFinite(raw) && raw > 0
            ? raw / 10 ** minor
            : undefined;
      const sizes = attr(p, /size|weight|bag/i);
      const origin = attr(p, /origin|country|region/i);
      const process = attr(p, /process/i)[0];
      const roast = attr(p, /roast/i)[0];
      const notes = attr(p, /note|tasting|flavou?r/i).flatMap(splitNotes);
      const varieties = attr(p, /variet|cultivar/i);
      out.push(
        enrichFromText(
          {
            name: title,
            url: p.permalink,
            description: htmlToText(`${p.short_description ?? ''}\n${p.description ?? ''}`).slice(
              0,
              4000,
            ),
            originText: origin.length ? origin.join(', ') : undefined,
            process: process && parseProcess(process) ? process : undefined,
            roast: roast && parseRoast(roast) ? roast : undefined,
            notes: notes.length ? notes : undefined,
            varieties: varieties.length ? varieties.map((v) => v.toLowerCase()) : undefined,
            priceUsd: price !== undefined ? Math.round(price * 100) / 100 : undefined,
            sizeGrams: sizes.map(parseSizeGrams).find((g) => g !== undefined),
            inStock: p.is_in_stock,
            source: 'woocommerce',
          },
          [...cats, ...tags].join('\n'),
        ),
      );
    }
  }
  return out;
}
