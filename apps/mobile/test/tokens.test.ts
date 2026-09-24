import { describe, expect, it } from '@jest/globals';
import { palette, paletteFor } from '../src/theme/tokens';

describe('theme tokens', () => {
  it('picks the dark palette only for dark scheme', () => {
    expect(paletteFor('dark')).toBe(palette.dark);
    expect(paletteFor('light')).toBe(palette.light);
    expect(paletteFor(null)).toBe(palette.light);
  });
  it('defines the same keys in both schemes', () => {
    expect(Object.keys(palette.dark).sort()).toEqual(Object.keys(palette.light).sort());
  });
});
