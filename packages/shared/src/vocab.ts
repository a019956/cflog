// Controlled vocabularies (02 Architecture § Vocabularies).

export const ROAST_LEVELS = [
  'light',
  'medium-light',
  'medium',
  'medium-dark',
  'dark',
  'omni',
] as const;
export type RoastLevel = (typeof ROAST_LEVELS)[number];

export const ROAST_LABELS: Record<RoastLevel, string> = {
  light: 'Light',
  'medium-light': 'Medium-light',
  medium: 'Medium',
  'medium-dark': 'Medium-dark',
  dark: 'Dark',
  omni: 'Omni',
};

export const PROCESSES = [
  'washed',
  'natural',
  'honey',
  'anaerobic',
  'carbonic-maceration',
  'wet-hulled',
  'other',
] as const;
export type Process = (typeof PROCESSES)[number];

export const PROCESS_LABELS: Record<Process, string> = {
  washed: 'Washed',
  natural: 'Natural',
  honey: 'Honey',
  anaerobic: 'Anaerobic',
  'carbonic-maceration': 'Carbonic maceration',
  'wet-hulled': 'Wet-hulled',
  other: 'Other / experimental',
};

export const KINDS = ['roaster', 'cafe', 'both'] as const;
export type Kind = (typeof KINDS)[number];

export const DATA_STATUSES = ['beans', 'menu-only', 'none'] as const;
export type DataStatus = (typeof DATA_STATUSES)[number];

export const PLATFORMS = ['shopify', 'woocommerce', 'square', 'other', 'unknown'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const CRAWL_STATUSES = ['ok', 'blocked-robots', 'error', 'no-site'] as const;
export type CrawlStatus = (typeof CRAWL_STATUSES)[number];

export const MENU_CATEGORIES = [
  'espresso',
  'brewed',
  'pour-over',
  'cold',
  'tea',
  'food',
  'other',
] as const;
export type MenuCategory = (typeof MENU_CATEGORIES)[number];

export const BEAN_SOURCES = ['shopify', 'woocommerce', 'keywords', 'llm', 'override'] as const;
export type BeanSource = (typeof BEAN_SOURCES)[number];

/** Lower-case, strip accents, turn punctuation into spaces, collapse whitespace. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Normalised variety key, e.g. "SL-28" → "sl28", "Geisha" → "gesha". */
export function normalizeVariety(s: string): string {
  const n = normalizeText(s).replace(/\s+/g, ' ');
  const aliases: Record<string, string> = { geisha: 'gesha', 'sl 28': 'sl28', 'sl 34': 'sl34' };
  return aliases[n] ?? n.replace(/^(sl|ruiru|batian) (\d+)$/, '$1$2');
}
