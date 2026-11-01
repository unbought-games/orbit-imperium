# Empire deletion and inactivity cleanup

Deletion removes one empire from its current universe. It does not delete the
Unbought Games account, its credentials, account-level customization library, or
empires in other universes. The player can enroll again with a new player ID and a
new homeworld ID; vacant positions can be reused, and historical records never
attach to that new empire. Local-account reenrollment uses the configured
universe and its existing signup policy.

## Voluntary deletion

Settings provides an explicit review before requesting deletion. Requesting or
canceling requires a sign-in within the preceding five minutes. Rolling session
renewal does not refresh that authentication time. Exact retries of an already
admitted request retain their original receipt and do not require another sign-in.

The request records its accepted game timestamp. Removal is due exactly seven
real-time days later. Ordinary activity and new work remain available during the
grace period, but cannot extend its deadline. Signing in alone does not cancel a
voluntary request. Settings offers explicit cancellation before the deadline and
the game shell displays the scheduled removal date.

An alliance leader must transfer leadership or disband before requesting deletion.
Members pending deletion cannot create an alliance or receive leadership.

## Automatic cleanup

Inactivity continues to derive from the last qualifying foreground presence:

- Seven days: the existing inactive status and gameplay exemptions apply.
- 28 days: the empire enters the automatic seven-day grace period.
- 35 days: the empire is removed.

Qualifying foreground activity before removal resets presence and therefore
cancels automatic cleanup. The automatic notice in Settings offers **Keep my
empire**, which records ordinary foreground activity without requiring another
sign-in. Passive reads, sockets, incoming messages, fleet
contacts and production do not refresh presence. Vacation exempts an empire from
automatic cleanup, but does not cancel an explicit deletion request. These are
elapsed-time policies independent of universe speed.

The grace-period status is calculated from source facts; there is no separately
stored automatic pending flag. A durable scheduler event checks the current
source facts and either removes the empire or schedules its next check. The
28-day check publishes a private view update so connected clients show the grace
period notice. Each
player has one live check; normal activity does not enqueue a timer per gesture.
Workers adopt retained memberships missing a check at startup. Already overdue
empires become eligible at the next safe ordered instant; startup never inserts
a newly introduced event before already admitted work. Deploying this feature
therefore enables cleanup of retained empires already inactive for 35 days.
Use a coordinated worker upgrade: older workers do not understand the new deletion
events and request facts. Mixed-version workers are not supported for this feature.

## Hard deadline and fleet handling

At the deadline, removal is an atomic game transition, not a wait for fleets or
queues to finish. Due events precede commands at the same timestamp; cancellation
at the deadline is too late. Same-time events use the existing durable sequence.

- Destroy the player's planets, moons, stationed assets, resources, all owned
  fleets and their cargo, and owned missiles still in flight. Create no debris
  reward for empire cleanup.
- Cancel unfinished construction, manufacturing and research without refunds.
  Cancel their scheduled events and retain terminal history.
- Foreign fleets already holding at the removed bodies begin their normal return
  with surviving ships and cargo. Prepaid fuel is not refunded.
- Group attacks retain the original shared arrival for surviving foreign members.
  If removal leaves no outbound members, cancel the group arrival; losing its
  initiator closes new joins without recalling other owners' ships.
- Other foreign inbound flights retain their committed timing. A missing bound
  body causes failure and return; replacement colonies cannot inherit the target.
- Existing debris and other players' harvesting flights remain independent.
- Completed deliveries and battles are not reversed.

Remove the universe membership, alliance membership/applications, friendship and
block relationships. End bot participation and revoke its universe-bound tokens
when applicable. Keep stable player tombstones, historical reports, conversations,
receipts and audit facts under their existing retention rules. The account's
other sessions and universe memberships remain intact.

The existing scoped scheduler covers the deleting player's bodies, flights,
visiting holds and alliance members. New dependencies extend the future check in
the same transaction as their creation. Finalization shares the social subsystem
lock; leadership changes, memberships and source facts commit together. A retry
cannot repeat destruction, return a visiting fleet twice, or reassign leadership.

## Alliance succession on automatic removal

Exclude the removed leader and members pending deletion, draining, or removed.
Vacation does not disqualify a remaining member. Prefer members active within the
last seven days, then earliest current membership join time, then ascending stable
player UUID. If nobody is recently active, use the same tenure/UUID ordering among
all eligible members. Disband if none remain eligible. Selection occurs at removal
from current facts; do not store a provisional successor.

Successor nominations and associated settings/commands are deferred. Merely
becoming inactive or pending deletion does not transfer leadership.
