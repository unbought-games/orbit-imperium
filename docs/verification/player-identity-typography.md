# Player identity typography audit — November 5, 2026

Branch: `emick/empire-identity`; base `2d6f226ac76cab528d6c820ea18ffa9eea87d2b7`.
This is a follow-up to empire identity implementation in the same working tree.
The source manifest below identifies the exact combined local source; nothing was
pushed, queued or deployed during this audit.

## Defect and shared fix

Names were nested inside inline-flex containers with middle vertical alignment.
The enclosing dossier trigger added another inline block with a 24px minimum
height, while its default insignia was 26×28px. These independently sized boxes
shifted names relative to adjacent text, isolated whole names from paragraph
wrapping, and inflated individual lines. The compact report variant supplied
another flex wrapper instead of fixing that shared text contract.

Names now use normal inline formatting, inherited font metrics and baseline links.
Actual whitespace separates metadata. Only decorative marks have atomic dimensions;
inline insignias are one em, and supporter badges are capped at 16px. The leading
mark and trailing badge each stay with the adjacent complete Unicode grapheme,
without making the entire name unbreakable. Combining accents and joined emoji
are preserved. Optional badge buttons retain their keyboard/touch targets outside
the paragraph line box. Existing insignia editor sizes are unchanged.

The orb caption had a related text-layout defect: its typewriter animation changed
box width and rewrapped partial words into a column. Its reveal now uses clipping
on a fixed text box. The existing startup test samples its dimensions at five
animation times and requires identical width/height throughout.

The compact-name variant was removed. Report target names no longer introduce a
flex text wrapper. Galaxy's separate identity/status items and the dossier's
alliance/tag line align on their first text baseline. Independent controls and
portrait blocks continue to own their appropriate row layout.

The `/identity-playground` dev-only page uses the real components and immutable
fixture observations; it is not a substitute implementation. The UI guide now
records this shared text-layout contract.

## Complete call-site inventory

Audited 31 `PlayerName` usages in 19 files and eight `SupporterIdentity` usages
in four additional files, including the existing supporter-preview page. The new
development harness is excluded from these counts.

| Context | Files inspected | Layout decision |
| --- | --- | --- |
| Empire profile and dossier | `features/empire-history/profile-page.tsx`, `features/player-profile.tsx` | Titles/names share text metrics; portrait remains separate; alliance line uses baseline alignment |
| Shared name composition and preview | `features/player-name.tsx`, `features/supporter-preview.tsx` | One inline implementation for marks, name, badge, bot label and alliance tag |
| Empire overview and arrivals | `features/empire-overview.tsx`, `features/incoming-fleet.tsx`, `features/missile-flight.tsx` | Names flow inside “From …” sentences and inherit compact paragraph metrics |
| Galaxy and rankings | `features/galaxy.tsx`, `features/high-scores.tsx` | Names wrap within their columns; independent status controls use baseline alignment |
| Combat and observation reports | `features/combat-report.tsx`, `features/report-observation.tsx` | Shared inline names in headings, summaries and paragraphs; obsolete target-name flex wrapper removed |
| Fleet interaction | `features/missions.tsx`, `features/dispatch-review.tsx`, `features/attack-groups.tsx`, `features/alliance-depot.tsx` | Shared names inherit row or paragraph typography; existing independent action layout retained |
| Alliance community | `features/alliances/administration.tsx`, `features/alliances/board.tsx` | Member headings, applications, audit entries and notice authors use shared inline names |
| Messages and contacts | `features/social/screen.tsx`, `features/social/conversation-list.tsx` | Conversation headings, contact rows and circular “From …” text share the fix; noninteractive names stay safe inside buttons |
| HUD, account and settings | `features/command-hud/hud-enemy-attacks.tsx`, `features/menu.tsx`, `features/settings.tsx`, `shell/navigation.tsx` | Same typography in compact labels; existing account/row interaction targets remain independent |

The paths in this table are relative to `apps/web/src/`. Plain username strings
already use normal text layout and need no alignment wrapper. No screen-specific
pixel offsets or duplicate player-name components were introduced.

## Verification

The three typography browser cases run at 1440×1000, 390×1000 and 320×1000. They
measure glyph positions, not just screenshots: each line advances by the declared
line height (tolerance 0.15px); same-size text has no extra baseline offset. They
also check horizontal bounds, keyboard dossier access/dismissal/focus restoration,
linked profile destinations, and supporter badge keyboard explanations.

Coverage includes plain and all supporter tiers, decorative insignias, bot labels,
alliance tags, short names, multiword names, long unbroken names, multilingual
names, headings, narrow rows, noninteractive names and 12px/16px/24px text. Seven
unit cases independently verify edge-grapheme handling, including combined
accents and a joined emoji sequence. The existing rankings alignment assertion
was deliberately changed from visual center equality to precise text baseline
equality; containment, readability and interaction assertions were retained.

Final validation:

- All 1,395 client tests passed in 5.66s. After clarifying the explicit Unicode
  fixtures, their focused seven-case run passed again.
- Typography browser cases: 3 passed, 1.9s execution, approximately 1.9s module
  preparation. They passed again after the dossier alliance baseline correction.
- Integration selection: 10 passed, 11.9s execution and 1.857s module preparation:
  desktop/mobile identity editing, dossier/orb, Galaxy alliance identity, rankings,
  observation report wrapping, and message layout/composer flows.
- Existing report case passed again in 5.3s while capturing the actual report
  owner/header. Screenshot-only navigation is gated behind the capture flag and
  restores the prior scroll position.
- After the orb reveal correction, the caption lifecycle and rankings cases passed;
  the startup case passed after its measurement helper was corrected (1.8s test,
  2.7s browser runner, 1.954s preparation). In total, 15 distinct browser cases
  covering this follow-up passed.
- TypeScript, ESLint, Prettier and production web build passed. Vite client build
  5.25s; SSR 0.348s. The existing chunk-size/router warnings remain.
- No Rust or database behavior changed in this follow-up; prior backend validation
  remains recorded in `empire-identity.md`.

The first final formatting check caught the new UI-guide table formatting; Prettier
normalized it and the check passed.

All runners were local; remote queue wait and merge delay are not applicable.
The existing dependency installation was reused. Overall wall time was not separately
instrumented. No routine execution deadlines, sleeps or retry increases were added.

### Removed test and retained coverage

One newly authored extra case, `report owner text wraps beside its planet without
changing line spacing`, failed during fixture preparation: its dynamic JSON import
omitted Node's required JSON attribute. Its single repair used the repository's
existing static JSON import pattern. It then failed because the new route pattern
also intercepted the HTML report URL and tried to parse the document's nonexistent
POST body. In accordance with the one-repair rule, that additional case was removed
outright rather than patched or renamed. Both failed attempts are recorded here.
The test had no earlier history. Existing report test history and the available
profile verification/Test Czar notes were checked; no separate repair ledger was
present. A search found no remaining callers using that new broad report pattern.

The new animation measurement initially searched for the literal CSS animation
name `typeCaption`, but CSS Modules scopes that name. After inspecting the failure
and test history, its single repair samples all active text animations, retaining
the existing five-time dimension assertion. The case then passed. No timing limits
were changed.

The existing report integration case, the three shared typography cases, the
rankings baseline/containment case and deterministic Unicode coverage remain.
Actual report/header screenshots were obtained through the existing correctly
API-scoped report fixture. Its behavior assertions were not weakened or replaced.

## Visual evidence and cleanup

Inspected current desktop/mobile short labels, headings, paragraphs, narrow rows,
profiles, dossiers, rankings, Galaxy, report headers and message threads. Evidence
uses illustrative fixture data. Labelled contact sheets identify the screen and
viewport; excerpts crop original running screenshots without reconstructing UI.
Current captures are delivered inline in the implementation chat.

The dedicated Vite preview on port 5187 was stopped. Browser runners cleanly closed
their own Vite servers and browsers. No database or production service was used for
this follow-up. Logs and images remain in ignored local `test-results` storage.

Combined source SHA-256, excluding this verification record: `c48ea19f065134f4c18031c59c896c4a023cd621be3b3036a077afe017d0d459`.
Per-file manifest: `test-results/player-identity-verification/source.json`.
