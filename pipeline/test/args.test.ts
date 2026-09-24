import { describe, expect, it } from 'vitest';
import { parsePipelineArgs } from '../src/args.js';

describe('parsePipelineArgs', () => {
  it('defaults to all launch cities', () => {
    expect(parsePipelineArgs([])).toEqual({
      cities: ['nyc', 'philadelphia', 'boston'],
      dryRun: false,
      maxCafes: null,
      skipLlm: false,
      inspectCategories: false,
      overtureSource: null,
    });
  });
  it('parses flags', () => {
    expect(
      parsePipelineArgs([
        '--city',
        'boston',
        '--dry-run',
        '--max-cafes',
        '5',
        '--skip-llm',
        '--overture-source',
        'x.parquet',
      ]),
    ).toMatchObject({
      cities: ['boston'],
      dryRun: true,
      maxCafes: 5,
      skipLlm: true,
      overtureSource: 'x.parquet',
    });
    expect(parsePipelineArgs(['--inspect-categories']).inspectCategories).toBe(true);
  });
  it('rejects unknown cities, bad numbers and unknown flags', () => {
    expect(() => parsePipelineArgs(['--city', 'austin'])).toThrow(/Unknown city/);
    expect(() => parsePipelineArgs(['--max-cafes', '0'])).toThrow(/positive integer/);
    expect(() => parsePipelineArgs(['--nope'])).toThrow();
  });
});
