import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { fonts, mapStyleFor, paletteFor, radius, space, type, type Palette } from './tokens';

export interface Theme {
  scheme: 'light' | 'dark';
  colors: Palette;
  space: typeof space;
  radius: typeof radius;
  fonts: typeof fonts;
  type: typeof type;
  mapStyle: string;
}

export function makeTheme(scheme: string | null | undefined): Theme {
  const s = scheme === 'dark' ? 'dark' : 'light';
  return { scheme: s, colors: paletteFor(s), space, radius, fonts, type, mapStyle: mapStyleFor(s) };
}

const ThemeContext = createContext<Theme>(makeTheme('light'));

/** Follows the OS colour scheme (ADR-011). */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const theme = useMemo(() => makeTheme(scheme), [scheme]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
