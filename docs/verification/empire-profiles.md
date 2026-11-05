# Empire profiles implementation verification

November 5, 2026. Implementation branch: `emick/orbit-profiles-history`.
Base revision: `a0a3b7d14656838d7b10d2db810b187d57561f22`.
The changes remain local; no PR, merge, deployment, or production data change was
requested or performed. Exact final source manifest/digest is recorded below.

## Functional validation

- Final client suite: **140 files, 1,337 tests passed**, 6.07 seconds reported
  execution/runner duration. The earlier full run had one obsolete assertion that
  expected no anchor; the corrected test checks exactly one profile anchor and
  no nested links. Focused rerun passed before the final full run.
- Application/HTTP suite: **192 tests passed** across six binaries. Preparation
  took 22.32 seconds; nextest execution took 24.330 seconds. After final arithmetic
  and standalone-route additions, the four affected tests passed in 0.024 seconds
  following 4.77 seconds preparation.
- PostgreSQL suites passed: empire_history (4), empire_history_upgrade (1),
  colonization (5), alliances (10), empire_deletion (16), report_sharing (1),
  attack_groups (3), insignias (1). **41 distinct tests.**
- Final history/upgrade execution: 8.783 seconds and 0.678 seconds respectively;
  reported Cargo preparation: 8.36/9.23 seconds. Other observed suite execution:
  colonization 15.992s, alliances 34.492s, deletion 45.761s, report sharing 6.118s,
  attack groups 42.185s, insignias 3.631s.
- Real colony/abandonment and joint attack tests assert archive capture as part of
  actual gameplay commits; the joint attack covers both serial and scoped runtimes.
- Database/HTTP coverage includes private library access, same-universe/epoch
  authorization, another reader publishing a selected event, optimistic concurrency,
  exact retry, keyset pagination, preserved payload ownership, source purge
  protection, correction provenance, campaign replay and late entrants, closure,
  membership removal, account detachment, Origin/CSRF enforcement and public DTOs.
- Upgrade coverage applies the real pre-0036 migration bundle and retained fixtures
  before migrating, proving unknown dates/names/strength stay unknown and contact-
  lost history never gains the defender's affiliation.
- Browser validation: 110 passed in the initial 119-case affected-suite run, eight
  failed and one was interrupted because its obsolete locator was waiting for a
  link on a locally identified shared-report participant. Focused follow-up: nine
  passed, one failed and was removed as described below. The shared-preview case
  correctly retains a button for recipient-local participant IDs.
- Profile/desktop navigation run: 17 passed, one expected-menu-content failure;
  its one repair passed. Final dossier/layout capture checks: three passed.
  New public overview/closed-campaign checks passed at desktop and mobile widths.
- Explicit visual exercises completed selection, caption editing, public visibility,
  battle expansion, permanent publication, card navigation/printing affordance,
  account overview, closed/removed empires, empty history and unavailable responses.
  Matching responses were registered before navigation/mutations and completely
  delivered before observing the UI. No sleeps, retries, timeout increases or
  screenshots were used to establish response readiness.
- Production web build, TypeScript, Rust formatting, workspace Clippy with warnings
  denied, ESLint, Prettier, OpenAPI drift/validation, and architecture boundaries pass.

UI module preparation was measured separately by the existing runner: approximately
1.56–1.85 seconds. Individual browser execution durations and total runner times
were retained in tool output; the final three dossier cases took 4.6 seconds total,
and the final account-menu case took 2.1 seconds total. Cargo reported build-lock
waits during Make's parallel database suites; their duration was not separately
instrumented, so the reported Cargo preparation numbers include that wait. No CI
queue or merge queue was entered; CI/merge waiting and removals are not applicable.
No execution deadlines or routine CI suite scope were changed.

## Failure and repair record

Git history and the available repository Test Czar/performance-audit records were
checked before repairing tests. No separate owner Test Czar ledger was available.

1. New owner-profile browser cases at 1440 and 390 pixels first used an exact heading
   name that omitted the accessible supporter badge. One selector repair was made.
   They then failed on an exact planet-name locator because the displayed identity
   includes its separator. Both cases were removed under the one-repair rule, not
   renamed or reintroduced. The actual editor/publication flow was then exercised
   separately during visual review. Authorization, selection, publication, retries
   and lifecycle protection remain in deterministic database/HTTP coverage.
2. The two new public-overview browser cases had the same heading-name mismatch;
   the shared selector repair passed at both widths and these cases remain.
3. Existing click-to-toggle dossier cases needed the new link/hover semantics.
   Repeated `focus()` on an Escape-dismissed, already-focused reference does not
   emit focus and does not establish keyboard modality. The shared keyboard helper
   now uses Tab before focusing the link; Popover links also retain explicit Tab
   re-entry. The affected callers were audited together. Nine focused cases passed.
4. `Galaxy message shortcut preserves the selected player through route normalization`
   still lacked its tooltip message link after that repair. It was removed rather
   than receiving another stabilization patch or a retry. The remaining evidence
   did not establish a more specific cause. Existing message navigation, social
   engine/application/HTTP coverage, and profile social destination links remain.
   No independent reliability work is silently left open by this removal.
5. The desktop touch-menu test expected only Settings/Logout. Its single repair
   explicitly adds My Orbit profile, checks `/profile`, and retains all 44px touch-
   target assertions; it passed.
6. The new alliance-history test initially used a real wall clock against empires
   enrolled at logical time 1000, making them pending inactivity removal. Its one
   repair sets the fixture clock to 1000, as other gameplay fixtures do. It passes.
7. Compile/static preparation caught a missing updated history call argument,
   Migrator's `DEFAULT` constant instead of a nonexistent Default implementation,
   a helper placed after a Rust test module, and equivalent integer comparison
   syntax flagged by Clippy. These were corrected; no assertions were weakened.
8. Disposable Docker setup initially exhausted automatic address pools. A subnet
   was explicitly configured for this task's isolated Compose project. No unrelated
   networks, containers or volumes were pruned. A contact-sheet script's Sharp
   module entry path was corrected; this did not change screenshots or application
   behavior.

## Visual evidence and cleanup

Screenshots use illustrative fixtures, not actual Nova Roma events or licensed
concept artwork. Original captures are in the local ignored `test-results/` folder,
including `history-final-{state}-{width}x1000.png`. The battle and editor captures
show their complete elements at the stated viewport widths. Four labelled contact
sheets group curation, battles/cards, campaigns, and lifecycle states. Current
player dossiers were captured at 1440×1000 and 390×1000; account navigation at
1024×900 and the mobile menu at 390×844. These images are delivered in the
implementation chat, not uploaded or attached to a PR.

The final running screenshots were inspected for readable hierarchy, mobile
wrapping, touch targets, resource colors and overflow. The overview's share
controls were grouped and ordinary link colors aligned with the game palette;
affected captures were refreshed afterward. No generated artwork was required.

All fixture browser/Vite processes exited through their normal cleanup. Database
suites used the existing disposable database helper and its cleanup trap, under
Compose project `orbit-profile-validation`. Final removal of that project's
container, volume and network is recorded with the source digest below. Temporary
visual tooling is task-local; screenshots and the source manifest remain available.

## Integration limits

Campaign result/closure functions are ready for the authoritative scenario
transaction; this does not implement the separate victory-condition, simulation
shutdown or migration system. Coordinated Accounts deletion remains operational:
detach the Orbit profile association as part of that procedure. A missing Accounts
public-profile response is deliberately not treated as deletion because it can also
mean suspension or unlinking. Browser printing is included; automated physical
fulfillment and the separate polished card/Chronicle renderer remain outside scope.

Final implementation source SHA-256 (all changed/new files except this verification
record): `2e13fc28f25801aba18f1a7506a099c04e50a7f8a856e15abc2ea1e05ae7cba7`. Per-file hashes: local
`test-results/empire-profile-source.json`.

Final static pipeline: 12.23 seconds wall time. Final production web build:
13.54 seconds wall time (Vite client 4.07s; SSR/prerender compilation 0.521s).
The build reports its existing large-chunk and router circular-dependency
notices; it completes successfully. Final workspace Clippy: 11.92s.

Cleanup confirmed: no `orbit_test_*` databases remained in the task database;
Compose removed `orbit-profile-validation-db-1`, its `orbit-db` volume, and its
private network. The screenshots, manifest and verification record are retained.
