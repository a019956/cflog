// CoffeeLog weekly pipeline. WP-00 stub: parses args and prints the planned stages.
// Stages (02 Architecture): discover → crawl → extract → normalise → publish → report.
import { parsePipelineArgs } from './args.js';

const STAGES = ['discover', 'crawl', 'extract', 'normalise', 'publish', 'report'] as const;

function main(): number {
  let args;
  try {
    args = parsePipelineArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`[pipeline] ${(err as Error).message}`);
    return 2;
  }
  console.log(
    `[pipeline] cities=${args.cities.join(',')} dryRun=${args.dryRun} maxCafes=${args.maxCafes ?? 'all'} skipLlm=${args.skipLlm}`,
  );
  for (const s of STAGES)
    console.log(`[pipeline] stage ${s}: not implemented yet (see 06 Build Plan)`);
  return 0;
}

process.exitCode = main();
