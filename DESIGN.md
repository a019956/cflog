---
version: alpha
colors:
  paper: '#F7F1E8'
  surface: '#FFFDF9'
  espresso: '#2B1D14'
  muted: '#6E5A4B'
  line: '#E4D8C8'
  cherry: '#B3261E'
  markerMenuOnly: '#8C6A4F'
  markerNone: '#B5A898'
  darkPaper: '#1A1411'
  darkSurface: '#241C18'
  darkInk: '#F2E8DC'
  darkMuted: '#BFAE9E'
  darkLine: '#3A2E27'
  darkCherry: '#E0645A'
  darkMarkerMenuOnly: '#C49A78'
  darkMarkerNone: '#6E6259'
typography:
  display:
    fontFamily: 'Fraunces, Georgia, serif'
  sans:
    fontFamily: 'Inter, system-ui, sans-serif'
rounded:
  card: '16px'
  chip: '999px'
spacing:
  unit: '4px'
map:
  light: 'https://tiles.openfreemap.org/styles/positron'
  dark: 'https://tiles.openfreemap.org/styles/dark'
---

## Overview

CoffeeLog is a field guide to specialty coffee. Its North Star is a roaster's tasting card: paper, espresso ink and a single coffee-cherry accent. Beans and what a café offers are the content. There are no ratings, stars or review counts anywhere.

Avoid review-site patterns (stars, "4.6 (1.2k)"), busy gradients, heavy shadows and decorative illustration.

## Colors

Paper and surface keep the map calm; the muted OpenFreeMap positron style lets markers carry the colour. Cherry is reserved for primary actions, active filter badges and markers of places with bean data. Menu-only places use a brown marker, and places without data use a hollow marker. Dark mode is an espresso-bar evening: deep brown paper, not pure black. The OS setting chooses the scheme. Source of truth for runtime values: `apps/mobile/src/theme/tokens.ts`.

## Typography

Fraunces is used for café names and section titles, Inter for everything else. Body ≥ 15pt, supporting OS font scaling up to 200% in sheets.

## Layout

The map is full-screen. A floating top bar holds the city picker, near-me and About; a horizontal filter-chip row sits beneath it. Details live in bottom sheets (snap 35% / 90%). The Map/List toggle sits above the sheet area.

## Elevation & Depth

The top bar, chips and sheets use a hairline border plus the smallest shadow the platform offers. The map is the only full-bleed surface.

## Components

- **Chips:** pill-shaped (`rounded.chip`). Active chips are filled cherry and show a count badge.
- **Bean cards:** name (Fraunces), origin flag + region, process, a 5-step roast bar, flavor-family chips, raw notes in italics, price/size, and "View on site".
- **Markers:** 28pt circles with a 44pt hit area. Clusters show a count.

## Do's and Don'ts

- Do show data freshness and link to the café's own site.
- Do pair colour with text or shape (marker fill + hollow outline; badge numbers).
- Don't show ratings, review counts or popularity metrics.
- Don't use colour alone to show roast level; the roast bar also has a text label.
