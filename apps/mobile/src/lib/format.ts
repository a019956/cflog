// Pure display helpers (tested).
import {
  countryName,
  KM_PER_MILE,
  MENU_CATEGORIES,
  ROAST_LEVELS,
  type Bean,
  type MenuCategory,
  type MenuItem,
  type RoastLevel,
} from '@cflog/shared';

/** "Updated today" / "Updated yesterday" / "Updated 5 days ago" / "Updated 3 weeks ago". */
export function updatedLabel(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return 'Not updated yet';
  const days = Math.floor((now.getTime() - Date.parse(iso)) / 86_400_000);
  if (!Number.isFinite(days)) return 'Not updated yet';
  if (days <= 0) return 'Updated today';
  if (days === 1) return 'Updated yesterday';
  if (days < 14) return `Updated ${days} days ago`;
  if (days < 60) return `Updated ${Math.floor(days / 7)} weeks ago`;
  return `Updated ${Math.floor(days / 30)} months ago`;
}

const OZ = 28.3495;

/** "$22 · 12 oz" (US formats); falls back gracefully when parts are missing. */
export function priceLabel(b: Pick<Bean, 'priceUsd' | 'sizeGrams'>): string | null {
  const price =
    b.priceUsd !== undefined
      ? `$${b.priceUsd % 1 === 0 ? b.priceUsd.toFixed(0) : b.priceUsd.toFixed(2)}`
      : null;
  let size: string | null = null;
  if (b.sizeGrams) {
    const oz = b.sizeGrams / OZ;
    size = oz >= 15.5 ? `${+(oz / 16).toFixed(1)} lb` : `${Math.round(oz)} oz`;
  }
  return [price, size].filter(Boolean).join(' · ') || null;
}

/** Position 1–5 on the roast bar (omni → 3), or null. */
export function roastStep(level: RoastLevel | null): number | null {
  if (!level) return null;
  if (level === 'omni') return 3;
  return ROAST_LEVELS.indexOf(level) + 1;
}

/** Regional-indicator flag emoji for an ISO alpha-2 code. */
export function flag(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function originLabel(b: Pick<Bean, 'origin' | 'isBlend'>): string {
  const names = b.origin.countries.map((c) => `${flag(c)} ${countryName(c)}`.trim());
  if (names.length === 0) return b.isBlend ? 'Blend' : 'Origin not listed';
  const base = b.isBlend && names.length > 1 ? `Blend · ${names.join(', ')}` : names.join(', ');
  return b.origin.region ? `${base} · ${b.origin.region}` : base;
}

export const MENU_LABELS: Record<MenuCategory, string> = {
  espresso: 'Espresso',
  brewed: 'Brewed',
  'pour-over': 'Pour-over',
  cold: 'Cold',
  tea: 'Tea',
  food: 'Food',
  other: 'Other',
};

/** Menu grouped by category in a fixed order; empty groups dropped. */
export function groupMenu(
  menu: readonly MenuItem[],
): { category: MenuCategory; label: string; items: MenuItem[] }[] {
  return MENU_CATEGORIES.map((category) => ({
    category,
    label: MENU_LABELS[category],
    items: menu.filter((m) => m.category === category),
  })).filter((g) => g.items.length > 0);
}

/** Miles with one decimal under 10 mi. */
export function distanceLabel(km: number): string {
  const mi = km / KM_PER_MILE;
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
}

export function kindLabel(kind: 'roaster' | 'cafe' | 'both'): string {
  return kind === 'roaster' ? 'Roaster' : kind === 'both' ? 'Roaster + café' : 'Café';
}
