import { describe, expect, it } from '@jest/globals';

import { contrastRatio } from '../src/theme/contrast';
import { mapStyleFor, palette, paletteFor } from '../src/theme/tokens';

describe('theme tokens', () => {
  it('picks the dark palette only for dark scheme', () => {
    expect(paletteFor('dark')).toBe(palette.dark);
    expect(paletteFor('light')).toBe(palette.light);
    expect(paletteFor(null)).toBe(palette.light);
    expect(mapStyleFor('dark')).toMatch(/styles\/dark$/);
    expect(mapStyleFor('light')).toMatch(/styles\/positron$/);
  });
  it('defines the same keys in both schemes', () => {
    expect(Object.keys(palette.dark).sort()).toEqual(Object.keys(palette.light).sort());
  });
  it.each(['light', 'dark'] as const)('meets WCAG AA contrast in %s mode', (scheme) => {
    const c = palette[scheme];
    for (const bg of [c.bg, c.surface, c.banner]) {
      expect(contrastRatio(c.text, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c.textMuted, bg)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio(c.onAccent, c.accent)).toBeGreaterThanOrEqual(4.5); // active chips, primary buttons
    expect(contrastRatio(c.accent, c.bg)).toBeGreaterThanOrEqual(3); // icons, badges, large text
    expect(contrastRatio(c.accent, c.surface)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(c.bg, c.text)).toBeGreaterThanOrEqual(4.5); // toast
  });
  it('computes known contrast ratios', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });
});
