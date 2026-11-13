# Defender loot and report identity

Scope: owner-approved feedback #164 and #171. Based on main
`7d57e0532827fffe2bde0da65f03e8045b460dda`; production deployment is outside scope.

## Findings

- `crates/engine/src/encounter.rs` records actual settlement loot in `full`, then
  clones that observation for each defender. Cargo loss is separately scoped by
  recipient, and return details are added only for the recipient's attacking
  fleets. `ContactLost` deliberately does not inherit full combat information.
- `crates/application/src/report_preview.rs` projects the authorized recipient's
  loot unchanged while omitting rounds, cargo losses and private return details.
  No server payload, authorization, sharing or persistence changes are needed.
- `hasCombatLoot` incorrectly filtered this existing observation to attacking
  viewers. Both detail and list used that rule. Three focused assertions failed
  against the original code; the original rendered defender report lacked loot.
- The list link used wrapping flex layout for activity, archive status and
  identity, so short identities joined the first line. Explicit activity and
  identity rows now preserve the hierarchy for combat, espionage and delivery.
  Coordinates flow inline with identity on the second line; only mobile selection
  uses a separate grid column. Report title, identity, delivery route, coordinates,
  resource preview and timestamp share a 14px text size.
- HUD inbox/title descriptions already use separate block elements. HUD detail
  uses the same corrected ReportObservation as full reports. No new enemy or
  current-world information is fetched or inferred.

## Validation

- Focused model/static tests cover defender/attacker/unknown perspective, zero
  and unavailable loot, other outcomes, ContactLost and canonical resource marks.
- `report-readability.spec.ts` mounts production ReportListRow and
  ReportObservation with recipient-visible fixtures. It verifies title/identity
  geometry, overflow at 1440×1000 and 390×1000, separate loot/debris/cargo groups,
  matching row text sizes, inline coordinates beside short identities, checkbox
  and coordinate-link isolation, archive availability and opening through the native
  report link.
- Existing shared-combat component tests cover visible and redacted locations.
- The initial browser fixture had an overly broad identity selector matching the
  unread dot. Its one repair excludes aria-labeled status marks. Subsequent runs
  passed; no product assertion was deleted or weakened. The initial component
  typecheck also identified and corrected a fixture SessionContext shape error.
- Visual inspection found a mobile checkbox wrap in the first implementation;
  explicit grid placement fixed it. Fresh desktop/mobile captures were inspected
  after the fix and are delivered in the originating chat, not uploaded to the PR.
- Focused unit run including HUD presentation: 68 passed, 0.705s. Final component run: three passed, bundle
  preparation 3.650s, browser execution 2.1s (one worker). No runner queue wait.
  Runners clean up their owned browser/server and temporary bundle directories.
  Existing JSON import-attribute and Node module warnings were nonfatal.

Production build (including application typecheck), component typecheck, lint,
changed-file formatting and whitespace checks passed. Production build wall time
was not separately recorded; Vite client compilation reported 3.70s.

Screenshots use prepared local data, not production accounts. Full-system
acceptance and live production reproduction are outside this package.

## Additional application visual probe

A disposable application capture probe produced the real report-list screenshots
at both sizes. It was retired after its one repair: the first assertion counted
four HUD rows despite one already-read header; correcting that expectation
exposed an invalid synthetic combat-detail payload, which the real schema
correctly rejected. No production change was made for these fixture defects.
The successful list captures and failed-run diagnostics remain local. Detail
visuals and regression coverage are retained at the production component
boundary; the application HUD detail was not established by this probe.
The probe also had two invocation/setup failures (an unconfigured project name
and a file outside the routine test allowlist), before running any assertions.
No tests, fixture files or runner configuration from that probe are shipped.

## Owner readability follow-up

The owner requested inline target coordinates beside player/planet identity and
uniform report-row text sizes. Identity and coordinates now share ordinary inline
flow below the title. The report link still spans the row, with the independent
coordinate control above it; no links are nested. Updated component coverage checks
font sizes, inline geometry, natural narrow-screen wrapping and independent link
activation. Fresh 1440×1000 and 390×1000 captures replace the earlier list visuals.

Follow-up validation: the updated component case passed (3.842s preparation,
2.0s browser execution, one worker), including normal/mobile selection states,
inline coordinate navigation and equal font sizes. Application and component
TypeScript checks, lint, changed-file formatting and whitespace checks passed.
An initial fixture capability omitted the required `reason: Available`; the
component typecheck identified it and it was corrected before pushing.

## Main integration

Integrated main `9e0d4284` to resolve the shared component registry conflict,
keeping both report-readability and galaxy-navigation registrations. The combined
registry passed four focused component cases (4.216s preparation, 3.6s execution,
one worker), component TypeScript checking and formatting. Fresh report captures
were inspected at desktop/mobile sizes. No production report code changed in
this integration. Dependencies installed locally with `npm ci` in 3s; repository
runners cleaned up their owned browser/server and temporary bundles.
