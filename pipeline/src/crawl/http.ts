// Minimal HTTP layer for the crawler. The `Transport` is injectable so tests never touch the network.

export interface HttpResponse {
  /** final URL after redirects */
  url: string;
  status: number;
  contentType: string;
  /** decoded text for text/JSON responses; '' for binary */
  text: string;
  /** raw bytes for binary responses (PDF) */
  bytes?: Uint8Array;
  /** response header lookup (lower-case names) */
  headers: Record<string, string>;
}

export type Transport = (
  url: string,
  init: { headers: Record<string, string>; timeoutMs: number; maxBytes: number },
) => Promise<HttpResponse>;

/** Body caps: HTML/PDF 3 MB, store JSON 10 MB (Shopify pages with body_html are large). */
export const MAX_BODY_BYTES = 3 * 1024 * 1024;
export const MAX_JSON_BYTES = 10 * 1024 * 1024;

/** Reads at most `max` bytes from a response stream, then cancels it. */
async function readCapped(res: Response, max: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array(await res.arrayBuffer()).slice(0, max);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < max) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  if (total >= max) await reader.cancel().catch(() => undefined);
  const out = new Uint8Array(Math.min(total, max));
  let off = 0;
  for (const c of chunks) {
    const n = Math.min(c.byteLength, out.byteLength - off);
    out.set(c.subarray(0, n), off);
    off += n;
    if (off >= out.byteLength) break;
  }
  return out;
}

/** Default transport: global fetch with redirect following, a timeout and a streamed body cap. */
export const fetchTransport: Transport = async (url, init) => {
  const res = await fetch(url, {
    headers: init.headers,
    redirect: 'follow',
    signal: AbortSignal.timeout(init.timeoutMs),
  });
  const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
  const body = await readCapped(res, init.maxBytes);
  const binary = contentType.includes('application/pdf') || /\.pdf($|\?)/i.test(res.url);
  return {
    url: res.url || url,
    status: res.status,
    contentType,
    text: binary ? '' : new TextDecoder('utf-8', { fatal: false }).decode(body),
    bytes: binary ? body : undefined,
    headers,
  };
};

export type Sleep = (ms: number) => Promise<void>;
export const realSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export interface ClientOptions {
  userAgent: string;
  timeoutMs: number;
  retries: number;
  /** retries never come sooner than this (per-host politeness interval) */
  minRetryDelayMs?: number;
  transport?: Transport;
  sleep?: Sleep;
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** Retry-After in ms (seconds or HTTP date), capped at 30 s. */
export function retryAfterMs(
  headers: Record<string, string>,
  now = Date.now(),
): number | undefined {
  const v = headers['retry-after'];
  if (!v) return undefined;
  const secs = Number(v);
  const ms = Number.isFinite(secs) ? secs * 1000 : Date.parse(v) - now;
  return Number.isFinite(ms) && ms > 0 ? Math.min(ms, 30_000) : undefined;
}

/**
 * GET with retries on network errors, 429 and 5xx. Backoff is 1 s, 2 s, … but never shorter than
 * the per-host interval, and honours Retry-After (≤ 30 s).
 */
export function createHttpClient(opts: ClientOptions) {
  const transport = opts.transport ?? fetchTransport;
  const sleep = opts.sleep ?? realSleep;
  const minDelay = opts.minRetryDelayMs ?? 0;
  return async function get(
    url: string,
    accept = 'text/html,application/json;q=0.9,*/*;q=0.5',
  ): Promise<HttpResponse> {
    const maxBytes = accept.startsWith('application/json') ? MAX_JSON_BYTES : MAX_BODY_BYTES;
    let lastErr: unknown;
    let wait = 0;
    for (let attempt = 0; attempt <= opts.retries; attempt++) {
      if (attempt > 0) await sleep(Math.max(wait, 1000 * 2 ** (attempt - 1), minDelay));
      wait = 0;
      try {
        const res = await transport(url, {
          headers: { 'user-agent': opts.userAgent, accept },
          timeoutMs: opts.timeoutMs,
          maxBytes,
        });
        if (res.status === 429 || res.status >= 500) {
          lastErr = new HttpError(`HTTP ${res.status} for ${url}`, res.status);
          wait = retryAfterMs(res.headers) ?? 0;
          continue;
        }
        return res;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr instanceof Error ? lastErr : new HttpError(String(lastErr));
  };
}

export type HttpGet = ReturnType<typeof createHttpClient>;
