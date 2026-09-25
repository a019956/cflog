import { Text as RNText, type TextProps } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import type { TypeVariant } from '@/theme/tokens';

interface Props extends TextProps {
  variant?: TypeVariant;
  muted?: boolean;
  color?: string;
}

/** Themed text. Font scaling stays on (up to 2×) per 03 UX-UI accessibility rules. */
export function Text({
  variant = 'body',
  muted,
  color,
  style,
  maxFontSizeMultiplier = 2,
  ...rest
}: Props) {
  const t = useTheme();
  return (
    <RNText
      {...rest}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[
        t.type[variant],
        { color: color ?? (muted ? t.colors.textMuted : t.colors.text) },
        style,
      ]}
    />
  );
}
