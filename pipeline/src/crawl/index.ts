import type { PipelineConfig } from '../config.js';
import { createHttpClient, realSleep, type Sleep, type Transport } from './http.js';
import { HostQueue, mapPool } from './hostQueue.js';
import { crawlSite, type CrawlResult, type SiteInput } from './site.js';

export * from './http.js';
export * from './hostQueue.js';
export * from './html.js';
export * from './robots.js';
export * from './site.js';

export interface CrawlCityOptions {
  crawler: PipelineConfig['crawler'];
  contactUrl: string;
  transport?: Transport;
  sleep?: Sleep;
  now?: () => number;
  onResult?: (r: CrawlResult) => void;
  pdfToText?: (bytes: Uint8Array) => Promise<string>;
}

export function userAgent(template: string, contactUrl: string): string {
  return template.replace('${CRAWLER_CONTACT_URL}', contactUrl);
}

/** Crawls all sites of a city: hostConcurrency hosts in parallel, per-host interval enforced. */
export async function crawlCity(
  sites: readonly SiteInput[],
  opts: CrawlCityOptions,
): Promise<CrawlResult[]> {
  const sleep = opts.sleep ?? realSleep;
  const get = createHttpClient({
    userAgent: userAgent(opts.crawler.userAgent, opts.contactUrl),
    timeoutMs: opts.crawler.timeoutMs,
    retries: opts.crawler.retries,
    minRetryDelayMs: opts.crawler.minIntervalMsPerHost,
    transport: opts.transport,
    sleep,
  });
  const queue = new HostQueue(opts.crawler.minIntervalMsPerHost, sleep, opts.now);
  return mapPool(sites, opts.crawler.hostConcurrency, async (site) => {
    const r = await crawlSite(site, {
      get,
      queue,
      maxPages: opts.crawler.maxPagesPerSite,
      pdfToText: opts.pdfToText,
    });
    opts.onResult?.(r);
    return r;
  });
}
