// @cflog/shared: types, vocabularies and pure logic shared by the app and the pipeline.
export * from './vocab';
export * from './flavor';
export * from './noteDictionary';
export * from './origins';
export * from './cities';
export * from './types';
export * from './filters';

export const OPENFREEMAP_STYLE = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const;

export const MAP_ATTRIBUTION = 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap';
