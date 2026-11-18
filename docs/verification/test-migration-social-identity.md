# Social, alliances, recruitment and identity verification

Stream 07 began on main `03fd2a622acec3a99eda582c959d7783f274b87f`. The separately published audit uses snapshot `0c235fd6d27422374abf61ea44e39c015a9c1675` and pre-migration baseline `a119915ffaeb881a7f54d65542478f4788bd4210`. Its assignment is on `emick/test-migration-audit` at `0f68a762399cc6d7497230fb92137c2695613c69`. Implementation and fixture changes are in `e1691610f48755d461d8cc7fa07301c3fe0a4df8`. The handoff commit adds the ledgers and build note.

| Collection | Cases | What it records |
| --- | ---: | --- |
| [Historical application cases](test-migration-social-identity/baseline.csv) | 69 | Original ID, full title, exact replacement or retired protection |
| [Frozen application and component cases](test-migration-social-identity/current.csv) | 77 | All 49 application and 28 component dispositions, including the superseded notice composer |
| [Changes since the snapshot](test-migration-social-identity/delta.csv) | 108 | Snapshot to implementation base gained 24 identities, removed one and changed 34 cases in place. Implementation removed 29 identities and added 20, including renames and boundary moves. |
| [Final required cases](test-migration-social-identity/final-cases.csv) | 91 | 37 application and 54 isolated component cases. The implementation base had 59 and 41. |

The final normal Playwright application collection is exactly the disjoint union of five tagged journeys and 32 required feature cases. Each application row names its integration contract. New case IDs use a stream prefix and a hash of the boundary, file, project and full title. The original audit IDs are preserved. Collection and execution covered the eight owned application files, five original component files and two new prepared-view specs. Global gate selection remains with stream 10.

## Boundaries and observable behavior

- **Rankings and profile display.** A real Coordinator and player profile controller feed HighScoresScreen. The isolated view covers pagination without refetching, both ranking scopes, dialog and table focus, selection removal during a held refresh, keyboard access, text baselines and narrow-row containment. The shell still exercises browser Back with an open score dialog. A second running-screen test observes a bot become human after pageshow. The separate same-store component case keeps the original dossier open and verifies both DOM nodes remain connected.
- **Alliances and recruitment.** The real directory controller and view cover combined language/recruiting filters, paging reset, closed entries, empty results, clearing, focus outline, compact controls and overflow. Recruitment modes and form restrictions have deterministic and interactive coverage. Membership loss retains the actual 403-to-private-screen transition. The expired noticeboard cursor still drives its running-screen live region. Section history, recovered drafts, successful Create, and distinct normal/Join-welcome/Apply-welcome retries remain route tests. Retry assertions check the original ID and payload and the disabled pending form. A definitive rejection permits a fresh command.
- **Social.** Prepared MessagesView covers the held empty thread, first arrival, failed refresh, contact actions, safe Markdown, blocking, one-way circulars, draft/selection, geometry and scroll anchors. The real route retains read acknowledgement, five-second polling, incremental history after hiding, global Refresh and one submitted deep-linked message. Both widths still check Send visibility and full-document overflow. A component retry is driven by Retry messages, while the running page exercises its distinct Refresh control.
- **Emblem editor.** The real editor observes its InsigniaController. Fixed library responses exercise saved-but-unequipped designs, missing content and retained grants, member and unavailable states, grouped colors, shape controls, slots and remounts. The fixture uses a locally authored geometric mark. Full-page reloads at each edit and duplicate viewport-specific command sequences were removed. The route still exercises failed-save recovery, save-to-Galaxy propagation, equipment changes through the overview anchor and the actual persistent cache during a held refresh and reload.
- **Newer main behavior.** #386 and #390 replaced the old preview toggle and expanded the role, roster, audit, Hall and template controls. #394 introduced universe-bound invitations, including the distinct reward-return link. #414 preserves private subsection URLs. #416 removed the global success banner. #432 keeps the image header across live sections. #436 retains confirmed emblems until authoritative replacement. #444 added profile naming and the overview emblem anchor. #447 and #457 use the empire-owned library and separate ship controls. This migration changes test files only in the client tree. The ledger follows these current controls and the current Base UI overlays. No older journal or persisted pending-command fixture is introduced.

## Server evidence

The component ports supply observations or echo accepted writes. The following separately executed tests use actual permission rules, HTTP handlers or PostgreSQL.

| Invariant | Passing named coverage |
| --- | --- |
| Current authority, privacy and loss of membership | Engine `delegated_administration_needs_acting_and_grantable_authority`, `ordinary_officer_can_kick_member_but_not_act_after_revocation`, `post_authorship_requires_current_membership_and_pin_is_separate`. PostgreSQL `alliances::delegated_access_is_revoked_immediately_and_stale_authority_cannot_mutate`, `alliances::http_authentication_csrf_origin_scope_and_anonymous_privacy`, `player_profiles::public_profiles_are_view_scoped_private_and_independent_of_other_players_sessions`. |
| Atomic commands, replay and notice retention | `alliances::atomic_retries_races_privacy_history_and_revocation`, `alliances::accept_join_create_compete_and_withdraw_all_pending`, `alliances::board_is_bounded_pin_races_and_revision_bound_pages` and engine `noticeboard_rolls_oldest_unpinned_and_enforces_five_pins`. |
| Recruiting, private fields and token revocation | `alliances::recruitment_discovery_is_opt_in_filtered_and_never_exposes_private_fields`, `alliances::alliance_directory_combines_language_and_recruitment_without_hiding_closed_or_unlisted_groups`, `alliances::recruitment_invitation_rotation_is_atomic_idempotent_and_permission_scoped`, `alliances::recruitment_http_previews_use_current_public_identity_and_revoke_old_links`. |
| Message history, blocking and read state | `social::history_pages_retry_identity_privacy_and_retention`, `social::read_hide_and_new_messages_are_recipient_local`, `social::friends_explicit_accept_and_blocks_are_atomic`, `social::concurrent_send_and_block_have_serial_outcomes`, `social::transport_requires_auth_csrf_binding_and_valid_content`, `social::circular_permission_revocation_and_recipient_bound_paging`. |
| Identity revisions, grants and historical affiliation | `empire_history::empire_identity_enforces_ownership_revision_grants_and_retains_missing_selections`, `empire_history::identity_http_edit_and_public_read_negotiate_catalog_and_reject_invalid_text`, `insignias::insignia_library_storage_access_and_public_identity_work_together`, `alliance_identity::delayed_espionage_preserves_event_affiliation_through_rename_disband_and_sharing`. |
| Profile caching and expiry | HTTP `player_profiles::tests::reauthentication_invalidates_old_profiles_and_fences_in_flight_responses`, `caches_batches_expires_and_clears_removed_tiers_and_omissions`, `failures_expiry_and_rate_limit_never_extend_a_badge`. Client `keeps the last confirmed display through expiry and an outage` and `restores a cached display immediately and refreshes it without blanking` separately cover display retention. |

## Historical gaps and repair allowances

The [social component handoff](test-migration-social-components.md), [profile handoff](test-migration-shell-profiles.md) and [repair ledger](../runbooks/test-performance-audit.md) retain the original attempts. Moving a case preserves its repair history.

- The combined mobile authenticated filter case had already failed after its nested-list repair. Its exact Escape-to-search sequence remains retired. The desktop combined-filter test moved to the real directory view. Public mobile filter input, focus and empty results still run independently. [Alliance discovery](alliance-discovery.md)
- The Galaxy supporter tier/expiry tour and the repaired three-report identity tour remain retired. Shared badge semantics, tier colors, current identity, historical facts and response fencing remain covered. The old Galaxy-specific badge/overflow and three-report focus/Escape sequences remain gaps. The public redaction case was renamed to reflect its actual payload. Its old title also mentioned legacy reports, which that case never exercised.
- The 301-second account menu → Settings tour was retired after a superseded badge assertion and a stalled repaired 503 wait. The newer Galaxy cache test observes a new document while the profile response is held. The account-menu sequence and its post-poll thank-you copy remain uncovered. [Persistent emblems](persistent-player-emblems.md)
- The November 10 desktop/mobile template-gallery tests failed again after their selector repair. Their exact responsive tour remains retired. Current projection is covered by `public projection selects one template and excludes private Hall and inactive copy` and engine `template_switches_preserve_authored_content_and_reject_lossy_writes`. Public recruitment-to-enrollment document wiring retired in PR #360 also stays retired. The two current token-entry tests end at the constructed destination.
- The previously repaired recruitment mode case keeps its descendant’s actual directory-to-membership navigation. Closed/open state permutations moved to the recruit view. The old repeated document reload, with the same alliance changing modes, is no longer exercised. The expired board live announcement and mounted bot-to-human assertions both passed in the running application.

## Validation

One owner serialized browser runs, builds and full typechecks. Node 24.18.0, npm 11.16.0 and the pinned Rust 1.99.0 toolchain ran from the task checkout. The implementation base plus the recorded changes preceded the documentation commit.

| Local work | Result | Setup and execution |
| --- | --- | --- |
| Dependency installation | 303 packages | 3.02 s |
| Existing five component specs plus rankings, two workers | 48 passed | Bundle 3.865 s, runner 16.3 s |
| Prepared editor | Initial five passed, expanded six passed, final six passed with synchronous remount and two-width bounds | Bundles 3.821 / 4.084 / 4.332 s, runners 2.3 / 2.8 / 2.7 s |
| All eight owned application specs, two workers | 37 passed on first execution | Bundle 5.034 s, runner 28.1 s |
| Client models, adapters, controls, routes and report facts | 110 + 36 + 14 passed | Vitest 1.05 / 2.75 / 0.55 s |
| Engine alliance rules | 30 passed, 38 outside filter | Compile 11.12 s, execution 0.032 s |
| HTTP | 92 passed | Compile 26.50 s, execution 24.059 s |
| Seven PostgreSQL binaries, two concurrent binaries, serial within each | 33 passed | Compose readiness 2.74 s, compile 50.84 s, Make total 120.80 s including compile and DB management |
| `make _static`, formatting and diff checks | Passed | Static check 23.62 s |

The first component typecheck identified a synthetic insignia recipe whose version widened to `number`. The fixture now uses the contract’s literal version. Before any database assertion, Docker exhausted its default subnet pool during project creation (2.89 s). The native Compose project then used an unused explicit subnet and an allocated host port. The native runner dropped each disposable database. Compose removed its container, volume and network. Browser runners closed their servers, released ports and removed temporary bundles. No case was retired for a failure in this stream. No product UI changed.

## Handoff

03 keeps attack/depot integrations and the historical Galaxy expiry gap. 04 keeps Empire lifecycle, planet selection and the existing shared identity-link contracts. 05 keeps the shell, including the retired 301-second tour. 06’s expired-cursor handoff is fulfilled by the passing running board. 08 keeps report readers, sharing and the three-report retirement. Stream 07 retains only the public-redacted/public-identified routes and authenticated historical alliance-link wiring in its report spec. 09 owns shared browser infrastructure and explicit acceptance. This change only adds two lazy prepared scenes to the existing gallery. 10 can incorporate the final case ledger without changing required selections in other streams.

PR, merge-group and main CI each have their own revision and runner allocation. Local timings above exclude queue residence. The originating chat owns the remote checks and publishes their outcome after merge.
