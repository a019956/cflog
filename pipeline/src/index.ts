// CoffeeLog weekly pipeline (02 Architecture): discover → crawl → extract → normalise → publish → report.
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cityById } from '@cflog/shared';
import { parsePipelineArgs, type PipelineArgs } from './args.js';
import { ConfigError, loadConfig } from './config.js';
import {
  buildCategoryInspectionQuery,
  findMultiLocation,
  queryOverturePlaces,
  resolveSource,
  runDuckDb,
  type Candidate,
} from './discover/index.js';
import { GeminiExtractor } from './extract/index.js';
import { MemoryStore, withWriteBudget, type DataStore } from './publish/index.js';
import { reportMarkdown, runCity, type CityRunReport } from './run.js';

export const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../out');

// firebase-admin 14 and @google-cloud/firestore 9 need Node 22+; npm silently skips Firestore on older Node.
const NODE_MAJOR = Number(process.versions.node.split('.')[0]);
if (NODE_MAJOR < 22) {
  console.error(
    `[pipeline] Node ${process.versions.node} is too old: CoffeeLog needs Node 22 or newer (install Node 22 LTS, then delete node_modules and run npm install).`,
  );
  process.exit(2);
}

// Local runs: load the repo-root .env (git-ignored). CI passes secrets as real env vars instead.
const ROOT_ENV = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env');
if (existsSync(ROOT_ENV)) {
  try {
    process.loadEnvFile(ROOT_ENV);
  } catch (err) {
    console.warn(`[pipeline] could not read .env: ${(err as Error).message}`);
  }
}

const envNum = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

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
  if (args.overtureSource) config.pipeline.overture.source = args.overtureSource;
  const now = new Date().toISOString();
  const contactUrl = process.env.CRAWLER_CONTACT_URL || 'https://github.com/a019956/cflog#bot';
  const maxWrites = envNum('PIPELINE_MAX_WRITES', 18000);

  let inner: DataStore;
  if (args.dryRun) inner = new MemoryStore();
  else {
    // Loaded only for live runs, so dry runs work even without firebase-admin's Firestore client.
    const { FirestoreStore, firestoreFromEnv } = await import('./publish/firestore.js');
    inner = new FirestoreStore(firestoreFromEnv());
  }
  const store = withWriteBudget(inner, maxWrites);

  let gemini: GeminiExtractor | null = null;
  if (!args.skipLlm) {
    if (process.env.GEMINI_API_KEY) {
      gemini = new GeminiExtractor({
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || undefined,
        rpm: envNum('GEMINI_RPM', 10),
        maxCalls: envNum('GEMINI_MAX_CALLS', 400),
      });
    } else {
      console.warn(
        '[pipeline] GEMINI_API_KEY not set — Gemini extraction skipped (store JSON only).',
      );
    }
  }

  console.log(
    `[pipeline] cities=${args.cities.join(',')} dryRun=${args.dryRun} maxCafes=${args.maxCafes ?? 'all'} gemini=${gemini ? gemini.model : 'off'} overture=${config.pipeline.overture.release} maxWrites=${maxWrites}`,
  );
  await mkdir(OUT_DIR, { recursive: true });

  const reports: CityRunReport[] = [];
  const allCandidates: Candidate[] = [];
  let failed = false;
  for (const cityId of args.cities) {
    const report = await runCity({
      cityId,
      config,
      store,
      gemini,
      contactUrl,
      maxCafes: args.maxCafes,
      now,
      query: (bbox) => queryOverturePlaces(config.pipeline.overture, bbox),
      log: (m) => console.log(m),
      onDiscover: (c) => allCandidates.push(...c),
    });
    reports.push(report);
    if (report.failedCrawlRatio > 0.5) failed = true;
    if (args.dryRun && inner instanceof MemoryStore) {
      const cafes = [...inner.cafes.values()].filter((c) => c.cityId === cityId);
      await writeFile(path.join(OUT_DIR, `cafes-${cityId}.json`), JSON.stringify(cafes, null, 2));
    }
  }
  // Multi-location names across the cities in this run (ADR-014)
  const multi = findMultiLocation(allCandidates, config.pipeline.discover.multiLocationThreshold);
  if (reports[0]) reports[0].multiLocation = multi;

  const stamp = now.slice(0, 10);
  const suffix = args.cities.length === 1 ? `-${args.cities[0]}` : '';
  const md = [
    `# CoffeeLog pipeline report ${stamp}${args.dryRun ? ' (dry run)' : ''}`,
    '',
    ...reports.map(reportMarkdown),
  ].join('\n\n');
  await writeFile(path.join(OUT_DIR, `report-${stamp}${suffix}.md`), md);
  await writeFile(
    path.join(OUT_DIR, `report-${stamp}${suffix}.json`),
    JSON.stringify(reports, null, 2),
  );
  console.log(`\n${md}\n\n[pipeline] report written to pipeline/out/report-${stamp}${suffix}.md`);
  if (failed) {
    console.error('[pipeline] more than 50% of crawls failed in at least one city');
    return 1;
  }
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
