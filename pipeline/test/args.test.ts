import { describe, expect, it } from 'vitest';
import { parsePipelineArgs } from '../src/args.js';

describe('parsePipelineArgs', () => {
  it('defaults to all launch cities', () => {
    expect(parsePipelineArgs([])).toEqual({
      cities: ['nyc', 'philadelphia', 'boston'],
      dryRun: false,
      maxCafes: null,
      skipLlm: false,
    });
  });
  it('parses flags', () => {
    expect(
      parsePipelineArgs(['--city', 'boston', '--dry-run', '--max-cafes', '5', '--skip-llm']),
    ).toEqual({
      cities: ['boston'],
      dryRun: true,
      maxCafes: 5,
      skipLlm: true,
    });
  });
  it('rejects unknown cities and bad numbers', () => {
    expect(() => parsePipelineArgs(['--city', 'austin'])).toThrow(/Unknown city/);
    expect(() => parsePipelineArgs(['--max-cafes', '0'])).toThrow(/positive integer/);
  });
});
