import { beforeEach, describe, expect, it } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { createFirestoreSource, withCache, type DocReader } from '../src/data/source';
import { SAMPLE_CAFES, sampleSource } from '../src/data/sample';
import { LAST_CITY_KEY, useAppStore } from '../src/state/store';

describe('Firestore source', () => {
  it('reads one index doc, falls back to shards, and reads café docs', async () => {
    const docs: Record<string, unknown> = {
      'cityIndex/nyc': { cafes: [{ id: 'a' }] },
      'cities/boston': { id: 'boston', cafeCount: 3, indexShards: ['boston-0', 'boston-1'] },
      'cityIndex/boston-0': { cafes: [{ id: 'b1' }] },
      'cityIndex/boston-1': { cafes: [{ id: 'b2' }, { id: 'b3' }] },
      'cities/nyc': { id: 'nyc', cafeCount: 1 },
      'cafes/a': { id: 'a', name: 'A' },
    };
    const reads: string[] = [];
    const read: DocReader = async (c, id) => {
      reads.push(`${c}/${id}`);
      return docs[`${c}/${id}`] ?? null;
    };
    const src = createFirestoreSource(read);
    expect(await src.cityIndex('nyc')).toEqual([{ id: 'a' }]);
    expect(reads).toEqual(['cityIndex/nyc']);
    expect((await src.cityIndex('boston')).map((c) => c.id)).toEqual(['b1', 'b2', 'b3']);
    expect(await src.cityIndex('philadelphia')).toEqual([]);
    expect(await src.cityCounts()).toEqual({ nyc: 1, boston: 3 });
    expect(await src.cafe('a')).toMatchObject({ name: 'A' });
    expect(await src.cafe('missing')).toBeNull();
  });

  it('caches successful loads and retries failed ones', async () => {
    let calls = 0;
    const src = withCache({
      kind: 'firestore',
      cityIndex: async () => {
        calls++;
        if (calls === 1) throw new Error('offline');
        return [];
      },
      cityCounts: async () => ({}),
      cafe: async () => null,
    });
    await expect(src.cityIndex('nyc')).rejects.toThrow('offline');
    await src.cityIndex('nyc');
    await src.cityIndex('nyc');
    expect(calls).toBe(2);
  });
});

describe('sample data', () => {
  it('has fictional cafés with consistent facets in every city', async () => {
    const counts = await sampleSource.cityCounts();
    expect(counts).toEqual({ nyc: 10, philadelphia: 10, boston: 10 });
    for (const c of SAMPLE_CAFES) {
      expect(c.facets.beanCount).toBe(c.beans.length);
      expect(c.dataStatus).toBe(c.facets.dataStatus);
    }
    const idx = await sampleSource.cityIndex('boston');
    expect(idx.some((c) => c.dataStatus === 'none')).toBe(false);
    expect(idx.some((c) => c.dataStatus === 'menu-only')).toBe(true);
    expect(await sampleSource.cafe(idx[0]!.id)).toMatchObject({ cityId: 'boston' });
  });
});

describe('app store', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useAppStore.setState({
      hydrated: false,
      cityId: 'nyc',
      filters: {},
      selectedCafeId: null,
      openSheet: null,
    });
  });

  it('restores the last city and ignores unknown values', async () => {
    await AsyncStorage.setItem(LAST_CITY_KEY, 'boston');
    await useAppStore.getState().hydrate();
    expect(useAppStore.getState()).toMatchObject({ hydrated: true, cityId: 'boston' });
    useAppStore.setState({ hydrated: false, cityId: 'nyc' });
    await AsyncStorage.setItem(LAST_CITY_KEY, 'atlantis');
    await useAppStore.getState().hydrate();
    expect(useAppStore.getState().cityId).toBe('nyc');
  });

  it('persists the chosen city and resets selection', async () => {
    useAppStore.setState({ selectedCafeId: 'x', openSheet: 'city' });
    useAppStore.getState().setCity('philadelphia');
    expect(useAppStore.getState()).toMatchObject({
      cityId: 'philadelphia',
      selectedCafeId: null,
      openSheet: null,
    });
    await Promise.resolve();
    expect(await AsyncStorage.getItem(LAST_CITY_KEY)).toBe('philadelphia');
  });

  it('keeps filters across view changes and resets them', () => {
    const s = useAppStore.getState();
    s.toggleFilter('roast', 'light');
    s.setViewMode('list');
    s.selectCafe('abc');
    expect(useAppStore.getState().filters).toEqual({ roastLevels: ['light'] });
    useAppStore.getState().resetFilters();
    expect(useAppStore.getState().filters).toEqual({});
  });

  it('edits a draft in "All filters" and applies it only on confirm', () => {
    const s = useAppStore.getState();
    s.toggleFilter('roast', 'light');
    s.openFilters('all');
    useAppStore.getState().setDraftFilters({ roastLevels: ['dark'] });
    expect(useAppStore.getState().filters).toEqual({ roastLevels: ['light'] });
    useAppStore.getState().applyDraftFilters();
    expect(useAppStore.getState()).toMatchObject({
      filters: { roastLevels: ['dark'] },
      openSheet: null,
    });
  });
});
