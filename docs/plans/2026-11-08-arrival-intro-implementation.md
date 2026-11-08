# Arrival intro implementation plan

**Goal:** Build the one-time arrival scene described in
[the design](2026-11-08-arrival-intro.md), end to end.

**Architecture:** Arrival status and chosen planet appearance are presentation
records in PostgreSQL, outside ordered world replay. The world view and Galaxy
query decorate their responses with them, the same way they add public player
names. One authenticated endpoint changes them. The client renders the scene in
place of the game shell while the bound view says arrival is pending, saves the
choices in order, then opens Briefing.

## Global constraints

- Planet look options are the art slots in the homeworld's climate band:
  hot 1–4 (position ≤ 4), temperate 5–8 (positions 5–8), cold 9–15 (≥ 9).
- Planet names: 1–40 characters after trimming, no control characters.
- Only human signups through enrollment start pending. Existing members, bots and
  operator/scenario-added players never see the scene.
- Completion is recorded only after the title, appearance and name saves succeed.
  Every step is idempotent.
- No art default is stored. Absent appearance means the slot art for the position.

## Server

1. **Migration `0041_arrival.sql`**
   - `empire_arrivals(player uuid PRIMARY KEY REFERENCES players ON DELETE
     CASCADE, universe uuid NOT NULL REFERENCES universes ON DELETE CASCADE,
     completed_at_ms bigint)`. NULL means pending. No backfill.
   - `body_appearances(body uuid PRIMARY KEY REFERENCES bodies ON DELETE
     CASCADE, art_slot smallint NOT NULL CHECK (art_slot BETWEEN 1 AND 15))`.
2. **Bands** in `crates/application/src/arrival.rs`:
   `pub fn appearance_band(position: u32) -> RangeInclusive<u8>` with unit tests
   for positions 1, 4, 5, 8, 9, 12, 15.
3. **Storage** (`crates/storage-postgres/src/arrival.rs`):
   - signup enrollment (`enrollment.rs`, human only) inserts a pending row.
   - `arrival_presentation(binding, bodies)` → pending, `joined_at_ms`, own
     appearances. `body_appearances(universe, bodies)` for Galaxy.
   - `set_body_appearance(binding, body, slot)` checks owner, kind `Planet` and
     band, then upserts. `complete_arrival(binding)` sets `completed_at_ms` once.
4. **Application**: `world_view` adds `arrival_pending`, `joined_at_ms` and
   `body_appearances` to `BoundView4`; Galaxy adds `body_appearances` to
   `NamedGalaxy`. `ArrivalAction = SetAppearance { body, slot } | Complete`.
5. **HTTP**: `POST /api/v1/universes/{id}/arrival` with
   `{ context, action }`, CSRF-protected, principal must match the binding.
   Returns `{ pending }`.
6. **Contracts**: extend `contracts/openapi.json`, run `npm run contracts`.
7. **Tests** (`crates/storage-postgres/tests/arrival.rs`): signup starts
   pending; scenario/bot players have no row; band validation rejects
   out-of-band, foreign and moon bodies; repeated set/complete are idempotent;
   views expose appearances to other viewers through Galaxy.

## Client

1. `ui/artwork.ts`: `appearanceOptions(position): number[]` (own slot first),
   `resolveBodyArt` accepts an optional `appearance`.
2. `features/body-illustration.tsx` and `shell/body-selector.tsx` use the
   appearance from the bound view (own bodies) or the Galaxy response.
3. `features/arrival/names.ts`: `randomPlanetName(random?: () => number)`
   from an original word list; every output passes `planetNameError`.
4. `features/arrival/model.ts`: scene steps, draft, and the completion
   sequence `title → appearance → rename → complete`, each skipped when
   unchanged or already applied.
5. `features/arrival/arrival-scene.tsx` + CSS module: fade, orb flicker,
   centered lines, title select, swipe carousel, name input with dice, subtle
   Skip, reduced motion, error and retry on the final step.
6. Game shell renders the scene while `arrival_pending`; completion navigates to
   Briefing. Announcements dated before `joined_at_ms` are hidden.
7. Tests: unit tests for options, names, model; one fixture browser spec at
   desktop and mobile covering the flow, swipe, dice and skip.
8. Screenshots of every step at desktop 1440×900 and mobile 390×844 against
   the scratch universe.

## Review focus

- A failed save mid-sequence must leave the player in the scene with a retry,
  not in a half-finished game.
- A slow network must not show the game shell before the bound view says the
  arrival is complete.
- Reloading on the final step must not double-rename or skip completion.
- A homeworld at position 4 still gets four distinct looks.
- Keyboard-only and screen-reader users can finish the scene.
