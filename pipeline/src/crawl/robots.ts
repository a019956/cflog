// robots.txt handling (RFC 9309): 4xx → everything allowed; 5xx/unreachable → nothing allowed.
import robotsParser from 'robots-parser';
import type { HttpGet } from './http.js';

export const BOT_TOKEN = 'CoffeeLogBot';

export interface RobotsRules {
  isAllowed(url: string): boolean;
  /** Crawl-delay in seconds, if declared for us or for * */
  crawlDelay?: number;
}

const ALLOW_ALL: RobotsRules = { isAllowed: () => true };
const DENY_ALL: RobotsRules = { isAllowed: () => false };

export async function fetchRobots(origin: string, get: HttpGet): Promise<RobotsRules> {
  const robotsUrl = `${origin}/robots.txt`;
  try {
    const res = await get(robotsUrl, 'text/plain,*/*;q=0.5');
    if (res.status >= 400 && res.status < 500) return ALLOW_ALL;
    if (res.status >= 500) return DENY_ALL;
    const robots = robotsParser(robotsUrl, res.text);
    return {
      isAllowed: (url) => robots.isAllowed(url, BOT_TOKEN) !== false,
      crawlDelay: robots.getCrawlDelay(BOT_TOKEN),
    };
  } catch {
    return DENY_ALL;
  }
}
