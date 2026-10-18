# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Vietnamese family-tree site (gia phả): Vue 3 + TypeScript + Vite SPA, deployed as a Cloudflare Worker with static assets. All user-facing text and API error messages are in Vietnamese. Keep new UI strings in Vietnamese too.

## Commands

- `npm run dev`: Vite dev server. A Vite plugin in `vite.config.ts` serves `/api/family-db` and reads/writes `src/data/family-db.json` directly on disk.
- `npm run build`: `vue-tsc --noEmit` type-check, then `vite build` into `dist/`. This is the only check the project has. There are no tests and no linter.
- Deploy: `npm run build && npx wrangler deploy`. Local Worker: `npx wrangler dev` (secrets go in `.dev.vars`).

## Architecture

### One backend, three implementations

The `/api/family-db` contract (GET, PUT, and POST `/export`) is implemented in **three places**, and they must stay in sync:

1. `vite.config.ts` (`familyDbPlugin`): dev middleware, stores data in `src/data/family-db.json`.
2. `worker/family-db.ts` (routed by `worker/index.ts`): production. It stores data in Workers KV (`FAMILY_DB_KV`, key `family-db`). When KV is empty it falls back to the bundled `src/data/family-db.json` as seed data.
3. `src/data/family-db-api.ts`: the client. It validates the response and normalizes settings with defaults.

Each one has its own member/settings validation and its own settings defaults. When you add a field to `FamilyMember` or `FamilyTreeSettings` (`src/types/family.ts`), update the validators and defaults in all three files. If you skip one, saves fail with a 400 or loads fail with a 500. `wrangler.toml` routes only `/api/*` to the Worker first, and everything else goes to the SPA.

### Approval workflow (approved vs pending)

The database holds two copies: `members`/`settings` (approved, shown publicly) and `pendingMembers`/`pendingSettings`/`pendingUpdatedAt` (drafts).

- Routes (`src/router.ts`): `/` is public and shows approved data only (old `/view` links and unknown paths redirect there). `ADMIN_PATH` and `SUPER_ADMIN_PATH` are secret URLs defined in `src/admin-paths.ts`. All three routes render the same `App.vue`, which works out a `mode` from `route.name`.
- Admin edits write only the pending copy, and the PUT needs no password.
- In super-admin mode you can approve (pending → approved), reject (discard pending), or download the JSON. The server compares stored data to incoming data with a canonical JSON comparison. Any change to approved data, or dropping pending, requires the `X-Approve-Password` header (`APPROVE_KEY`, or the `APPROVE_PASSWORD` secret). Export requires `X-Download-Password` (`DOWNLOAD_KEY`, or the `DOWNLOAD_PASSWORD` secret/env).
- `src/admin-paths.ts` holds the keys. Only server code (`worker/`, `vite.config.ts`) may import `APPROVE_KEY`/`DOWNLOAD_KEY`. Never import them from `src/` client code, or they end up in the browser bundle.

### Data model quirks

- Spouses: the current field is `spouseIds` (ordered: Vợ/Chồng 1, 2, …). The older fields `spouseId` and the deprecated `formerSpouseId` are still read. Always resolve spouses through `spouseIdsOf()` in `src/utils/spouses.ts`, not by reading fields directly. Spouse links are kept on both people.
- Parents come from `fatherId`/`motherId`. Sibling order uses `position`, then birth date.
- `deathDateLunar` is free text in `DD-MM` form. Anniversaries (ngày giỗ) and lunar holidays (`settings.lunarEvents`) are calculated with `src/utils/lunar.ts`, `lunar-events.ts`, and `anniversary.ts`, and shown in `AnniversaryBar.vue`. `memorialHostId` points to a living member who hosts the memorial.
- `settings.showDateInfo` is a legacy field that acts as the fallback for `showBirthDate`/`showDeathDate`.

### UI structure

- `src/App.vue` (large) holds all state: loading and saving the database, the admin edit form, settings, approve/reject, and export.
- `src/components/FamilyTree.vue` lays out the tree. It groups members into `FamilyUnit`s (one person plus their spouses, with `host`/`spouses` when there are several spouses), links each unit to its parent unit, and finds the root units. People who married into the family and have no children are handled separately. `FamilyTreeNode.vue` renders a unit recursively, and `PersonCard.vue` renders one person.

### Misc

- `src/counter.ts` and the `src/assets/*.svg` files are leftovers from the Vite template. `_to_delete/` and `functions/` (an empty, old Pages Functions folder) are unused.
