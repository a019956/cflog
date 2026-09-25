import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { distanceKm, orderBeans, type Cafe, type Filters, type LngLat } from '@cflog/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';

import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { useCafe } from '@/data/hooks';
import { distanceLabel, groupMenu, kindLabel, updatedLabel } from '@/lib/format';
import { openDirections, openLink } from '@/lib/links';
import { useTheme } from '@/theme/ThemeProvider';
import { TOUCH } from '@/theme/tokens';
import { BeanCard } from './BeanCard';

interface Props {
  cafeId: string | null;
  filters: Filters;
  userLocation: LngLat | null;
  onClose: () => void;
}

type Tab = 'beans' | 'menu';

function Tabs({
  tab,
  onTab,
  beanCount,
  menuCount,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  beanCount: number;
  menuCount: number;
}) {
  const t = useTheme();
  const item = (key: Tab, label: string) => {
    const on = tab === key;
    return (
      <Pressable
        key={key}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        onPress={() => onTab(key)}
        style={[styles.tab, { borderBottomColor: on ? t.colors.accent : 'transparent' }]}
      >
        <Text variant="button" color={on ? t.colors.text : t.colors.textMuted}>
          {label}
        </Text>
      </Pressable>
    );
  };
  return (
    <View accessibilityRole="tablist" style={[styles.tabs, { borderColor: t.colors.border }]}>
      {item('beans', `Beans${beanCount ? ` (${beanCount})` : ''}`)}
      {item('menu', `Menu${menuCount ? ` (${menuCount})` : ''}`)}
    </View>
  );
}

function Body({
  cafe,
  filters,
  userLocation,
}: {
  cafe: Cafe;
  filters: Filters;
  userLocation: LngLat | null;
}) {
  const t = useTheme();
  const [tab, setTab] = useState<Tab>(cafe.beans.length || !cafe.menu.length ? 'beans' : 'menu');
  const beans = useMemo(() => orderBeans(cafe.beans, filters), [cafe.beans, filters]);
  const menu = useMemo(() => groupMenu(cafe.menu), [cafe.menu]);
  const dist = userLocation ? distanceLabel(distanceKm(userLocation, [cafe.lng, cafe.lat])) : null;
  const address = [cafe.address.line1, cafe.address.city].filter(Boolean).join(', ');

  return (
    <View style={styles.body}>
      <View style={styles.header}>
        <Text variant="title" accessibilityRole="header">
          {cafe.name}
        </Text>
        <Text variant="caption" muted>
          {kindLabel(cafe.kind)}
          {address ? ` · ${address}` : ''}
          {dist ? ` · ${dist}` : ''}
        </Text>
        <Text variant="caption" muted>
          {updatedLabel(cafe.lastCrawledAt)}
        </Text>
      </View>
      <View style={styles.actions}>
        {cafe.website ? (
          <Button label="Website" kind="secondary" onPress={() => openLink(cafe.website!)} />
        ) : null}
        <Button
          label="Directions"
          kind="secondary"
          onPress={() => openDirections(cafe.lat, cafe.lng, cafe.name)}
        />
      </View>
      <Tabs tab={tab} onTab={setTab} beanCount={cafe.beans.length} menuCount={cafe.menu.length} />
      {tab === 'beans' ? (
        beans.length ? (
          <View style={styles.list}>
            {beans.map(({ bean, matches }) => (
              <BeanCard key={bean.id} bean={bean} matches={matches} />
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <Text variant="body" muted>
              We couldn’t find beans on their site yet.
            </Text>
            {cafe.website ? (
              <Button
                label="Visit website"
                kind="secondary"
                onPress={() => openLink(cafe.website!)}
              />
            ) : null}
          </View>
        )
      ) : menu.length ? (
        <View style={styles.list}>
          {menu.map((g) => (
            <View key={g.category} style={styles.menuGroup}>
              <Text variant="heading">{g.label}</Text>
              {g.items.map((m) => (
                <View key={m.id} style={[styles.menuRow, { borderColor: t.colors.border }]}>
                  <View style={styles.menuName}>
                    <Text variant="body">{m.name}</Text>
                    {m.description ? (
                      <Text variant="caption" muted>
                        {m.description}
                      </Text>
                    ) : null}
                  </View>
                  {m.priceUsd !== undefined ? (
                    <Text variant="label">${m.priceUsd.toFixed(2)}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.empty}>
          <Text variant="body" muted>
            Menu not available.
          </Text>
        </View>
      )}
    </View>
  );
}

/** Café details in a bottom sheet (snap 35% / 90%), one café doc read per open (02 § Contracts). */
export function CafeSheet({ cafeId, filters, userLocation, onClose }: Props) {
  const t = useTheme();
  const ref = useRef<BottomSheet>(null);
  const state = useCafe(cafeId);

  useEffect(() => {
    if (cafeId) ref.current?.snapToIndex(0);
    else ref.current?.close();
  }, [cafeId]);

  // Android back closes the sheet first (R10).
  useEffect(() => {
    if (!cafeId) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [cafeId, onClose]);

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={['35%', '90%']}
      enableDynamicSizing={false}
      enablePanDownToClose
      onClose={onClose}
      backgroundStyle={{ backgroundColor: t.colors.bg }}
      handleIndicatorStyle={{ backgroundColor: t.colors.border }}
      accessibilityLabel="Café details"
    >
      <BottomSheetScrollView contentContainerStyle={styles.scroll}>
        {!cafeId ? null : state.status === 'loading' ? (
          <View style={styles.skeletons} accessibilityLabel="Loading café">
            {[0, 1, 2].map((i) => (
              <View key={i} style={[styles.skeleton, { backgroundColor: t.colors.surface }]} />
            ))}
          </View>
        ) : state.status === 'error' ? (
          <Banner message="Couldn't load this café." actionLabel="Retry" onAction={state.retry} />
        ) : state.data ? (
          <Body
            key={state.data.id}
            cafe={state.data}
            filters={filters}
            userLocation={userLocation}
          />
        ) : (
          <Banner message="This café is no longer listed." />
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingBottom: 48 },
  body: { gap: 14 },
  header: { gap: 4 },
  actions: { flexDirection: 'row', gap: 10 },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { minHeight: TOUCH, paddingHorizontal: 12, justifyContent: 'center', borderBottomWidth: 3 },
  list: { gap: 12 },
  empty: { gap: 12, paddingVertical: 16 },
  menuGroup: { gap: 6 },
  menuRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuName: { flex: 1, gap: 2 },
  skeletons: { gap: 12, paddingTop: 8 },
  skeleton: { height: 72, borderRadius: 16 },
});
