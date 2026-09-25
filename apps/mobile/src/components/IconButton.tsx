import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { TOUCH } from '@/theme/tokens';

interface Props {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}

/** Icon-only button with a 44×44 target and an accessibility label. */
export function IconButton({ icon, label, onPress, size = 22, color, style, disabled }: Props) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.6 : disabled ? 0.4 : 1 }, style]}
    >
      <Ionicons name={icon} size={size} color={color ?? t.colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { minWidth: TOUCH, minHeight: TOUCH, alignItems: 'center', justifyContent: 'center' },
});
