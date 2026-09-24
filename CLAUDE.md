# CLAUDE.md

Guidance for Claude in this repository. Planned with /plan-code. Design docs live in the Obsidian vault at `G:\My Drive\_ObsidianVault\Coding\CoffeeLog\` (hub `_INIT.md`; read-only for agents). Relevant excerpts are pasted into each brief.

## What this is

CoffeeLog: a public Expo (React Native) app that shows specialty roasters and cafés in NYC, Philadelphia and Boston on an OpenFreeMap map, with their bean offerings and menus, filterable by roast, origin, process, flavor family, type, variety and decaf. A weekly Node pipeline (GitHub Actions) fills Firebase Firestore from Overture Places plus the cafés' own websites.

## Commands

```bash
npm install                      # root; npm workspaces
npm run typecheck                # all workspaces
npm run lint
npm test                         # vitest (shared, pipeline) + jest-expo (mobile)
npm run pipeline -- --dry-run [--city boston] [--max-cafes 5] [--skip-llm]
npm run mobile                   # expo start (needs a dev build: npx expo run:android)
```

Inside `apps/mobile`, always add packages with `npx expo install <pkg>` (SDK 57-compatible versions). Read `apps/mobile/AGENTS.md` for Expo-specific rules. Expo changes every SDK, so check the versioned docs instead of relying on memory.

## Architecture

| Workspace         | Path                  | Responsibility                                                                                                                                                |
| ----------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@cflog/shared`   | `packages/shared/src` | Types, vocabularies (roast, process, kind, flavor families), note dictionary, city config, `applyFilters`/`sortCafes`. Consumed as TS source (no build step). |
| `@cflog/pipeline` | `pipeline/src`        | discover (Overture via DuckDB) → crawl → extract (Shopify/Woo JSON, keywords, Gemini) → normalise → publish (diff vs `pipelineState`) → report                |
| `@cflog/mobile`   | `apps/mobile/src`     | Expo Router app (`src/app` = routes), MapLibre map, filters, café sheet                                                                                       |
| Firebase          | `firebase/`           | Firestore rules/indexes                                                                                                                                       |

## Conventions

- TypeScript strict everywhere; `noUncheckedIndexedAccess` in shared/pipeline.
- Pure logic lives in `packages/shared` and is unit-tested there. The app and pipeline import it.
- Pipeline tests never hit the network: use fixtures in `pipeline/fixtures/` and undici `MockAgent` / mocked clients.
- No ratings or review counts anywhere (UX-CONTRACT R1).
- Keep changes inside the work package's scope; don't refactor unrelated code.
- Never commit secrets. Add new variable names to `.env.example`.

## Contracts (don't change without a brief saying so)

- Firestore shape: `cities/{id}`, `cityIndex/{id}` (compact summaries), `cafes/{id}` with embedded `beans[]` (≤200) and `menu[]` (≤150), `pipelineState/{id}` (pipeline-only). The app reads 1 doc per city + 1 per café sheet.
- Filter semantics: OR within a dimension, AND across dimensions, family id matches its sub-ids, any bean filter excludes cafés without bean data.
- Crawler: robots.txt honoured, ≤1 req/2 s per host, ≤6 pages/site, UA `CoffeeLogBot/0.1 (+CRAWLER_CONTACT_URL)`.
- Quotas: Firestore Spark (50k reads, 20k writes per day), `PIPELINE_MAX_WRITES`, `GEMINI_MAX_CALLS`.
- UX rules: `UX-CONTRACT.md`. Visual tokens: `DESIGN.md`.

## Work packages

Briefs arrive in `.plan-code/briefs/`. Report in the JSON schema `.plan-code/wp-report.schema.json`.

## Continuing after a stop (any agent)

If `.plan-code/HANDOFF.md` exists, read it and `.plan-code/RUNBOOK.md` before doing anything. They say where work stopped and how to continue safely.

## Planning & docs

- Plan and history: `G:\My Drive\_ObsidianVault\Coding\CoffeeLog\` (`_INIT.md` is the hub).
- Continue work with `/plan-code CoffeeLog`. It resumes from the hub's `phase:`.
- Claude implements the work packages from the briefs (ADR-012), then verifies, commits and updates the docs.
