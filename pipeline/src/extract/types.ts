// Raw extraction output, before normalisation into shared `Bean` / `MenuItem` (WP-06).
import type { BeanSource } from '@cflog/shared';

export interface RawBean {
  name: string;
  url?: string;
  description?: string;
  /** free-text origin line, e.g. "Guji, Ethiopia" */
  originText?: string;
  countries?: string[];
  region?: string;
  farm?: string;
  producer?: string;
  process?: string;
  roast?: string;
  varieties?: string[];
  notes?: string[];
  isDecaf?: boolean;
  isBlend?: boolean;
  priceUsd?: number;
  sizeGrams?: number;
  inStock?: boolean;
  /** flavor family ids suggested by the LLM for notes the dictionary misses (validated in normalise) */
  flavorFamilies?: string[];
  source: BeanSource;
}

export interface RawMenuItem {
  name: string;
  category?: string;
  priceUsd?: number;
  description?: string;
  source: BeanSource;
}

export interface ExtractionResult {
  beans: RawBean[];
  menu: RawMenuItem[];
}
