import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

/** Short message below the top bar (above any bottom sheet); hides after 4 s and is announced to screen readers. */
export function Toast({
  message,
  onHide,
  top,
}: {
  message: string | null;
  onHide: () => void;
  top: number;
}) {
  const t = useTheme();
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
      style={[styles.toast, { top, backgroundColor: t.colors.text }]}
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
