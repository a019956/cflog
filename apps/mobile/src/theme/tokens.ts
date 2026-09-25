// Design tokens from `03 UX-UI § Design tokens` (ADR-011). Runtime source of truth; DESIGN.md mirrors it.
import { OPENFREEMAP_STYLE } from '@cflog/shared';

export const palette = {
  light: {
    bg: '#F7F1E8',
    surface: '#FFFDF9',
    text: '#2B1D14',
    textMuted: '#6E5A4B',
    accent: '#B3261E',
    onAccent: '#FFFDF9',
    border: '#E4D8C8',
    markerBeans: '#B3261E',
    markerMenuOnly: '#8C6A4F',
    markerNone: '#857564',
    banner: '#F3E3C8',
    danger: '#9A1B14',
  },
  dark: {
    bg: '#1A1411',
    surface: '#241C18',
    text: '#F2E8DC',
    textMuted: '#BFAE9E',
    accent: '#E0645A',
    onAccent: '#1A1411',
    border: '#3A2E27',
    markerBeans: '#E0645A',
    markerMenuOnly: '#C49A78',
    markerNone: '#6E6259',
    banner: '#3A2A1C',
    danger: '#F28B82',
  },
} as const;

export type ColorScheme = keyof typeof palette;
export type Palette = { [K in keyof (typeof palette)['light']]: string };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { card: 16, chip: 999, sm: 8 } as const;

/** Font family names registered in the root layout (useFonts). */
export const fonts = {
  heading: 'Fraunces_600SemiBold',
  body: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
} as const;

export const type = {
  title: { fontFamily: fonts.heading, fontSize: 24, lineHeight: 30 },
  heading: { fontFamily: fonts.heading, fontSize: 19, lineHeight: 24 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21 },
  label: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 18 },
  caption: { fontFamily: fonts.body, fontSize: 13, lineHeight: 17 },
  button: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },
} as const;
export type TypeVariant = keyof typeof type;

/** Minimum touch target (WCAG 2.2 AA target size, 03 UX-UI). */
export const TOUCH = 44;

export function paletteFor(scheme: string | null | undefined): Palette {
  return scheme === 'dark' ? palette.dark : palette.light;
}

export function mapStyleFor(scheme: string | null | undefined): string {
  return scheme === 'dark' ? OPENFREEMAP_STYLE.dark : OPENFREEMAP_STYLE.light;
}
