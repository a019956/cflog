import { describe, expect, it } from 'vitest';
import { CITIES, OPENFREEMAP_STYLE, ROAST_LEVELS } from '../src/index';

describe('@cflog/shared smoke', () => {
  it('has the three launch cities with valid bboxes', () => {
    expect(CITIES.map((c) => c.id)).toEqual(['nyc', 'philadelphia', 'boston']);
    for (const c of CITIES) {
      const [minLng, minLat, maxLng, maxLat] = c.bbox;
      expect(minLng).toBeLessThan(maxLng);
      expect(minLat).toBeLessThan(maxLat);
      expect(c.center[0]).toBeGreaterThan(minLng);
      expect(c.center[1]).toBeLessThan(maxLat);
    }
  });
  it('exposes vocabularies and map styles', () => {
    expect(ROAST_LEVELS).toContain('omni');
    expect(OPENFREEMAP_STYLE.light).toMatch(/^https:\/\/tiles\.openfreemap\.org\//);
  });
});
