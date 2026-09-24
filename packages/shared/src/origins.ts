// Coffee origin countries (ISO-3166 alpha-2), display names, continents and name/region aliases.
import { normalizeText } from './vocab';

export const CONTINENTS = [
  'Africa',
  'Asia',
  'Oceania',
  'South America',
  'Central America & Caribbean',
  'North America',
] as const;
export type Continent = (typeof CONTINENTS)[number];

interface CountryInfo {
  name: string;
  continent: Continent;
  aliases?: string[];
}

export const COUNTRIES: Readonly<Record<string, CountryInfo>> = {
  // Africa
  ET: {
    name: 'Ethiopia',
    continent: 'Africa',
    aliases: [
      'yirgacheffe',
      'yirgachefe',
      'sidamo',
      'sidama',
      'guji',
      'harrar',
      'harar',
      'limu',
      'jimma',
      'gedeo',
      'kaffa',
      'bench maji',
    ],
  },
  KE: {
    name: 'Kenya',
    continent: 'Africa',
    aliases: ['nyeri', 'kirinyaga', 'muranga', 'embu', 'kiambu'],
  },
  RW: { name: 'Rwanda', continent: 'Africa' },
  BI: { name: 'Burundi', continent: 'Africa', aliases: ['kayanza', 'ngozi'] },
  TZ: { name: 'Tanzania', continent: 'Africa', aliases: ['kilimanjaro', 'mbeya'] },
  UG: { name: 'Uganda', continent: 'Africa', aliases: ['mount elgon', 'bugisu', 'rwenzori'] },
  CD: {
    name: 'DR Congo',
    continent: 'Africa',
    aliases: [
      'congo',
      'drc',
      'democratic republic of the congo',
      'kivu',
      'south kivu',
      'north kivu',
    ],
  },
  CM: { name: 'Cameroon', continent: 'Africa' },
  MW: { name: 'Malawi', continent: 'Africa' },
  ZM: { name: 'Zambia', continent: 'Africa' },
  ZW: { name: 'Zimbabwe', continent: 'Africa' },
  MG: { name: 'Madagascar', continent: 'Africa' },
  MZ: { name: 'Mozambique', continent: 'Africa' },
  CI: { name: "Côte d'Ivoire", continent: 'Africa', aliases: ['ivory coast', 'cote divoire'] },
  SL: { name: 'Sierra Leone', continent: 'Africa' },
  GN: { name: 'Guinea', continent: 'Africa' },
  TG: { name: 'Togo', continent: 'Africa' },
  AO: { name: 'Angola', continent: 'Africa' },
  // Asia (incl. Middle East)
  YE: { name: 'Yemen', continent: 'Asia', aliases: ['mocha yemen', 'haraz'] },
  ID: {
    name: 'Indonesia',
    continent: 'Asia',
    aliases: [
      'sumatra',
      'java',
      'sulawesi',
      'toraja',
      'bali',
      'flores',
      'aceh',
      'gayo',
      'mandheling',
      'lintong',
    ],
  },
  IN: {
    name: 'India',
    continent: 'Asia',
    aliases: ['karnataka', 'chikmagalur', 'monsooned malabar', 'malabar'],
  },
  VN: { name: 'Vietnam', continent: 'Asia', aliases: ['viet nam', 'da lat', 'dalat'] },
  TH: { name: 'Thailand', continent: 'Asia', aliases: ['chiang rai', 'chiang mai'] },
  LA: { name: 'Laos', continent: 'Asia' },
  MM: { name: 'Myanmar', continent: 'Asia', aliases: ['burma'] },
  CN: { name: 'China', continent: 'Asia', aliases: ['yunnan', 'pu er', 'puer'] },
  PH: { name: 'Philippines', continent: 'Asia' },
  TL: { name: 'Timor-Leste', continent: 'Asia', aliases: ['east timor', 'timor'] },
  NP: { name: 'Nepal', continent: 'Asia' },
  LK: { name: 'Sri Lanka', continent: 'Asia' },
  TW: { name: 'Taiwan', continent: 'Asia', aliases: ['alishan'] },
  // Oceania
  PG: { name: 'Papua New Guinea', continent: 'Oceania', aliases: ['png', 'papua'] },
  AU: { name: 'Australia', continent: 'Oceania' },
  // South America
  BR: {
    name: 'Brazil',
    continent: 'South America',
    aliases: [
      'brasil',
      'minas gerais',
      'cerrado',
      'mogiana',
      'sul de minas',
      'bahia',
      'chapada diamantina',
    ],
  },
  CO: {
    name: 'Colombia',
    continent: 'South America',
    aliases: [
      'huila',
      'narino',
      'cauca',
      'tolima',
      'antioquia',
      'quindio',
      'santander',
      'risaralda',
    ],
  },
  PE: {
    name: 'Peru',
    continent: 'South America',
    aliases: ['cajamarca', 'cusco', 'junin', 'amazonas'],
  },
  EC: { name: 'Ecuador', continent: 'South America', aliases: ['loja', 'pichincha'] },
  BO: { name: 'Bolivia', continent: 'South America', aliases: ['caranavi', 'yungas'] },
  VE: { name: 'Venezuela', continent: 'South America' },
  // Central America & Caribbean
  GT: {
    name: 'Guatemala',
    continent: 'Central America & Caribbean',
    aliases: ['huehuetenango', 'antigua', 'atitlan', 'acatenango'],
  },
  HN: {
    name: 'Honduras',
    continent: 'Central America & Caribbean',
    aliases: ['marcala', 'copan', 'santa barbara', 'ocotepeque'],
  },
  SV: {
    name: 'El Salvador',
    continent: 'Central America & Caribbean',
    aliases: ['santa ana', 'apaneca'],
  },
  NI: {
    name: 'Nicaragua',
    continent: 'Central America & Caribbean',
    aliases: ['jinotega', 'nueva segovia', 'matagalpa'],
  },
  CR: {
    name: 'Costa Rica',
    continent: 'Central America & Caribbean',
    aliases: ['tarrazu', 'west valley', 'central valley', 'naranjo'],
  },
  PA: {
    name: 'Panama',
    continent: 'Central America & Caribbean',
    aliases: ['boquete', 'volcan', 'chiriqui'],
  },
  JM: { name: 'Jamaica', continent: 'Central America & Caribbean', aliases: ['blue mountain'] },
  DO: { name: 'Dominican Republic', continent: 'Central America & Caribbean' },
  HT: { name: 'Haiti', continent: 'Central America & Caribbean' },
  CU: { name: 'Cuba', continent: 'Central America & Caribbean' },
  PR: { name: 'Puerto Rico', continent: 'Central America & Caribbean' },
  // North America
  MX: {
    name: 'Mexico',
    continent: 'North America',
    aliases: ['chiapas', 'oaxaca', 'veracruz', 'puebla'],
  },
  US: {
    name: 'United States',
    continent: 'North America',
    aliases: ['hawaii', 'kona', 'kau', 'maui', 'california'],
  },
};

const NAME_INDEX: Readonly<Record<string, string>> = (() => {
  const idx: Record<string, string> = {};
  for (const [code, info] of Object.entries(COUNTRIES)) {
    idx[normalizeText(info.name)] = code;
    idx[code.toLowerCase()] = code;
    for (const a of info.aliases ?? []) idx[normalizeText(a)] = code;
  }
  return idx;
})();

/** ISO code for a country or well-known growing region name ("Sumatra" → "ID"), or undefined. */
export function countryFromName(name: string): string | undefined {
  return NAME_INDEX[normalizeText(name)];
}

/** Finds every origin country mentioned in free text (e.g. a blend description). */
export function countriesInText(text: string): string[] {
  const words = normalizeText(text).split(' ');
  const found: string[] = [];
  for (let n = 4; n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      const phrase = words.slice(i, i + n).join(' ');
      if (n === 1 && phrase.length <= 2) continue; // skip ISO-like 2-letter words ("in", "co")
      const code = NAME_INDEX[phrase];
      if (code && !found.includes(code)) found.push(code);
    }
  }
  return found;
}

export function continentOf(code: string): Continent | undefined {
  return COUNTRIES[code]?.continent;
}

export function countryName(code: string): string {
  return COUNTRIES[code]?.name ?? code;
}

/** Groups ISO codes by continent in CONTINENTS order; unknown codes go last under their own key. */
export function groupByContinent(
  codes: readonly string[],
): { continent: Continent | 'Other'; codes: string[] }[] {
  const groups = new Map<Continent | 'Other', string[]>();
  for (const code of codes) {
    const c = continentOf(code) ?? 'Other';
    groups.set(c, [...(groups.get(c) ?? []), code]);
  }
  const order: (Continent | 'Other')[] = [...CONTINENTS, 'Other'];
  return order
    .filter((c) => groups.has(c))
    .map((c) => ({
      continent: c,
      codes: [...(groups.get(c) ?? [])].sort((a, b) =>
        countryName(a).localeCompare(countryName(b)),
      ),
    }));
}
