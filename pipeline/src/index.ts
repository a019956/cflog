// CoffeeLog weekly pipeline (02 Architecture): discover → crawl → extract → normalise → publish → report.
// Implemented so far: discover (WP-02). Later stages are added by WP-03..WP-06.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cityById } from '@cflog/shared';
import { parsePipelineArgs, type PipelineArgs } from './args.js';
import { ConfigError, loadConfig } from './config.js';
import {
  buildCategoryInspectionQuery,
  discoverCity,
  findMultiLocation,
  queryOverturePlaces,
  resolveSource,
  runDuckDb,
  type Candidate,
} from './discover/index.js';

export const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../out');

const PENDING_STAGES = ['crawl', 'extract', 'normalise', 'publish'] as const;

async function inspectCategories(args: PipelineArgs): Promise<void> {
  const config = await loadConfig();
  const source = resolveSource(config.pipeline.overture, args.overtureSource ?? undefined);
  for (const cityId of args.cities) {
    const city = cityById(cityId)!;
    const rows = await runDuckDb(buildCategoryInspectionQuery(source, city.bbox), source);
    console.log(
      `\n[inspect] ${city.name} — primary categories of coffee-sounding places (${source})`,
    );
    for (const r of rows)
      console.log(
        `  ${String(r.category).padEnd(32)} ${String(r.n).padStart(5)}  e.g. ${r.example}`,
      );
  }
}

async function run(args: PipelineArgs): Promise<number> {
  const config = await loadConfig();
  console.log(
    `[pipeline] cities=${args.cities.join(',')} dryRun=${args.dryRun} maxCafes=${args.maxCafes ?? 'all'} skipLlm=${args.skipLlm} overture=${config.pipeline.overture.release}`,
  );
  await mkdir(OUT_DIR, { recursive: true });
  const all: Candidate[] = [];
  for (const cityId of args.cities) {
    const result = await discoverCity(cityId, config, (bbox) =>
      queryOverturePlaces(config.pipeline.overture, bbox, args.overtureSource ?? undefined),
    );
    const candidates = args.maxCafes
      ? result.candidates.slice(0, args.maxCafes)
      : result.candidates;
    all.push(...result.candidates);
    const byReason = result.dropped.reduce<Record<string, number>>(
      (acc, d) => ({ ...acc, [d.reason]: (acc[d.reason] ?? 0) + 1 }),
      {},
    );
    console.log(
      `[discover] ${cityId}: ${result.candidates.length} candidates (${candidates.filter((c) => c.website).length} with website shown of ${candidates.length}); dropped ${JSON.stringify(byReason)}`,
    );
    const file = path.join(OUT_DIR, `candidates-${cityId}.json`);
    await writeFile(file, JSON.stringify({ ...result, candidates }, null, 2));
    console.log(`[discover] wrote ${path.relative(process.cwd(), file)}`);
  }
  const multi = findMultiLocation(all, config.pipeline.discover.multiLocationThreshold);
  if (multi.length > 0) {
    console.log(
      `[discover] multi-location names (≥${config.pipeline.discover.multiLocationThreshold}) — review for chains.yaml:`,
    );
    for (const m of multi) console.log(`  ${m.count}× ${m.name}`);
  }
  for (const s of PENDING_STAGES)
    console.log(`[pipeline] stage ${s}: not implemented yet (see 06 Build Plan)`);
  if (!args.dryRun)
    console.log('[pipeline] publish is not implemented yet; nothing was written to Firestore.');
  return 0;
}

async function main(): Promise<number> {
  let args: PipelineArgs;
  try {
    args = parsePipelineArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`[pipeline] ${(err as Error).message}`);
    return 2;
  }
  try {
    if (args.inspectCategories) {
      await inspectCategories(args);
      return 0;
    }
    return await run(args);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`[pipeline] config error — ${err.message}`);
      return 2;
    }
    console.error(`[pipeline] failed — ${(err as Error).message}`);
    return 1;
  }
}

process.exitCode = await main();
