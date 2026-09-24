// Orchestrates one city: discover → crawl → extract → normalise → publish (02 Architecture).
import { cityById, type IsoDate, type PipelineStateDoc } from '@cflog/shared';
import type { AllConfig } from './config.js';
import { crawlCity, type CrawlResult, type Sleep, type Transport } from './crawl/index.js';
import {
  discoverCity,
  type Candidate,
  type DropRecord,
  type PlaceQuery,
} from './discover/index.js';
import {
  beansFromStorePages,
  GeminiExtractor,
  LlmBudgetExceeded,
  pdfText,
  planLlmJobs,
  type ExtractionResult,
  type LlmJob,
} from './extract/index.js';
import { shortHash } from './normalise/index.js';
import { publishCity, type CafeOutcome, type PublishStats } from './publish/index.js';
import type { DataStore } from './publish/store.js';

export interface CityRunOptions {
  cityId: string;
  config: AllConfig;
  store: DataStore;
  gemini: GeminiExtractor | null;
  contactUrl: string;
  maxCafes: number | null;
  now: IsoDate;
  query?: PlaceQuery;
  transport?: Transport;
  sleep?: Sleep;
  log?: (msg: string) => void;
  /** receives every discovered candidate (before --max-cafes) for the multi-location report */
  onDiscover?: (candidates: readonly Candidate[]) => void;
}

export interface CityRunReport {
  cityId: string;
  startedAt: IsoDate;
  candidates: number;
  dropped: Record<string, number>;
  multiLocation: { name: string; count: number }[];
  crawl: Record<string, number>;
  platforms: Record<string, number>;
  unchangedPages: number;
  storeJsonCafes: number;
  llm: {
    planned: number;
    done: number;
    skippedBudget: number;
    errors: number;
    calls: number;
    model: string | null;
  };
  publish: PublishStats;
  reads: number;
  writes: number;
  errors: { cafeId: string; name: string; error: string }[];
  llmSkipped: string[];
  failedCrawlRatio: number;
}

const count = <T extends string>(xs: readonly T[]) =>
  xs.reduce<Record<string, number>>((acc, x) => ({ ...acc, [x]: (acc[x] ?? 0) + 1 }), {});

export function pagesHashOf(crawl: CrawlResult): string {
  return shortHash(
    crawl.pages
      .map((p) => `${p.url}#${p.hash}`)
      .sort()
      .join('\n'),
  );
}

export async function runCity(o: CityRunOptions): Promise<CityRunReport> {
  const log = o.log ?? (() => {});
  const city = cityById(o.cityId);
  if (!city) throw new Error(`Unknown city ${o.cityId}`);

  const readsBefore = o.store.reads;
  const writesBefore = o.store.writes;

  // 1. Discover
  const discovery = await discoverCity(o.cityId, o.config, o.query);
  o.onDiscover?.(discovery.candidates);
  const candidates: Candidate[] = o.maxCafes
    ? discovery.candidates.slice(0, o.maxCafes)
    : discovery.candidates;
  log(
    `[${o.cityId}] discover: ${discovery.candidates.length} candidates${o.maxCafes ? ` (using ${candidates.length})` : ''}`,
  );

  // 2. Previous state
  const prevState: PipelineStateDoc | null = await o.store.getState(o.cityId);

  // 3. Crawl
  let done = 0;
  const crawls = await crawlCity(
    candidates.map((c) => ({ cafeId: c.id, website: c.website, platform: c.platform })),
    {
      crawler: o.config.pipeline.crawler,
      contactUrl: o.contactUrl,
      transport: o.transport,
      sleep: o.sleep,
      onResult: () => {
        done++;
        if (done % 25 === 0) log(`[${o.cityId}] crawl: ${done}/${candidates.length}`);
      },
    },
  );
  const byId = new Map(candidates.map((c) => [c.id, c]));

  // 4. PDF text + change detection
  for (const cr of crawls)
    for (const p of cr.pages) if (p.bytes && !p.text) p.text = await pdfText(p.bytes);
  const pagesHash = new Map(crawls.map((cr) => [cr.cafeId, pagesHashOf(cr)]));
  const changed = crawls.filter((cr) => {
    if (cr.status !== 'ok') return false;
    const prev = prevState?.cafes[cr.cafeId];
    return !(prev && prev.pagesHash && prev.pagesHash === pagesHash.get(cr.cafeId));
  });
  const changedIds = new Set(changed.map((c) => c.cafeId));

  // 5. Store JSON
  const storeBeans = new Map(changed.map((cr) => [cr.cafeId, beansFromStorePages(cr)]));

  // 6. Gemini jobs (priority order, within budget)
  const jobs: LlmJob[] = planLlmJobs(
    changed.map((cr) => ({
      cafeName: byId.get(cr.cafeId)!.name,
      crawl: cr,
      hasStoreBeans: (storeBeans.get(cr.cafeId)?.length ?? 0) > 0,
    })),
  );
  const llmResults = new Map<string, ExtractionResult>();
  const llmSkipped: string[] = [];
  const errors: CityRunReport['errors'] = [];
  let llmErrors = 0;
  for (const job of jobs) {
    if (!o.gemini) {
      llmSkipped.push(job.cafeId);
      continue;
    }
    try {
      llmResults.set(job.cafeId, await o.gemini.extract(job.cafeName, job.mode, job.pages));
    } catch (err) {
      if (err instanceof LlmBudgetExceeded) {
        llmSkipped.push(job.cafeId);
        continue;
      }
      llmErrors++;
      errors.push({
        cafeId: job.cafeId,
        name: job.cafeName,
        error: `gemini: ${(err as Error).message}`,
      });
    }
  }
  if (jobs.length)
    log(
      `[${o.cityId}] gemini: ${llmResults.size}/${jobs.length} jobs done, ${llmSkipped.length} skipped`,
    );
  const jobFor = new Map(jobs.map((j) => [j.cafeId, j]));

  // 7. Outcomes
  const outcomes: CafeOutcome[] = crawls.map((cr) => {
    const candidate = byId.get(cr.cafeId)!;
    const base = { candidate, crawl: cr, pagesHash: pagesHash.get(cr.cafeId)! };
    if (!changedIds.has(cr.cafeId)) return { ...base, extraction: null };
    const job = jobFor.get(cr.cafeId);
    const llm = llmResults.get(cr.cafeId);
    const store = storeBeans.get(cr.cafeId) ?? null;
    if (store && store.length > 0) {
      const menuFresh = !job || job.mode === 'beans' || !!llm;
      return { ...base, extraction: { beans: store, menu: llm?.menu ?? [], menuFresh } };
    }
    if (job && !llm) return { ...base, extraction: null }; // retry next run
    return {
      ...base,
      extraction: { beans: llm?.beans ?? [], menu: llm?.menu ?? [], menuFresh: true },
    };
  });
  for (const cr of crawls)
    if (cr.status === 'error')
      errors.push({
        cafeId: cr.cafeId,
        name: byId.get(cr.cafeId)!.name,
        error: cr.error ?? 'crawl error',
      });

  // 8. Publish
  const { stats } = await publishCity({
    cityId: o.cityId,
    outcomes,
    store: o.store,
    prevState,
    now: o.now,
    overtureRelease: o.config.pipeline.overture.release,
    complete: !o.maxCafes,
  });
  log(
    `[${o.cityId}] publish: ${stats.created} new, ${stats.updated} updated, ${stats.unchanged + stats.carried} unchanged, ${stats.hidden} hidden, ${stats.deleted} deleted`,
  );

  const withSite = crawls.filter((c) => c.status !== 'no-site');
  return {
    cityId: o.cityId,
    startedAt: o.now,
    candidates: candidates.length,
    dropped: count(discovery.dropped.map((d: DropRecord) => d.reason)),
    multiLocation: [],
    crawl: count(crawls.map((c) => c.status)),
    platforms: count(crawls.filter((c) => c.status === 'ok').map((c) => c.platform)),
    unchangedPages: crawls.filter((c) => c.status === 'ok' && !changedIds.has(c.cafeId)).length,
    storeJsonCafes: [...storeBeans.values()].filter((b) => b && b.length > 0).length,
    llm: {
      planned: jobs.length,
      done: llmResults.size,
      skippedBudget: llmSkipped.length,
      errors: llmErrors,
      calls: o.gemini?.calls ?? 0,
      model: o.gemini?.model ?? null,
    },
    publish: stats,
    reads: o.store.reads - readsBefore,
    writes: o.store.writes - writesBefore,
    errors,
    llmSkipped,
    failedCrawlRatio: withSite.length
      ? withSite.filter((c) => c.status === 'error').length / withSite.length
      : 0,
  };
}

export function reportMarkdown(r: CityRunReport): string {
  const kv = (o: Record<string, number>) =>
    Object.entries(o)
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ') || '—';
  const p = r.publish;
  const lines = [
    `## ${r.cityId} — ${r.startedAt}`,
    '',
    `- **Discover:** ${r.candidates} candidates · dropped: ${kv(r.dropped)}`,
    `- **Crawl:** ${kv(r.crawl)} · platforms: ${kv(r.platforms)} · pages unchanged: ${r.unchangedPages}`,
    `- **Extraction:** store JSON ${r.storeJsonCafes} · Gemini ${r.llm.done}/${r.llm.planned} jobs (${r.llm.calls} calls, model ${r.llm.model ?? 'off'}), skipped ${r.llm.skippedBudget}, errors ${r.llm.errors}`,
    `- **Publish:** ${p.created} new · ${p.updated} updated · ${p.unchanged + p.carried} unchanged · ${p.hidden} hidden · ${p.deleted} deleted · beans +${p.beansAdded}/−${p.beansRemoved} · index ${p.indexWritten ? `written (${p.indexShards} shard${p.indexShards > 1 ? 's' : ''})` : 'unchanged'} · ${r.writes} writes, ${r.reads} reads`,
  ];
  if (p.stoppedAtWriteBudget)
    lines.push('- ⚠️ **Stopped at the write budget** — the next run continues.');
  if (p.stateCompacted)
    lines.push('- ⚠️ pipelineState was compacted (first-seen dates dropped) to stay under 1 MB.');
  if (p.trimmed.length) lines.push(`- ⚠️ Trimmed to fit 900 KB: ${p.trimmed.join(', ')}`);
  if (r.multiLocation.length) {
    lines.push(
      '',
      '### Multi-location — review for chains.yaml',
      ...r.multiLocation.map((m) => `- ${m.count}× ${m.name}`),
    );
  }
  if (r.errors.length) {
    lines.push(
      '',
      `### Errors (${r.errors.length})`,
      ...r.errors.slice(0, 40).map((e) => `- ${e.name} (\`${e.cafeId}\`): ${e.error}`),
    );
  }
  if (r.llmSkipped.length)
    lines.push('', `### Gemini skipped (${r.llmSkipped.length}) — retried next run`);
  return lines.join('\n');
}
