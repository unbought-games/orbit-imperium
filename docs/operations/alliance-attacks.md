# Alliance attacks

Alliance attacks coordinate up to five players and sixteen active attacking
fleets against one target. Each fleet belongs to its sender, consumes an ordinary
fleet slot, pays its own fuel and keeps its original travel commitment. Alliance
membership, friendship and Alliance Depot are not prerequisites. Invitations
respect social blocks; a group never overrides attack protection or vacation.

## Player workflow

Launch an Attack, then choose **Create attack group** on its fleet card. Use
**Invite players** to search the universe's players. Invited players see the group
in Fleets and an invitation link in the fleet HUD. **Join attack** opens Dispatch
with the group and target selected. Review fuel, cargo and shared arrival before
launching. Invitations reserve neither ships nor fleet slots. Revoking an
invitation stops future joins without removing a fleet already sent.

The initiator controls invitations; each sender controls their own recalls.
Participants see the committed group composition and shared arrival. Other
players' cargo, fuel, research, return journeys and unrelated fleets remain
private. Only the organizer sees the invitation list. Defender incoming views
retain the ordinary espionage-dependent ship disclosure.

## Timing and combat

At join time T, with shared arrival A and independent flight duration D, joining
requires T < A and `10 * D <= 13 * (A - T)`. New arrival is `max(A, T + D)`.
Each join uses the current remaining time; repeated legal joins can compound the
delay. Faster fleets wait. Existing fleets pay no additional synchronization fuel.
The shared deadline is committed on the group; fleet views derive their effective
arrival from it rather than storing duplicate synchronized deadlines.

Recall never accelerates the remaining group. Recalling the initiating fleet
permanently closes joining, even if that player has other group fleets. Recalling
every fleet cancels the group event. Before contact, recall returns at
`recall_time + (recall_time - launch_time)`, including synchronization delays,
without a cap or fuel refund. A zero-elapsed recall completes inline. At the
arrival deadline, due combat precedes commands, so joining or recalling is too late.

One group event resolves all then-active attackers against the target and its
present held defenders. Independent simultaneous attacks remain separate battles.
Each owner uses their own combat technology at contact. Cargo survival is
calculated per fleet. Victorious attackers pool free capacity for one raid, debit
the target once and distribute whole-unit loot using the existing deterministic
residual-capacity allocator. Survivors return independently using their original
one-way duration. Held defenders keep their existing paid departure times.

Participating players receive one authorized report each, including their own
cargo losses and return fleets. If every attacker dies in the first round,
attacker-only recipients receive ContactLost; independent defender entitlement
still permits a full report. Historical participant locations remain snapshots.
Public report sharing excludes personal returns and private fleet identifiers.
The simulator accepts separate allied fleets and technology assumptions on both
sides, with its existing 2,000 combined-unit limit and independent randomness.

## Deployment and activation

Deploy compatible API, workers, operator binary and frontend before activation.
Migration 0029 adds group source records and lookup indexes. Standard bundle
0.15.0 enables the versioned `world.attack_groups: "oi-group-attack-v1"` profile
for fresh worlds. Existing universes retain saved rules until upgraded:

```sh
orbit rules upgrade --universe <uuid> --dry-run
orbit rules upgrade --universe <uuid>
orbit rules export --universe <uuid> --out rules-after.json
orbit audit --universe <uuid>
```

The dry run is read-only, repeated activation is a no-op, and customized content
still requires conflict review. Existing fleet terms, research, inventory, holding
and Depot payments are preserved. A forward rules update omitting the
`attack_groups` profile stops new groups, invitations and joins; accepted groups
still resolve and may be recalled. Keep a compatible binary until all commitments
finish. An old binary cannot understand the new commands and group events.

Scheduler dependencies include attackers, target, held defenders and invitation
recipients. Membership changes extend pending dependencies under the existing
social lock and ordered player/location gates. Revisions protect quotes; stale
events and exact retries cannot create a second battle or payment. Audit checks
membership, limits, the unique current group event and absence of active solo
arrival events for grouped members. Scenario export refuses active groups rather
than silently converting them to independent raids. Database backups preserve them.

Focused validation uses `make _db-attack_groups`, the engine mission tests,
application simulation/projection tests and `npm run test:ui -- alliance-attacks.spec.ts`.
Existing holding, rules-update, migration, bot, report and simulator suites remain
regression coverage. No new routine full-system job or execution deadline is added.
