import { ScrollView, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { CONFIG } from '@/config';
import { getDataSource } from '@/data/source';
import { openLink } from '@/lib/links';
import { useTheme } from '@/theme/ThemeProvider';

export const ATTRIBUTIONS = [
  {
    title: 'Map',
    text: 'OpenFreeMap © OpenMapTiles. Map data © OpenStreetMap contributors.',
    url: 'https://www.openstreetmap.org/copyright',
  },
  {
    title: 'Places',
    text: 'Overture Maps Foundation (CDLA-Permissive-2.0).',
    url: 'https://docs.overturemaps.org/attribution/',
  },
  {
    title: 'Foursquare data',
    text: 'Includes Foursquare Open Source Places, used under the Apache License 2.0 (see NOTICE).',
    url: 'https://docs.overturemaps.org/attribution/',
  },
];

/** About & attributions (03 § Screens: About). */
export default function About() {
  const t = useTheme();
  const sample = getDataSource().kind === 'sample';
  const email = CONFIG.contactEmail;
  return (
    <ScrollView style={{ backgroundColor: t.colors.bg }} contentContainerStyle={styles.body}>
      <Text variant="title" accessibilityRole="header">
        CoffeeLog
      </Text>
      <Text>
        Specialty roasters and cafés, and the beans they actually sell. No ratings. Just what’s in
        the bag and on the menu.
      </Text>
      <Text muted>
        Beans and menus are gathered weekly from each café’s public website. Things change; tap
        through to the café’s site before you go.
      </Text>
      {sample ? (
        <View style={[styles.note, { backgroundColor: t.colors.banner }]}>
          <Text variant="label">
            You’re looking at sample data. All places shown are fictional.
          </Text>
        </View>
      ) : null}

      <Text variant="heading" accessibilityRole="header">
        Data sources
      </Text>
      {ATTRIBUTIONS.map((a) => (
        <View key={a.title} style={styles.attr}>
          <Text variant="label">{a.title}</Text>
          <Text variant="caption" muted>
            {a.text}
          </Text>
          <Button
            label={`${a.title} licence`}
            kind="secondary"
            onPress={() => openLink(a.url)}
            style={styles.left}
          />
        </View>
      ))}

      <Text variant="heading" accessibilityRole="header">
        For café owners
      </Text>
      <Text>
        Want your café removed or something corrected? Email us, or block CoffeeLogBot in your
        robots.txt.
      </Text>
      {email ? (
        <Button
          label={`Email ${email}`}
          onPress={() => openLink(`mailto:${email}`)}
          style={styles.left}
        />
      ) : null}

      <Text variant="caption" muted>
        Version {Constants.expoConfig?.version ?? '—'}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 14, paddingBottom: 48 },
  attr: { gap: 4 },
  note: { padding: 12, borderRadius: 12 },
  left: { alignSelf: 'flex-start' },
});
