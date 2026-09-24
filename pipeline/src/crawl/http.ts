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
  init: { headers: Record<string, string>; timeoutMs: number },
) => Promise<HttpResponse>;

export const MAX_BODY_BYTES = 3 * 1024 * 1024;

/** Default transport: global fetch with redirect following, a timeout and a body size cap. */
export const fetchTransport: Transport = async (url, init) => {
  const res = await fetch(url, {
    headers: init.headers,
    redirect: 'follow',
    signal: AbortSignal.timeout(init.timeoutMs),
  });
  const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
  const buf = new Uint8Array(await res.arrayBuffer());
  const body = buf.byteLength > MAX_BODY_BYTES ? buf.slice(0, MAX_BODY_BYTES) : buf;
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

/** GET with retries on network errors, 429 and 5xx (exponential backoff: 1 s, 2 s, …). */
export function createHttpClient(opts: ClientOptions) {
  const transport = opts.transport ?? fetchTransport;
  const sleep = opts.sleep ?? realSleep;
  return async function get(
    url: string,
    accept = 'text/html,application/json;q=0.9,*/*;q=0.5',
  ): Promise<HttpResponse> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= opts.retries; attempt++) {
      if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1));
      try {
        const res = await transport(url, {
          headers: { 'user-agent': opts.userAgent, accept },
          timeoutMs: opts.timeoutMs,
        });
        if (res.status === 429 || res.status >= 500) {
          lastErr = new HttpError(`HTTP ${res.status} for ${url}`, res.status);
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
