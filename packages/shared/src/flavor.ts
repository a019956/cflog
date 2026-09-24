// Flavor-family taxonomy: top two levels of the SCA/WCR flavor wheel as used by CoffeeLog (ADR-009).

export const FLAVOR_FAMILIES = [
  'fruity',
  'fruity/berry',
  'fruity/dried-fruit',
  'fruity/other-fruit',
  'fruity/citrus',
  'sour-fermented',
  'green-vegetative',
  'roasted',
  'spices',
  'nutty-cocoa',
  'nutty-cocoa/nutty',
  'nutty-cocoa/cocoa',
  'sweet',
  'sweet/brown-sugar',
  'sweet/vanilla',
  'floral',
  'floral/tea',
  'floral/floral',
  'other',
] as const;
export type FlavorFamilyId = (typeof FLAVOR_FAMILIES)[number];

export const FLAVOR_LABELS: Record<FlavorFamilyId, string> = {
  fruity: 'Fruity',
  'fruity/berry': 'Berry',
  'fruity/dried-fruit': 'Dried fruit',
  'fruity/other-fruit': 'Other fruit',
  'fruity/citrus': 'Citrus',
  'sour-fermented': 'Sour / fermented',
  'green-vegetative': 'Green / vegetative',
  roasted: 'Roasted',
  spices: 'Spices',
  'nutty-cocoa': 'Nutty / cocoa',
  'nutty-cocoa/nutty': 'Nutty',
  'nutty-cocoa/cocoa': 'Cocoa',
  sweet: 'Sweet',
  'sweet/brown-sugar': 'Brown sugar',
  'sweet/vanilla': 'Vanilla',
  floral: 'Floral',
  'floral/tea': 'Tea',
  'floral/floral': 'Floral',
  other: 'Other',
};

export function isFlavorFamilyId(s: string): s is FlavorFamilyId {
  return (FLAVOR_FAMILIES as readonly string[]).includes(s);
}

/** Top-level family of an id: "fruity/berry" → "fruity". */
export function topFamily(id: FlavorFamilyId): FlavorFamilyId {
  return id.split('/')[0] as FlavorFamilyId;
}

/** Sub-families of a top-level family, e.g. "fruity" → ["fruity/berry", …]. Empty for leaf families. */
export function subFamilies(id: FlavorFamilyId): FlavorFamilyId[] {
  return FLAVOR_FAMILIES.filter((f) => f.startsWith(`${id}/`));
}

/** Top-level families in display order. */
export const TOP_FAMILIES: FlavorFamilyId[] = FLAVOR_FAMILIES.filter((f) => !f.includes('/'));

/**
 * True when a café/bean facet id satisfies a selected filter id.
 * A selected top-level family matches itself and all its sub-ids. A selected sub-id matches only itself.
 */
export function familyMatches(facetId: FlavorFamilyId, selectedId: FlavorFamilyId): boolean {
  return facetId === selectedId || facetId.startsWith(`${selectedId}/`);
}
