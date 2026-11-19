# Application journey gate

## Inventory at handoff

The historical collection at `a119915ffaeb881a7f54d65542478f4788bd4210` contains 1,183 application cases. Phase one at `0c235fd6d27422374abf61ea44e39c015a9c1675` collected 816 application cases, 271 isolated component cases, ten production homepage cases and 22 explicit browser cases. The historical and phase-one collections overlap. Read their dispositions by collection, project, file and full title ancestry. Keep the original IDs, including IDs for retired cases. [Frozen manifest and inventories](https://github.com/unbought-games/orbit-imperium/tree/16430828343977b9d78b22f8f4677ad9d36c7d15/docs/verification/e2e-migration/inventory)

The first seven domain handoffs cover every historical and phase-one ID assigned to those streams. A row-by-row comparison found identical ID sets and full title paths for each pair of frozen and landed ledgers. The numbers below count rows in those two different collections. Each handoff links its tests, replacements and failure evidence.

| Domain | Historical application | Phase-one application and component | Handoff |
| --- | ---: | ---: | --- |
| Resources and quotes | 124 | 108 | [#387](test-migration-resources.md) |
| Catalog and progression | 211 | 198 | [#406](test-migration-catalog-progression.md) |
| Dispatch and fleets | 241 | 219 | [#417](test-migration-dispatch-fleets.md) |
| Empire and settings | 66 | 69 | [#446](test-migration-empire-settings.md) |
| Shell and navigation | 246 | 206 | [#448](test-migration-shell-navigation.md) |
| Startup, HUD and tutorial | 150 | 144 | [#456](test-migration-startup-hud-tutorial.md) |
| Social and identity | 69 | 77 | [#461](test-migration-social-identity.md) |

On main `7449be126307cf788c2f47083922c73e70f582f4`, Playwright's unfiltered fixture collections returned 570 application and 531 isolated cases. Of 53 candidates recorded in #462, 52 still had the same native Playwright ID and full title. The remaining DM case lost its width-specific title in stream 07. Its successor still sends from the deep link, waits for the delivered thread and returns to conversations. The nine cases in `game-invitations.spec.ts` are separate from stream 07's two recruitment token cases. The interim selector now matches 55 journeys. Its two additional Dispatch cases exercise launch-time cargo changes and browser Back while a fresh quote is pending. The remaining 515 application cases are still required. [Interim candidate ledger](test-migration-journey-candidates.csv) · [Social case ledger](test-migration-social-identity/final-cases.csv)

The two restored-command cases in stream 01's ledger have historical dispositions. PR #445 changed recovery to in-memory only. One current production case holds a command while editing sliders. Reload discards unconfirmed recovery. Confirmed server state and durable user preferences still have separate reload contracts. The retired transition journal supplies no current acceptance contract.

## Repair and retirement history

The following limits travel with every successor. The domain ledgers retain individual IDs and earlier failures for the complete set. [Phase-one gap register](https://github.com/unbought-games/orbit-imperium/blob/16430828343977b9d78b22f8f4677ad9d36c7d15/docs/verification/e2e-migration/AUDIT.md#retirement-and-coverage-gap-register)

| Boundary | Specific remaining protection and loss |
| --- | --- |
| Resources | Mouse/keyboard and independent touch cases exercise real resource details. The combined tooltip replacement and modifier/new-tab energy link tour exhausted their repairs. The open-inspection navigation and delayed-accrual/503/HUD sequence also remain retired. [Resources](test-migration-resources.md) |
| Catalog and fleets | Representative ship submissions and engine checks cover orders. The Heavy Fighter acknowledgement and green-orb sequence, the chained alliance group recall tour, and both moon-popup reopening sequences remain retired. The generic selection model cannot exercise those native popups. [Catalog](test-migration-catalog-progression.md) · [Dispatch](test-migration-dispatch-fleets.md) |
| Empire | Four proposed component geometry replacements exhausted their shared sizing repair. Single-flight and long-manifest overflow, whole-page readable Empire views and desktop research-card geometry retain the healthy real-shell checks. Desktop vacation and rename-after-pruning retain their recorded gaps. [Empire](test-migration-empire-settings.md) |
| HUD and shell | Native mouse and keyboard toast interaction and deterministic swipe handling survive. Swiping then tapping the promoted card and the fourteen-launch tour remain retired. The held HTTP/reduced-motion refresh caption, full session rotation, deployment/reload and desktop quiet refusal sequences also remain retired. The empty-report geometry and unread Menu alignment each carry their measurement repair. [HUD](test-migration-startup-hud-tutorial.md) · [Shell](test-migration-shell-navigation.md) |
| Social | The actual board announces an expired cursor and renders fresh notices. The rankings page and open dossier have same-store identity-refresh evidence. The 301-second account-menu outage, Galaxy expiry/overflow, three-report focus/Escape, mobile Escape-to-search, recruitment template gallery and recruitment-to-enrollment document tours remain retired. [Social](test-migration-social-identity.md) |
| Server | Engine cases retain Terraformer field and energy rules, stored commitments and restart behavior. The exhausted two-runtime PostgreSQL playthrough that builds every prerequisite and verifies the final projection remains retired. [Database recurrence](jump-gates.md#pr-ci-recurrence-and-disposition) |

## Post-snapshot contracts

The personal invitation, Rewards and Jump Gate files added 17 application cases outside the original file manifest. At `7449be12`, 29 focused checks in seven files passed in 0.772 seconds of Vitest time. They exercised invitation return, sharing and delivery, reward controller authority and claim identity, automatic title presentation, and Jump Gate selection. Their passing results cover those boundaries only.

- The invitation path spans three owners. An anonymous visitor follows a native OIDC signup link with the original token as its return destination. An authenticated visitor enrolls in the bound universe before a real document replacement. The invitation-sharing form submits a selected universe and displays a selectable local link on clipboard denial. The entry and sharing models cannot verify the document replacement or that the live form consumed the selected universe. [Invitation verification](community-rewards.md#bound-universe-personal-invitation-redesign)
- Desktop Rewards entry activates an account menu item with Enter. Phone entry taps a link inside the Menu route. Claim confirmation, safe-default focus, permanent-claim feedback and unavailable/inactive views are separate from those two link owners. The automatic-title component has static summary and benefit checks. Showing a previously hidden title by expanding the actual disclosure requires mounted interaction. Its JSON fixture has already used its collection repair. [Automatic titles](automatic-renown-titles.md)
- Both Jump Gate widths currently send the same source moon, destination, ship counts and quote hash, then reload the source facility. The fixture assigns ready times on both moons. The application only observes the source gate cooling after reload. Engine `both_ends_share_cooldown_and_exact_boundary_survives_round_trip_and_upgrade` exercises both ends. The PostgreSQL race covers shared inventories and atomic cooldowns. [Jump Gate verification](jump-gates.md)

## Reliability before cutover

The November 18 retrospective found 61 first-attempt successes in 62 post-merge main workflows since phase one. Its single failed workflow had assertions in two broad-feature jobs. The domain handoffs preserve their subsequent retirements. This sample excludes earlier PR and queue failures. [Report and original sample](https://github.com/unbought-games/orbit-imperium/blob/16430828343977b9d78b22f8f4677ad9d36c7d15/docs/verification/e2e-migration/RELIABILITY-2026-11-18.md)

A second bounded sample took the latest 24 consecutive CI workflow runs through main `7449be12`, beginning with run 44388819601 and ending with 44421653131. All had attempt number 1. The period from first creation to last completion was November 18, 20:13:56–23:44:11 UTC. Grouping by workflow event keeps a canceled head, a failed queue check and an eventual successful main push visible separately.

| Event | Passed | Failed | Canceled |
| --- | ---: | ---: | ---: |
| Pull request | 5 | 2 | 2 |
| Merge group | 7 | 1 | 0 |
| Main push | 7 | 0 | 0 |

The two PR failures occurred in PostgreSQL checks on different heads. The queue failure was a runner dependency installation incident. APT could not locate the required font packages and Chromium setup exited 100 before journey assertions ran. PR #469's timeline records one removal for failed checks, a later re-entry and a successful merge. The exact number of removals outside that PR's inspected timeline is unknown. These pre-cutover runs establish neither a post-cutover failure rate nor a speed comparison. [First PostgreSQL failure](https://github.com/unbought-games/orbit-imperium/actions/runs/44394859906) · [Second PostgreSQL failure](https://github.com/unbought-games/orbit-imperium/actions/runs/44397065241) · [Runner setup failure](https://github.com/unbought-games/orbit-imperium/actions/runs/44395843626/job/135125474331) · [Queue history](https://github.com/unbought-games/orbit-imperium/pull/469)
