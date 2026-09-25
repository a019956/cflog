# CoffeeLog UX contract

This contract records observable product behaviour. Café places come from Overture Maps. Beans and menus come from cafés' own public websites, refreshed weekly. Map tiles come from OpenFreeMap. Design and planning docs: Obsidian vault `Coding/CoffeeLog/` (`03 UX-UI`, `02 Architecture`).

## Canonical UI Map

| Capability         | Canonical owner                                 | Source of truth                    | Allowed variants                              | Verification  |
| ------------------ | ----------------------------------------------- | ---------------------------------- | --------------------------------------------- | ------------- |
| Map                | `src/map/CafeMap`                               | DESIGN.md                          | light (positron) / dark (dark)                | device + unit |
| Markers & clusters | `src/map/` GeoJSON source                       | This contract                      | beans / menu-only / none; cluster             | unit + device |
| City selection     | City picker sheet + `src/data` city store       | `@cflog/shared` `CITIES`           | picker / near-me                              | unit + device |
| Filters            | `src/filters` store using shared `applyFilters` | 02 Architecture § Filter semantics | chip sheet (live) / all-filters sheet (apply) | unit          |
| Result ordering    | shared `sortCafes`                              | This contract                      | with / without location                       | unit          |
| Café details       | `src/cafe` bottom sheet                         | This contract                      | Beans tab / Menu tab                          | unit + device |
| Async status       | Inline banners and skeletons                    | This contract                      | loading / empty / error / ready               | unit + device |
| Colour scheme      | `src/theme` tokens                              | DESIGN.md                          | light / dark (follows OS)                     | unit          |
| Attribution        | About screen + map attribution control          | Data licences                      | —                                             | device        |

## Workflow ledger

| Operation           | Trigger                         | Pending                                | Success                                                                            | Failure and recovery                                           | Source                         |
| ------------------- | ------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------ |
| Load city           | App start, city picker, near-me | Map visible, skeleton top bar, spinner | Markers for all non-hidden cafés; results count                                    | Inline banner with Retry; map stays interactive                | Firestore `cityIndex/{cityId}` |
| Near me             | Near-me button                  | OS permission prompt                   | Jump to the nearest launch city within 50 km, centre on the user, sort by distance | Denied → city picker; out of range → toast + city picker       | expo-location                  |
| Filter              | Chip sheet selection            | Immediate local update                 | Map, list and count reflect filters; chip badge shows the count                    | Empty result → "No places match these filters" + Clear filters | shared `applyFilters`          |
| Open café           | Marker or list-row tap          | Sheet at 35% with card skeletons       | Info, Beans (matching first) and Menu                                              | Inline error with Retry; the sheet stays open                  | Firestore `cafes/{id}`         |
| Open website / bean | Website / View on site          | In-app browser opening                 | Page shown                                                                         | Browser error handled by the OS                                | expo-web-browser               |
| Directions          | Directions button               | —                                      | OS maps app opens at the café                                                      | If no maps app, fall back to a browser maps URL                | OS                             |

## Behavioral rules

- R1: Never show ratings, review counts or popularity metrics.
- R2: Every café sheet shows "Updated N days ago" (from `lastCrawledAt`) and, when the café has a known website, a Website button.
- R3: Ordering is beans > menu-only > none, then distance if location is granted, else name. With any bean filter active (roast, process, origin, flavor, variety, decaf), only cafés with bean data appear. With no filters, no-data cafés use the hollow marker.
- R4: Filters persist across Map/List switches and sheet opens. Reset clears every dimension.
- R5: Single-dimension chip sheets apply live and show a live count with Done. The All filters sheet applies on "Show N places".
- R6: Outbound links open in the in-app browser. Directions opens the OS maps app.
- R7: Map attribution ("OpenFreeMap © OpenMapTiles Data from OpenStreetMap") is always visible as a text line under the header in map view (never covered by bottom sheets).
- R8: No account UI in v1.
- R9: The last selected city is restored on launch (AsyncStorage). First launch: NYC, unless location is already granted and a launch city is within 50 km.
- R10: Android back closes the topmost sheet (filter/city sheet, then the café sheet) before leaving the app. Sheets have a backdrop; tapping it closes the sheet.
- R11: WCAG 2.2 AA basics: 44×44pt targets, AA contrast (tested), labels on icon buttons and list rows, reduce-motion honoured (live). Map markers are native map layers that screen readers can't reach, so the List view is the accessible equivalent (the map's label says so). The café sheet has a labelled Close button. English (US) formats: $, miles.
