// Design tokens from `03 UX-UI § Design tokens` (ADR-011). WP-07 wires these into a theme provider.
export const palette = {
  light: {
    bg: '#F7F1E8',
    surface: '#FFFDF9',
    text: '#2B1D14',
    textMuted: '#6E5A4B',
    accent: '#B3261E',
    border: '#E4D8C8',
    markerBeans: '#B3261E',
    markerMenuOnly: '#8C6A4F',
    markerNone: '#B5A898',
  },
  dark: {
    bg: '#1A1411',
    surface: '#241C18',
    text: '#F2E8DC',
    textMuted: '#BFAE9E',
    accent: '#E0645A',
    border: '#3A2E27',
    markerBeans: '#E0645A',
    markerMenuOnly: '#C49A78',
    markerNone: '#6E6259',
  },
} as const;

export type ColorScheme = keyof typeof palette;
export type Palette = (typeof palette)[ColorScheme];

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { card: 16, chip: 999 } as const;

export function paletteFor(scheme: string | null | undefined): Palette {
  return scheme === 'dark' ? palette.dark : palette.light;
}
