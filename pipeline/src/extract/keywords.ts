// Deterministic attribute parsing from product text (regex/keyword pass, 02 § Platform detection).
// Also used by the normaliser to map free-text roast/process strings (e.g. from Gemini) to vocabularies.
import * as cheerio from 'cheerio';
import { countriesInText, normalizeText, type Process, type RoastLevel } from '@cflog/shared';
import type { RawBean } from './types.js';

export function htmlToText(html: string | undefined | null): string {
  if (!html) return '';
  if (!/<[a-z!/]/i.test(html)) return html.trim();
  const $ = cheerio.load(html);
  $('script, style').remove();
  $('br, p, div, li, h1, h2, h3, h4, tr').after('\n');
  return $.root()
    .text()
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

const ROAST_PATTERNS: [RegExp, RoastLevel][] = [
  [/\bomni\b/, 'omni'],
  [/\b(medium light|light medium)\b/, 'medium-light'],
  [/\b(medium dark|dark medium|full city)\b/, 'medium-dark'],
  [/\b(light|nordic|filter)\b/, 'light'],
  [/\b(dark|french|italian|vienna)\b/, 'dark'],
  [/\b(medium|city)\b/, 'medium'],
];

/** Maps a roast description ("Medium-Light", "light roast", "Roast: dark") to a RoastLevel. */
export function parseRoast(text: string | undefined | null): RoastLevel | null {
  if (!text) return null;
  const t = normalizeText(text);
  for (const [re, level] of ROAST_PATTERNS) if (re.test(t)) return level;
  return null;
}

/** Finds a roast level stated in longer text ("… our light roast …", "Roast level: Medium"). */
export function findRoastInText(text: string): RoastLevel | null {
  const t = normalizeText(text);
  const labelled = t.match(
    /\broast(?: level| profile)? (omni|medium light|light medium|medium dark|light|medium|dark)\b/,
  );
  if (labelled) return parseRoast(labelled[1]);
  const m = t.match(
    /\b(omni|medium light|light medium|medium dark|light|medium|dark|filter|espresso)(?: roast(?:ed)?)\b/,
  );
  if (m && m[1] !== 'espresso') return parseRoast(m[1]);
  if (/\bomni roast|\bomniroast\b/.test(t)) return 'omni';
  return null;
}

const PROCESS_PATTERNS: [RegExp, Process][] = [
  [/\bcarbonic( maceration)?\b/, 'carbonic-maceration'],
  [/\banaerobic\b/, 'anaerobic'],
  [/\b(wet hulled|giling basah)\b/, 'wet-hulled'],
  [/\b(honey|pulped natural|semi washed|miel)\b/, 'honey'],
  [/\b(natural|naturally|dry process(ed)?|sun dried|unwashed)\b/, 'natural'],
  [/\b(washed|wet process(ed)?|fully washed|lavado|kenyan process|double washed)\b/, 'washed'],
  [
    /\b(experimental|co ferment(ed)?|infused|thermal shock|koji|yeast|lactic|extended fermentation)\b/,
    'other',
  ],
];

/** Maps a process description to a Process. Order matters: specific methods before generic ones. */
export function parseProcess(text: string | undefined | null): Process | null {
  if (!text) return null;
  const t = normalizeText(text);
  for (const [re, p] of PROCESS_PATTERNS) if (re.test(t)) return p;
  return null;
}

/**
 * Finds a process in longer text. A "Process: …" label wins; otherwise only unambiguous phrases count
 * ("natural process", "anaerobic"), because bare "natural"/"honey" often describe flavour, not process.
 */
export function findProcessInText(text: string): Process | null {
  const labelled = text.match(/process(?:ing)?(?: method)?\s*[:\-–—]\s*([^\n|•;]+)/i);
  if (labelled) return parseProcess(labelled[1]);
  const t = normalizeText(text);
  const m = t.match(
    /\b(carbonic maceration|anaerobic|wet hulled|giling basah|pulped natural|fully washed|double washed|dry processed|sun dried|(?:honey|natural|washed) process(?:ed)?|naturally processed)\b/,
  );
  return m ? parseProcess(m[1]) : null;
}

const VARIETIES: [RegExp, string][] = [
  [/\b(gesha|geisha)\b/, 'gesha'],
  [/\bpink bourbon\b/, 'pink bourbon'],
  [/\bred bourbon\b/, 'red bourbon'],
  [/\byellow bourbon\b/, 'yellow bourbon'],
  [/\bbourbon\b(?! barrel| cask)/, 'bourbon'],
  [/\btypica\b/, 'typica'],
  [/\bcaturra\b/, 'caturra'],
  [/\bcatuai\b/, 'catuai'],
  [/\bpacamara\b/, 'pacamara'],
  [/\bpacas\b/, 'pacas'],
  [/\bsl ?28\b/, 'sl28'],
  [/\bsl ?34\b/, 'sl34'],
  [/\bruiru ?11\b/, 'ruiru11'],
  [/\bbatian\b/, 'batian'],
  [/\b(heirloom|landrace|ethiopian heirloom|jarc|74110|74112|74158)\b/, 'ethiopian landrace'],
  [/\bcastillo\b/, 'castillo'],
  [/\bmaragogype\b/, 'maragogype'],
  [/\bmundo novo\b/, 'mundo novo'],
  [/\bcatimor\b/, 'catimor'],
  [/\bsarchimor\b/, 'sarchimor'],
  [/\bparainema\b/, 'parainema'],
  [/\blaurina\b/, 'laurina'],
  [/\bwush wush\b/, 'wush wush'],
  [/\bsidra\b/, 'sidra'],
  [/\bvilla sarchi\b/, 'villa sarchi'],
  [/\btabi\b/, 'tabi'],
  [/\bmokka\b/, 'mokka'],
  [/\bmarsellesa\b/, 'marsellesa'],
  [/\bobata\b/, 'obata'],
  [/\bicatu\b/, 'icatu'],
  [/\bchiroso\b/, 'chiroso'],
  [/\bjava variety\b/, 'java'],
];

export function findVarieties(text: string): string[] {
  const t = normalizeText(text);
  const out: string[] = [];
  for (const [re, v] of VARIETIES) if (re.test(t) && !out.includes(v)) out.push(v);
  // "pink bourbon" etc. shouldn't also count as plain bourbon
  if (out.some((v) => v.endsWith(' bourbon'))) return out.filter((v) => v !== 'bourbon');
  return out;
}

const NOTE_LABEL =
  /(?:tasting notes?|flavou?r notes?|cup(?:ping)? notes?|notes? of|we taste|tastes? like|in the cup|flavou?rs?|notes?)\s*[:\-–—]\s*([^\n]+)/i;

/** Splits "Blueberry, milk chocolate & jasmine" into notes. */
export function splitNotes(s: string): string[] {
  return s
    .replace(/\.$/, '')
    .split(/\s*(?:,|\/|\||•|;|&|\+|\band\b)\s*/i)
    .map((x) => x.replace(/^[\s"'“”]+|[\s"'“”.]+$/g, '').trim())
    .filter((x) => x.length >= 3 && x.length <= 40 && !/^(with|hints?|notes?)$/i.test(x));
}

export function findNotes(text: string): string[] {
  const m = text.match(NOTE_LABEL);
  return m ? splitNotes(m[1]!).slice(0, 8) : [];
}

export function isDecafText(text: string): boolean {
  return /\b(decaf|decaffeinated|swiss water|sugar ?cane (process|decaf)|ea process|mountain water|co2 decaf)\b/i.test(
    text,
  );
}

const UNIT_GRAMS: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  gr: 1,
  kg: 1000,
  kilo: 1000,
  oz: 28.3495,
  ounce: 28.3495,
  ounces: 28.3495,
  lb: 453.592,
  lbs: 453.592,
  pound: 453.592,
  pounds: 453.592,
};

/** "12 oz", "340g", "2 lb", "1kg" → grams (rounded). */
export function parseSizeGrams(text: string | undefined | null): number | undefined {
  if (!text) return undefined;
  const m = text
    .toLowerCase()
    .match(/(\d+(?:\.\d+)?)\s*(kg|kilo|grams?|gr|g|ounces?|oz|lbs?|pounds?)\b/);
  if (!m) return undefined;
  const g = Number(m[1]) * (UNIT_GRAMS[m[2]!] ?? 0);
  return g > 0 ? Math.round(g) : undefined;
}

/** Fills empty fields of a raw bean from its title/description/tags text. Never overwrites set fields. */
export function enrichFromText(bean: RawBean, extraText = ''): RawBean {
  const text = [bean.name, bean.originText ?? '', bean.description ?? '', extraText].join('\n');
  const out: RawBean = { ...bean };
  if (!out.roast) out.roast = findRoastInText(text) ?? undefined;
  if (!out.process) out.process = findProcessInText(text) ?? parseProcess(bean.name) ?? undefined;
  if (!out.countries || out.countries.length === 0) {
    const fromOrigin = out.originText ? countriesInText(out.originText) : [];
    out.countries =
      fromOrigin.length > 0
        ? fromOrigin
        : countriesInText(`${bean.name}\n${extraText}\n${bean.description ?? ''}`);
  }
  if (!out.varieties || out.varieties.length === 0) out.varieties = findVarieties(text);
  if (!out.notes || out.notes.length === 0) out.notes = findNotes(text);
  if (out.isDecaf === undefined)
    out.isDecaf = isDecafText(`${bean.name}\n${extraText}`) || isDecafText(bean.description ?? '');
  if (out.isBlend === undefined)
    out.isBlend = /\bblend\b/i.test(bean.name) || (out.countries?.length ?? 0) > 1;
  return out;
}
