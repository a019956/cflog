import { parseArgs } from 'node:util';
import { CITIES } from '@cflog/shared';

export interface PipelineArgs {
  cities: string[];
  dryRun: boolean;
  maxCafes: number | null;
  skipLlm: boolean;
  /** debug: list Overture categories of coffee-sounding places, then exit */
  inspectCategories: boolean;
  /** read Overture from this Parquet path/glob instead of the configured source */
  overtureSource: string | null;
}

/** Parses `npm run pipeline -- [--city nyc] [--dry-run] [--max-cafes N] [--skip-llm] [--inspect-categories] [--overture-source PATH]`. */
export function parsePipelineArgs(argv: string[]): PipelineArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      city: { type: 'string', multiple: true },
      'dry-run': { type: 'boolean', default: false },
      'max-cafes': { type: 'string' },
      'skip-llm': { type: 'boolean', default: false },
      'inspect-categories': { type: 'boolean', default: false },
      'overture-source': { type: 'string' },
    },
    strict: true,
  });
  const known = CITIES.map((c) => c.id);
  const cities = values.city && values.city.length > 0 ? values.city : known;
  for (const c of cities) {
    if (!known.includes(c)) throw new Error(`Unknown city "${c}". Known: ${known.join(', ')}`);
  }
  let maxCafes: number | null = null;
  if (values['max-cafes'] !== undefined) {
    maxCafes = Number(values['max-cafes']);
    if (!Number.isInteger(maxCafes) || maxCafes <= 0)
      throw new Error('--max-cafes must be a positive integer');
  }
  return {
    cities,
    dryRun: values['dry-run'] ?? false,
    maxCafes,
    skipLlm: values['skip-llm'] ?? false,
    inspectCategories: values['inspect-categories'] ?? false,
    overtureSource: values['overture-source'] ?? null,
  };
}
