// Filter dimensions shown as chips (ADR-009) and pure helpers to read/update `Filters`.
import {
  countryName,
  facetOptions,
  FLAVOR_LABELS,
  groupByContinent,
  PROCESS_LABELS,
  PROCESSES,
  ROAST_LABELS,
  ROAST_LEVELS,
  subFamilies,
  TOP_FAMILIES,
  type CafeSummary,
  type Filters,
  type FlavorFamilyId,
} from '@cflog/shared';

export type FilterDim = 'roast' | 'origin' | 'process' | 'notes' | 'type' | 'more';

export const DIMS: { key: FilterDim; label: string }[] = [
  { key: 'roast', label: 'Roast' },
  { key: 'origin', label: 'Origin' },
  { key: 'process', label: 'Process' },
  { key: 'notes', label: 'Notes' },
  { key: 'type', label: 'Type' },
  { key: 'more', label: 'More' },
];

export interface Option {
  value: string;
  label: string;
  /** indented under its parent (flavor sub-families) */
  child?: boolean;
}
export interface OptionGroup {
  title?: string;
  options: Option[];
}

/** Special values used by the Type / More dimensions. */
export const SELLS_ONLINE = 'sells-online';
export const DECAF = 'decaf';

type ArrayKey =
  'roastLevels' | 'originCountries' | 'processes' | 'flavorFamilies' | 'kinds' | 'varieties';

function arr(f: Filters, key: ArrayKey): string[] {
  return (f[key] as string[] | undefined) ?? [];
}

function toggleIn(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function withArray(f: Filters, key: ArrayKey, list: string[]): Filters {
  const next = { ...f } as Record<string, unknown>;
  if (list.length) next[key] = list;
  else delete next[key];
  return next as Filters;
}

/** Returns new Filters with `value` toggled in the dimension. */
export function toggleValue(f: Filters, dim: FilterDim, value: string): Filters {
  switch (dim) {
    case 'roast':
      return withArray(f, 'roastLevels', toggleIn(arr(f, 'roastLevels'), value));
    case 'origin':
      return withArray(f, 'originCountries', toggleIn(arr(f, 'originCountries'), value));
    case 'process':
      return withArray(f, 'processes', toggleIn(arr(f, 'processes'), value));
    case 'notes':
      return withArray(f, 'flavorFamilies', toggleIn(arr(f, 'flavorFamilies'), value));
    case 'type': {
      if (value === SELLS_ONLINE) {
        const { sellsOnline, ...rest } = f;
        return sellsOnline ? rest : { ...rest, sellsOnline: true };
      }
      return withArray(f, 'kinds', toggleIn(arr(f, 'kinds'), value));
    }
    case 'more': {
      if (value === DECAF) {
        const { decafOnly, ...rest } = f;
        return decafOnly ? rest : { ...rest, decafOnly: true };
      }
      return withArray(f, 'varieties', toggleIn(arr(f, 'varieties'), value));
    }
  }
}

export function clearDim(f: Filters, dim: FilterDim): Filters {
  const next = { ...f };
  if (dim === 'roast') delete next.roastLevels;
  if (dim === 'origin') delete next.originCountries;
  if (dim === 'process') delete next.processes;
  if (dim === 'notes') delete next.flavorFamilies;
  if (dim === 'type') {
    delete next.kinds;
    delete next.sellsOnline;
  }
  if (dim === 'more') {
    delete next.varieties;
    delete next.decafOnly;
  }
  return next;
}

export function selectedIn(f: Filters, dim: FilterDim): string[] {
  switch (dim) {
    case 'roast':
      return arr(f, 'roastLevels');
    case 'origin':
      return arr(f, 'originCountries');
    case 'process':
      return arr(f, 'processes');
    case 'notes':
      return arr(f, 'flavorFamilies');
    case 'type':
      return [...arr(f, 'kinds'), ...(f.sellsOnline ? [SELLS_ONLINE] : [])];
    case 'more':
      return [...arr(f, 'varieties'), ...(f.decafOnly ? [DECAF] : [])];
  }
}

export const dimCount = (f: Filters, dim: FilterDim) => selectedIn(f, dim).length;

const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/** Options for a dimension, built from what the city's cafés actually offer (plus fixed vocabularies). */
export function optionsFor(
  dim: FilterDim,
  cafes: readonly CafeSummary[],
  f: Filters = {},
): OptionGroup[] {
  const present = facetOptions(cafes);
  const keepSelected = (values: string[], selected: string[]) => [
    ...new Set([...values, ...selected]),
  ];
  switch (dim) {
    case 'roast':
      return [{ options: ROAST_LEVELS.map((r) => ({ value: r, label: ROAST_LABELS[r] })) }];
    case 'process':
      return [{ options: PROCESSES.map((p) => ({ value: p, label: PROCESS_LABELS[p] })) }];
    case 'origin':
      return groupByContinent(keepSelected(present.originCountries, arr(f, 'originCountries'))).map(
        (g) => ({
          title: g.continent,
          options: g.codes.map((c) => ({ value: c, label: countryName(c) })),
        }),
      );
    case 'notes':
      return TOP_FAMILIES.map((fam) => ({
        options: [
          { value: fam, label: FLAVOR_LABELS[fam] },
          ...subFamilies(fam).map((s: FlavorFamilyId) => ({
            value: s,
            label: FLAVOR_LABELS[s],
            child: true,
          })),
        ],
      }));
    case 'type':
      return [
        {
          options: [
            { value: 'roaster', label: 'Roaster' },
            { value: 'cafe', label: 'Café' },
            { value: 'both', label: 'Roaster + café' },
            { value: SELLS_ONLINE, label: 'Sells beans online' },
          ],
        },
      ];
    case 'more':
      return [
        { title: 'Decaf', options: [{ value: DECAF, label: 'Has decaf' }] },
        {
          title: 'Variety',
          options: keepSelected(present.varieties, arr(f, 'varieties')).map((v) => ({
            value: v,
            label: title(v),
          })),
        },
      ];
  }
}
