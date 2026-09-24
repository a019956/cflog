// Shopify `/products.json` → RawBean[] (02 § Platform detection).
import { isCoffeeProduct } from '@cflog/shared';
import { enrichFromText, htmlToText, parseSizeGrams } from './keywords.js';
import type { RawBean } from './types.js';

interface ShopifyVariant {
  title?: string;
  price?: string | number;
  available?: boolean;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
}

interface ShopifyProduct {
  title?: string;
  handle?: string;
  body_html?: string | null;
  product_type?: string;
  tags?: string[] | string;
  variants?: ShopifyVariant[];
}

const tagList = (t: ShopifyProduct['tags']): string[] =>
  Array.isArray(t)
    ? t
    : typeof t === 'string'
      ? t
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
      : [];

function variantSize(v: ShopifyVariant): number | undefined {
  return parseSizeGrams([v.title, v.option1, v.option2, v.option3].filter(Boolean).join(' '));
}

/** Picks the smallest bag variant (price of the standard retail size), preferring available ones. */
function pickVariant(variants: readonly ShopifyVariant[]): { price?: number; size?: number } {
  const priced = variants
    .map((v) => ({ v, price: Number(v.price), size: variantSize(v) }))
    .filter((x) => Number.isFinite(x.price) && x.price > 0);
  if (priced.length === 0) return {};
  const pool = priced.some((x) => x.v.available !== false)
    ? priced.filter((x) => x.v.available !== false)
    : priced;
  pool.sort((a, b) => (a.size ?? Infinity) - (b.size ?? Infinity) || a.price - b.price);
  const best = pool[0]!;
  return { price: Math.round(best.price * 100) / 100, size: best.size };
}

/** Extracts coffee beans from one or more `/products.json` bodies. */
export function beansFromShopify(bodies: readonly unknown[], origin: string): RawBean[] {
  const out: RawBean[] = [];
  const seen = new Set<string>();
  for (const body of bodies) {
    const products = (body as { products?: ShopifyProduct[] } | undefined)?.products;
    if (!Array.isArray(products)) continue;
    for (const p of products) {
      if (!p || typeof p !== 'object') continue;
      const title = typeof p.title === 'string' ? p.title.trim() : '';
      if (!title || seen.has(title.toLowerCase())) continue;
      const tags = tagList(p.tags);
      if (!isCoffeeProduct({ title, type: p.product_type, tags })) continue;
      seen.add(title.toLowerCase());
      const variants = Array.isArray(p.variants)
        ? p.variants.filter((v) => v && typeof v === 'object')
        : [];
      const { price, size } = pickVariant(variants);
      out.push(
        enrichFromText(
          {
            name: title,
            url: p.handle ? `${origin}/products/${p.handle}` : undefined,
            description: htmlToText(p.body_html).slice(0, 4000),
            priceUsd: price,
            sizeGrams: size,
            inStock: variants.length ? variants.some((v) => v.available !== false) : undefined,
            source: 'shopify',
          },
          tags.join('\n'),
        ),
      );
    }
  }
  return out;
}
