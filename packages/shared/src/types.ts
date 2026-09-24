// Firestore document types (02 Architecture § Data model). Timestamps are ISO-8601 strings.
import type { FlavorFamilyId } from './flavor';
import type {
  BeanSource,
  CrawlStatus,
  DataStatus,
  Kind,
  MenuCategory,
  Platform,
  Process,
  RoastLevel,
} from './vocab';

export type IsoDate = string;
/** [lng, lat] */
export type LngLat = [number, number];

/** Café-level facet summary, shared by `cityIndex` entries and `cafes/{id}.facets`. */
export interface CafeFacets {
  dataStatus: DataStatus;
  beanCount: number;
  sellsOnline: boolean;
  roastLevels: RoastLevel[];
  processes: Process[];
  /** ISO-3166 alpha-2 */
  originCountries: string[];
  flavorFamilies: FlavorFamilyId[];
  /** normalised with normalizeVariety */
  varieties: string[];
  hasDecaf: boolean;
}

/** One entry in `cityIndex/{cityId}.cafes`. */
export interface CafeSummary extends CafeFacets {
  id: string;
  name: string;
  kind: Kind;
  lat: number;
  lng: number;
}

export interface Address {
  line1?: string;
  city?: string;
  state?: string;
  postcode?: string;
}

export interface Bean {
  /** stable hash of (cafeId + normalised name) */
  id: string;
  name: string;
  url?: string;
  origin: { countries: string[]; region?: string; farm?: string; producer?: string };
  isBlend: boolean;
  process: Process | null;
  roastLevel: RoastLevel | null;
  varieties: string[];
  isDecaf: boolean;
  tastingNotesRaw: string[];
  flavorFamilies: FlavorFamilyId[];
  priceUsd?: number;
  sizeGrams?: number;
  inStock?: boolean;
  source: BeanSource;
  firstSeenAt: IsoDate;
  lastSeenAt: IsoDate;
}

export interface MenuItem {
  id: string;
  name: string;
  category: MenuCategory;
  priceUsd?: number;
  description?: string;
  source: BeanSource;
  lastSeenAt: IsoDate;
}

export const MAX_BEANS_PER_CAFE = 200;
export const MAX_MENU_ITEMS_PER_CAFE = 150;

/** `cafes/{cafeId}`; id is the Overture id or `manual-<slug>`. */
export interface Cafe {
  id: string;
  cityId: string;
  name: string;
  kind: Kind;
  address: Address;
  lat: number;
  lng: number;
  /** 9-character geohash */
  geohash: string;
  website?: string;
  phone?: string;
  instagram?: string;
  platform: Platform;
  dataStatus: DataStatus;
  facets: CafeFacets;
  sources: { overtureId?: string; overtureRelease?: string };
  /** last crawl with status ok; drives "Updated N days ago" */
  lastCrawledAt?: IsoDate;
  lastChangedAt?: IsoDate;
  crawlStatus: CrawlStatus;
  hidden: boolean;
  beans: Bean[];
  menu: MenuItem[];
}

/** `cities/{cityId}` */
export interface CityDoc {
  id: string;
  name: string;
  state: string;
  bbox: [number, number, number, number];
  center: LngLat;
  cafeCount: number;
  updatedAt: IsoDate;
  /** present only when the city index is sharded */
  indexShards?: string[];
}

/** `cityIndex/{cityId}` (or a shard `cityIndex/{cityId}-{n}`) */
export interface CityIndexDoc {
  cityId: string;
  updatedAt: IsoDate;
  version: 1;
  cafes: CafeSummary[];
}

export interface PipelineCafeState {
  /** short hash of the published café doc (excluding timestamps) */
  contentHash: string;
  /** short hash over all fetched pages (url + content hash); unchanged → skip extraction */
  pagesHash: string;
  lastExtractedAt?: IsoDate;
  crawlStatus: CrawlStatus;
  /** consecutive successful crawls a bean was missing from (removed at 2) */
  beanMiss: Record<string, number>;
  /** first time each bean id was seen */
  beanFirstSeen: Record<string, IsoDate>;
  /** consecutive runs the café was absent from discovery (deleted at 4) */
  hiddenRuns: number;
}

/** `pipelineState/{cityId}`: pipeline-only manifest, never read by the app. */
export interface PipelineStateDoc {
  cityId: string;
  updatedAt: IsoDate;
  overtureRelease?: string;
  cafes: Record<string, PipelineCafeState>;
}

/** Filter selection (02 § Filter semantics). Empty or missing arrays mean "no filter". */
export interface Filters {
  kinds?: Kind[];
  sellsOnline?: boolean;
  roastLevels?: RoastLevel[];
  processes?: Process[];
  originCountries?: string[];
  flavorFamilies?: FlavorFamilyId[];
  varieties?: string[];
  decafOnly?: boolean;
}
