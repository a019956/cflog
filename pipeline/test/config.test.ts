import { describe, expect, it } from 'vitest';
import {
  ConfigError,
  loadConfig,
  parseChainsConfig,
  parseOverridesConfig,
  parsePipelineConfig,
} from '../src/config.js';

describe('config', () => {
  it('loads the repo config files', async () => {
    const cfg = await loadConfig();
    expect(cfg.pipeline.overture.release).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
    expect(cfg.pipeline.overture.primaryCategories).toContain('coffee_shop');
    expect(cfg.chains.deny).toContain('Starbucks');
    expect(cfg.overrides).toEqual({ add: [], hide: [], patch: {} });
  });
  it('rejects a pipeline config with missing keys', () => {
    expect(() => parsePipelineConfig('overture: {}')).toThrow(ConfigError);
  });
  it('validates overrides', () => {
    const ok = parseOverridesConfig(`
add:
  - { id: manual-sample, cityId: boston, name: Sample, kind: roaster, lat: 42.3, lng: -71.1, website: sample.example }
hide: [abc]
patch:
  xyz: { kind: both, website: https://x.example }
`);
    expect(ok.add[0]).toMatchObject({ id: 'manual-sample', kind: 'roaster' });
    expect(ok.hide).toEqual(['abc']);
    expect(ok.patch.xyz).toMatchObject({ kind: 'both' });
    expect(() =>
      parseOverridesConfig(
        'add: [{ id: sample, cityId: boston, name: S, kind: roaster, lat: 1, lng: 2 }]',
      ),
    ).toThrow(/manual-/);
    expect(() => parseOverridesConfig('patch: { a: { kind: bakery } }')).toThrow(/kind/);
  });
  it('accepts an empty chains file', () => {
    expect(parseChainsConfig('')).toEqual({ deny: [] });
  });
});
