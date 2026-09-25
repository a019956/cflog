import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { TOUCH } from '@/theme/tokens';
import { Text } from './Text';

interface Props {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary';
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

export function Button({ label, onPress, kind = 'primary', style, accessibilityHint }: Props) {
  const t = useTheme();
  const primary = kind === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: primary ? t.colors.accent : t.colors.surface,
          borderColor: primary ? t.colors.accent : t.colors.border,
          opacity: pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      <Text variant="button" color={primary ? t.colors.onAccent : t.colors.text}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: TOUCH,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
