// App state (Zustand). Filters and selection are session state; the last city persists (AsyncStorage, R9).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CITIES, type Filters, type LngLat } from '@cflog/shared';
import { create } from 'zustand';

import type { FilterDim } from '@/filters/dims';
import { lastKnownIfGranted } from '@/lib/location';
import { resolveNearMe } from '@/lib/nearMe';
import { toggleValue, clearDim } from '@/filters/dims';

export const LAST_CITY_KEY = 'cflog.lastCityId';
export const DEFAULT_CITY_ID = 'nyc';

export type SheetName = 'city' | 'filters' | null;

export interface AppState {
  hydrated: boolean;
  cityId: string;
  filters: Filters;
  viewMode: 'map' | 'list';
  selectedCafeId: string | null;
  userLocation: LngLat | null;
  openSheet: SheetName;
  filterDim: FilterDim | 'all';
  /** working copy for the "All filters" sheet (applied on confirm, R5) */
  draftFilters: Filters;
  toast: string | null;

  hydrate: () => Promise<void>;
  setCity: (cityId: string) => void;
  toggleFilter: (dim: FilterDim, value: string) => void;
  setFilters: (filters: Filters) => void;
  clearFilterDim: (dim: FilterDim) => void;
  resetFilters: () => void;
  setViewMode: (m: 'map' | 'list') => void;
  selectCafe: (id: string | null) => void;
  setUserLocation: (p: LngLat | null) => void;
  openCityPicker: () => void;
  openFilters: (dim: FilterDim | 'all') => void;
  setDraftFilters: (f: Filters) => void;
  applyDraftFilters: () => void;
  closeSheet: () => void;
  showToast: (msg: string | null) => void;
}

const knownCity = (id: string | null | undefined): id is string =>
  !!id && CITIES.some((c) => c.id === id);

export const useAppStore = create<AppState>((set, get) => ({
  hydrated: false,
  cityId: DEFAULT_CITY_ID,
  filters: {},
  viewMode: 'map',
  selectedCafeId: null,
  userLocation: null,
  openSheet: null,
  filterDim: 'all',
  draftFilters: {},
  toast: null,

  hydrate: async () => {
    if (get().hydrated) return;
    let saved: string | null = null;
    try {
      saved = await AsyncStorage.getItem(LAST_CITY_KEY);
    } catch {
      saved = null;
    }
    if (knownCity(saved)) {
      set({ hydrated: true, cityId: saved });
      return;
    }
    // First launch: use the nearest launch city if location was already granted (no prompt, R9).
    const point = await lastKnownIfGranted();
    const near = point ? resolveNearMe(point) : null;
    set({
      hydrated: true,
      ...(near?.kind === 'city' ? { cityId: near.cityId, userLocation: point } : {}),
    });
  },
  setCity: (cityId) => {
    if (!knownCity(cityId)) return;
    // A manual city choice drops the near-me position, so the map centres on the city.
    set({ cityId, selectedCafeId: null, openSheet: null, userLocation: null });
    AsyncStorage.setItem(LAST_CITY_KEY, cityId).catch(() => undefined);
  },
  toggleFilter: (dim, value) => set((s) => ({ filters: toggleValue(s.filters, dim, value) })),
  setFilters: (filters) => set({ filters }),
  clearFilterDim: (dim) => set((s) => ({ filters: clearDim(s.filters, dim) })),
  resetFilters: () => set({ filters: {} }),
  setViewMode: (viewMode) => set({ viewMode }),
  selectCafe: (selectedCafeId) => set({ selectedCafeId, openSheet: null }),
  setUserLocation: (userLocation) => set({ userLocation }),
  openCityPicker: () => set((s) => (s.openSheet ? {} : { openSheet: 'city' })),
  // Ignored while another sheet is open, so an open draft is never overwritten.
  openFilters: (filterDim) =>
    set((s) => (s.openSheet ? {} : { openSheet: 'filters', filterDim, draftFilters: s.filters })),
  setDraftFilters: (draftFilters) => set({ draftFilters }),
  applyDraftFilters: () => set((s) => ({ filters: s.draftFilters, openSheet: null })),
  closeSheet: () => set({ openSheet: null }),
  showToast: (toast) => set({ toast }),
}));
