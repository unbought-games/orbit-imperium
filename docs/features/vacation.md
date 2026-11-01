# Vacation mode

Vacation belongs to one empire in one universe. Settings provides the entry
review, current blockers and earliest exit time. Players may leave manually after
48 real-time hours; universe speed never shortens that minimum. There is no
maximum stay, automatic exit, fee or additional exit cooldown.

Entry requires all owned outbound, returning and holding fleets and missiles to
finish, all construction/research/manufacturing (including paid future batches)
to finish or be canceled through their ordinary controls, and foreign fleets
currently holding at owned bodies to depart. Nothing is automatically recalled,
refunded or paused. The preview is advisory; the engine rechecks complete source
facts in canonical order at commitment.

Already-launched foreign missions do not block entry or lose authorization.
Attacks can still loot stored resources. An allied hold already inbound may arrive
and complete its prepaid stay; new missions, alliance attack joins and Depot
extensions cannot bypass vacation protection. Other players may harvest unowned
debris at the same coordinates.

While away, ordinary fleet and economic commands are blocked. Authorized views,
messages, report controls, planet naming, account security, and empire deletion
request/cancellation remain available. The game shell keeps incoming attacks
visible alongside the vacation notice.

## Economy and source state

Player policy stores one active interval with its entry timestamp and policy
identity. The vacation flag, exit eligibility, entry blockers, production rates
and inactivity exemption are derived. Entry and exit settle every owned body at
their ordered timestamps and signal body activity. Historical intervals remain in
the ordinary transition journal.

Production settings remain unchanged. Vacation produces only the body's base
income under the current universe economy speed (zero on moons); mines, energy
producers and fusion fuel consumption stop. Storage caps and fractional carry
retain ordinary settlement rules. Exit resumes saved settings on currently
existing bodies with no retroactive mine income. Rules and speed cutovers use the
same vacation-aware settlement. Operator edits settle before applying resource
or policy changes, including combined edits.

Operator edits are raw source edits, not foreground player actions. Clearing
`vacation` alone preserves the existing activity age and can make an already
overdue empire eligible for cleanup at the next safe ordered instant. To restore
an empire with a fresh inactivity window, explicitly set `activity: "active"`
(or `presence_age_ms: 0`) together with `vacation: false`. Policy edits reconcile
the scheduler with the resulting source deadline; an explicit deletion request
keeps its original deadline. Saved/exported activity ages are not overwritten.

## Cleanup integration

The shared player policy exempts vacationing empires from automatic inactivity
cleanup, even when a previously scheduled deletion check wakes. A voluntary
seven-day deletion request retains its deadline during vacation, and its request
and cancel controls remain available. Vacation does not disqualify a member from
automatic alliance succession.

Entry and exit use the existing paired foreground-presence admission. On return,
the current presence timestamp drives the next 28-day warning and 35-day deletion
check. Exit replaces the live check through the existing scheduler, preventing an
old vacation-period timer from delaying the warning. There is no separate stored
automatic-deletion status. Due events precede commands at the same timestamp, so
entry or cancellation cannot rescue an empire already due for removal.

## API and compatibility

Authenticated protocol-4 commands add `EnterVacation` and `ExitVacation`. The own
view includes `vacation` with `active`, `entered_at`, `earliest_exit_at` and private
`blockers`. Actor and target checks apply equally to browser and machine commands.
The public `/api/public/v1/` player and planet feeds still expose neither vacation
nor inactivity status. Opponents receive the existing Galaxy flag and ordinary
mission rejection reasons, never private entry blockers or exit timestamps.

Deploy all API and worker processes together. Older workers cannot interpret the
new interval or command variants. Migration 0031 preserves historical journals
and converts any existing `true` operator flag to an interval beginning at the
migration boundary, with a new 48-hour minimum. It preserves protection and
production settings. Settlement splits older checkpoints at that boundary so
pre-upgrade mine production is retained. Existing `false` values remain readable;
new exits serialize the same inactive form. Do not run older binaries against the
upgraded state; rollback requires its matching database backup.
