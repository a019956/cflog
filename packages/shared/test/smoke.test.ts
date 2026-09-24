import { describe, expect, it } from 'vitest';
import { MAP_ATTRIBUTION, OPENFREEMAP_STYLE, ROAST_LEVELS } from '../src/index';

describe('@cflog/shared exports', () => {
  it('exposes vocabularies, map styles and attribution', () => {
    expect(ROAST_LEVELS).toContain('omni');
    expect(OPENFREEMAP_STYLE.light).toMatch(/^https:\/\/tiles\.openfreemap\.org\//);
    expect(MAP_ATTRIBUTION).toContain('OpenStreetMap');
  });
});
