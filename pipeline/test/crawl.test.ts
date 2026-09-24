import { describe, expect, it } from 'vitest';
import {
  cleanText,
  crawlCity,
  crawlSite,
  createHttpClient,
  detectPlatform,
  HostQueue,
  mapPool,
  pickLinks,
  userAgent,
  type HttpResponse,
  type Transport,
} from '../src/crawl/index.js';

type Route = Partial<HttpResponse> | ((attempt: number) => Partial<HttpResponse>);

function fakeWeb(routes: Record<string, Route>) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const attempts = new Map<string, number>();
  const transport: Transport = async (url, init) => {
    calls.push({ url, headers: init.headers });
    const n = (attempts.get(url) ?? 0) + 1;
    attempts.set(url, n);
    const r = routes[url];
    if (!r) return { url, status: 404, contentType: 'text/html', text: 'not found', headers: {} };
    const v = typeof r === 'function' ? r(n) : r;
    return { url, status: 200, contentType: 'text/html', text: '', headers: {}, ...v };
  };
  return { transport, calls };
}

function virtualClock() {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => void (t += ms) };
}

const CRAWLER = {
  userAgent: 'CoffeeLogBot/0.1 (+${CRAWLER_CONTACT_URL})',
  minIntervalMsPerHost: 2000,
  hostConcurrency: 8,
  maxPagesPerSite: 6,
  timeoutMs: 15000,
  retries: 2,
};

function deps(transport: Transport, clock = virtualClock()) {
  return {
    get: createHttpClient({
      userAgent: 'CoffeeLogBot/test',
      timeoutMs: 1000,
      retries: 2,
      transport,
      sleep: clock.sleep,
    }),
    queue: new HostQueue(2000, clock.sleep, clock.now),
    maxPages: 6,
  };
}

const SHOP_HOME = `<html><head><script src="https://cdn.shopify.com/x.js"></script></head><body>
  <nav><a href="/cart">Cart</a><a href="/account/login">Login</a><a href="https://instagram.com/x">IG</a></nav>
  <a href="/collections/coffee">Coffee</a><a href="/pages/menu">Our Menu</a><a href="/about">About</a>
  <a href="/files/menu.pdf">Cafe menu (PDF)</a><a href="/img/hero.jpg">hero</a>
  <script>var secret = 1;</script><p>Welcome to Sample Roasters</p></body></html>`;

describe('html helpers', () => {
  it('cleans text and drops scripts', () => {
    const t = cleanText(SHOP_HOME);
    expect(t).toContain('Welcome to Sample Roasters');
    expect(t).not.toContain('secret');
  });
  it('picks same-site coffee/menu/pdf links in rank order and skips junk', () => {
    const links = pickLinks(SHOP_HOME, 'https://sample.example/', 3);
    expect(links).toEqual([
      { url: 'https://sample.example/collections/coffee', kind: 'coffee' },
      { url: 'https://sample.example/pages/menu', kind: 'menu' },
      { url: 'https://sample.example/files/menu.pdf', kind: 'pdf' },
    ]);
    expect(pickLinks(SHOP_HOME, 'https://sample.example/', 1)).toHaveLength(1);
  });
  it('treats www and bare host as the same site', () => {
    expect(
      pickLinks('<a href="https://www.sample.example/shop">Shop</a>', 'https://sample.example/', 3),
    ).toEqual([{ url: 'https://www.sample.example/shop', kind: 'shop' }]);
  });
  it('detects platforms', () => {
    expect(detectPlatform(SHOP_HOME)).toBe('shopify');
    expect(detectPlatform('<body>', { 'x-shopid': '1' })).toBe('shopify');
    expect(detectPlatform('<link href="/wp-content/plugins/woocommerce/a.css">')).toBe(
      'woocommerce',
    );
    expect(detectPlatform('<img src="https://x.editmysite.com/a.png">')).toBe('square');
    expect(detectPlatform('<p>hello</p>')).toBe('other');
  });
});

describe('HostQueue and mapPool', () => {
  it('spaces requests to the same host and honours a raised interval', async () => {
    const clock = virtualClock();
    const q = new HostQueue(2000, clock.sleep, clock.now);
    const times: number[] = [];
    await Promise.all(
      [1, 2, 3].map(() => q.run('a.example', async () => void times.push(clock.now()))),
    );
    expect(times).toEqual([0, 2000, 4000]);
    q.setHostInterval('a.example', 5000);
    await q.run('a.example', async () => void times.push(clock.now()));
    expect(times[3]! - times[2]!).toBe(5000);
    q.setHostInterval('b.example', 999_999);
    expect(q.intervalFor('b.example')).toBe(30_000);
  });
  it('limits concurrency and keeps order', async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapPool([1, 2, 3, 4, 5], 2, async (x) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return x * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50]);
    expect(peak).toBe(2);
  });
});

describe('crawlSite', () => {
  it('returns no-site without a website', async () => {
    const { transport, calls } = fakeWeb({});
    expect((await crawlSite({ cafeId: 'c' }, deps(transport))).status).toBe('no-site');
    expect(calls).toHaveLength(0);
  });

  it('respects robots.txt disallow for CoffeeLogBot', async () => {
    const { transport, calls } = fakeWeb({
      'https://sample.example/robots.txt': {
        contentType: 'text/plain',
        text: 'User-agent: CoffeeLogBot\nDisallow: /\n',
      },
    });
    const r = await crawlSite({ cafeId: 'c', website: 'https://sample.example' }, deps(transport));
    expect(r.status).toBe('blocked-robots');
    expect(calls.map((c) => c.url)).toEqual(['https://sample.example/robots.txt']);
  });

  it('treats a robots.txt server error as disallow', async () => {
    const { transport } = fakeWeb({ 'https://sample.example/robots.txt': { status: 503 } });
    expect(
      (await crawlSite({ cafeId: 'c', website: 'https://sample.example' }, deps(transport))).status,
    ).toBe('blocked-robots');
  });

  it('crawls a Shopify site: products JSON, then coffee/menu/pdf links, within budget', async () => {
    const products = { products: [{ id: 1, title: 'Ethiopia Guji' }] };
    const { transport, calls } = fakeWeb({
      'https://sample.example/robots.txt': { status: 404 },
      'https://sample.example/': { text: SHOP_HOME },
      'https://sample.example/products.json?limit=100&page=1': {
        contentType: 'application/json',
        text: JSON.stringify(products),
      },
      'https://sample.example/collections/coffee': { text: '<body><h1>Coffee</h1></body>' },
      'https://sample.example/pages/menu': { text: '<body><p>Latte 5</p></body>' },
      'https://sample.example/files/menu.pdf': {
        contentType: 'application/pdf',
        bytes: new Uint8Array([37, 80, 68, 70]),
      },
    });
    const r = await crawlSite({ cafeId: 'c', website: 'https://sample.example/' }, deps(transport));
    expect(r.status).toBe('ok');
    expect(r.platform).toBe('shopify');
    expect(r.pages.map((p) => p.kind)).toEqual(['home', 'products-json', 'coffee', 'menu', 'pdf']);
    expect(r.pages[1]!.json).toEqual(products);
    expect(r.pages[3]!.text).toBe('Latte 5');
    expect(r.pages[4]!.bytes).toBeInstanceOf(Uint8Array);
    expect(new Set(r.pages.map((p) => p.hash)).size).toBe(5);
    expect(calls.filter((c) => !c.url.endsWith('robots.txt')).length).toBeLessThanOrEqual(6);
    expect(calls.some((c) => c.url.includes('/cart'))).toBe(false);
  });

  it('uses the WooCommerce Store API and honours a pinned platform', async () => {
    const { transport, calls } = fakeWeb({
      'https://woo.example/robots.txt': {
        contentType: 'text/plain',
        text: 'User-agent: *\nAllow: /\n',
      },
      'https://woo.example/': { text: '<body>plain</body>' },
      'https://woo.example/wp-json/wc/store/v1/products?per_page=100&page=1': {
        contentType: 'application/json',
        text: '[{"id":7,"name":"Kenya AA"}]',
      },
    });
    const r = await crawlSite(
      { cafeId: 'w', website: 'https://woo.example', platform: 'woocommerce' },
      deps(transport),
    );
    expect(r.platform).toBe('woocommerce');
    expect(r.pages.map((p) => p.kind)).toEqual(['home', 'products-json']);
    expect(calls.map((c) => c.url)).toContain(
      'https://woo.example/wp-json/wc/store/v1/products?per_page=100&page=1',
    );
  });

  it('retries server errors then reports an error', async () => {
    const { transport, calls } = fakeWeb({
      'https://down.example/robots.txt': { status: 404 },
      'https://down.example/': { status: 502 },
    });
    const r = await crawlSite({ cafeId: 'd', website: 'https://down.example' }, deps(transport));
    expect(r.status).toBe('error');
    expect(calls.filter((c) => c.url === 'https://down.example/')).toHaveLength(3);
  });

  it('recovers when a retry succeeds', async () => {
    const { transport } = fakeWeb({
      'https://flaky.example/robots.txt': { status: 404 },
      'https://flaky.example/': (n) => (n === 1 ? { status: 503 } : { text: '<body>ok</body>' }),
    });
    expect(
      (await crawlSite({ cafeId: 'f', website: 'https://flaky.example' }, deps(transport))).status,
    ).toBe('ok');
  });
});

describe('crawlCity', () => {
  it('sends the configured user agent with the contact URL', async () => {
    const clock = virtualClock();
    const { transport, calls } = fakeWeb({
      'https://a.example/robots.txt': { status: 404 },
      'https://a.example/': { text: '<body>a</body>' },
      'https://b.example/robots.txt': { status: 404 },
      'https://b.example/': { text: '<body>b</body>' },
    });
    const seen: string[] = [];
    const results = await crawlCity(
      [
        { cafeId: 'a', website: 'https://a.example' },
        { cafeId: 'b', website: 'https://b.example' },
        { cafeId: 'c' },
      ],
      {
        crawler: CRAWLER,
        contactUrl: 'https://github.com/a019956/cflog#bot',
        transport,
        sleep: clock.sleep,
        now: clock.now,
        onResult: (r) => seen.push(r.cafeId),
      },
    );
    expect(results.map((r) => r.status)).toEqual(['ok', 'ok', 'no-site']);
    expect(seen.sort()).toEqual(['a', 'b', 'c']);
    expect(calls[0]!.headers['user-agent']).toBe(
      'CoffeeLogBot/0.1 (+https://github.com/a019956/cflog#bot)',
    );
    expect(userAgent('X (+${CRAWLER_CONTACT_URL})', 'u')).toBe('X (+u)');
  });
});

describe('crawler hardening', () => {
  it('checks robots.txt again after a redirect to another origin, sharing one host slot', async () => {
    const clock = virtualClock();
    const calls: { url: string; t: number }[] = [];
    const transport: Transport = async (url) => {
      calls.push({ url, t: clock.now() });
      if (url === 'http://redir.example/robots.txt')
        return { url, status: 404, contentType: 'text/plain', text: '', headers: {} };
      if (url === 'http://redir.example/')
        return {
          url: 'https://www.redir.example/',
          status: 200,
          contentType: 'text/html',
          text: '<body><a href="/coffee">Coffee</a></body>',
          headers: {},
        };
      if (url === 'https://www.redir.example/robots.txt')
        return {
          url,
          status: 200,
          contentType: 'text/plain',
          text: 'User-agent: *\nDisallow: /coffee\n',
          headers: {},
        };
      return { url, status: 404, contentType: 'text/html', text: '', headers: {} };
    };
    const d = {
      get: createHttpClient({
        userAgent: 'x',
        timeoutMs: 1,
        retries: 0,
        transport,
        sleep: clock.sleep,
      }),
      queue: new HostQueue(2000, clock.sleep, clock.now),
      maxPages: 6,
    };
    const r = await crawlSite({ cafeId: 'r', website: 'http://redir.example/' }, d);
    expect(r.status).toBe('ok');
    expect(calls.map((c) => c.url)).toEqual([
      'http://redir.example/robots.txt',
      'http://redir.example/',
      'https://www.redir.example/robots.txt',
    ]);
    // www.redir.example shares the redir.example slot → 2 s spacing
    expect(calls[2]!.t - calls[1]!.t).toBe(2000);
  });

  it('waits at least the host interval (or Retry-After) before retrying', async () => {
    const sleeps: number[] = [];
    let n = 0;
    const transport: Transport = async (url): Promise<HttpResponse> => {
      n++;
      return n === 1
        ? { url, status: 429, contentType: 'text/html', text: '', headers: { 'retry-after': '7' } }
        : n === 2
          ? { url, status: 503, contentType: 'text/html', text: '', headers: {} }
          : { url, status: 200, contentType: 'text/html', text: 'ok', headers: {} };
    };
    const get = createHttpClient({
      userAgent: 'x',
      timeoutMs: 1,
      retries: 2,
      minRetryDelayMs: 2000,
      transport,
      sleep: async (ms) => void sleeps.push(ms),
    });
    expect((await get('https://a.example/')).status).toBe(200);
    expect(sleeps).toEqual([7000, 2000]);
  });

  it('keeps the site when the store JSON request fails, and skips robots-blocked links without using budget', async () => {
    const links = Array.from(
      { length: 8 },
      (_, i) => `<a href="/private/coffee-${i}">Coffee ${i}</a>`,
    ).join('');
    const { transport } = fakeWeb({
      'https://s.example/robots.txt': {
        contentType: 'text/plain',
        text: 'User-agent: *\nDisallow: /private/\n',
      },
      'https://s.example/': {
        text: `<html><script src="https://cdn.shopify.com/x.js"></script><body>${links}<a href="/pages/menu">Menu</a></body></html>`,
      },
      'https://s.example/products.json?limit=100&page=1': { status: 500 },
      'https://s.example/pages/menu': { text: '<body>Latte</body>' },
    });
    const r = await crawlSite({ cafeId: 's', website: 'https://s.example/' }, deps(transport));
    expect(r.status).toBe('ok');
    expect(r.pages.map((p) => p.kind)).toEqual(['home', 'menu']);
  });

  it('converts PDFs right away and drops the bytes', async () => {
    const { transport } = fakeWeb({
      'https://p.example/robots.txt': { status: 404 },
      'https://p.example/': { text: '<body><a href="/menu.pdf">Menu (PDF)</a></body>' },
      'https://p.example/menu.pdf': {
        contentType: 'application/pdf',
        bytes: new Uint8Array([1, 2, 3]),
      },
    });
    const r = await crawlSite(
      { cafeId: 'p', website: 'https://p.example/' },
      { ...deps(transport), pdfToText: async (b) => `pdf of ${b.length} bytes` },
    );
    expect(r.pages[1]).toMatchObject({ kind: 'pdf', text: 'pdf of 3 bytes' });
    expect(r.pages[1]!.bytes).toBeUndefined();
  });
});
