// Decides which cafés get a Gemini call, in priority order (02 § Platform detection → Menus).
import type { CrawlResult } from '../crawl/site.js';
import type { ExtractMode, PageText } from './llm.js';

export interface LlmJob {
  cafeId: string;
  cafeName: string;
  mode: ExtractMode;
  pages: PageText[];
  priority: 1 | 2 | 3;
}

export interface PlanInput {
  cafeName: string;
  crawl: CrawlResult;
  /** true when store JSON already produced beans */
  hasStoreBeans: boolean;
}

const BEAN_KINDS = new Set(['coffee', 'shop']);
const MENU_KINDS = new Set(['menu', 'pdf']);

/**
 * Priority 1: no store beans, has coffee/shop pages → beans + menu in one call.
 * Priority 2: has store beans, has menu/PDF pages → menu only.
 * Priority 3: no store beans, only home/menu pages → beans + menu from what there is.
 * Pages with no text (image-only PDFs) are never sent.
 */
export function planLlmJobs(inputs: readonly PlanInput[]): LlmJob[] {
  const jobs: LlmJob[] = [];
  for (const { cafeName, crawl, hasStoreBeans } of inputs) {
    if (crawl.status !== 'ok') continue;
    const withText = crawl.pages.filter(
      (p) => p.text.trim().length > 40 && p.kind !== 'products-json',
    );
    const beanPages = withText.filter((p) => BEAN_KINDS.has(p.kind));
    const menuPages = withText.filter((p) => MENU_KINDS.has(p.kind));
    const home = withText.filter((p) => p.kind === 'home');
    const toText = (ps: typeof withText): PageText[] =>
      ps.map((p) => ({ url: p.url, kind: p.kind, text: p.text }));
    if (!hasStoreBeans && beanPages.length > 0) {
      jobs.push({
        cafeId: crawl.cafeId,
        cafeName,
        mode: 'both',
        pages: toText([...beanPages, ...menuPages, ...home]),
        priority: 1,
      });
    } else if (hasStoreBeans && menuPages.length > 0) {
      jobs.push({
        cafeId: crawl.cafeId,
        cafeName,
        mode: 'menu',
        pages: toText(menuPages),
        priority: 2,
      });
    } else if (!hasStoreBeans && (menuPages.length > 0 || home.length > 0)) {
      jobs.push({
        cafeId: crawl.cafeId,
        cafeName,
        mode: 'both',
        pages: toText([...menuPages, ...home]),
        priority: 3,
      });
    }
  }
  return jobs.sort((a, b) => a.priority - b.priority || a.cafeId.localeCompare(b.cafeId));
}
