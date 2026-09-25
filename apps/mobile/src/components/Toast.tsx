import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

/** Short message above the bottom bar; hides after 4 s and is announced to screen readers. */
export function Toast({ message, onHide }: { message: string | null; onHide: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(onHide, 4000);
    return () => clearTimeout(id);
  }, [message, onHide]);
  if (!message) return null;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={[styles.toast, { bottom: insets.bottom + 80, backgroundColor: t.colors.text }]}
    >
      <Text variant="label" color={t.colors.bg}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: { position: 'absolute', left: 24, right: 24, padding: 14, borderRadius: 14 },
});
