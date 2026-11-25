# Make fleet dispatch fast on the current server

We’re keeping the current EC2 instance and database size. The work is to make each game action cheaper. In one production window, a fleet took 19.53 seconds to launch after the server accepted it. Most of that time went to earlier actions in the same queue.

## What we’ll change

- **Remove historical ship batches.** Track how many ships of each type are at each location. Moving ships between a planet and a fleet leaves the owner’s score unchanged. Value completed assets at the universe’s catalog prices. Price changes normally apply to new universes. If we deliberately change prices mid-universe, recalculate scores using the new prices.
- **Shorten the launch transaction.** Read the facts needed for that launch and write only what changed. Sending ships should never rewrite buildings or unrelated inventory. Narrow the alliance lock to actions that depend on alliance relationships so unrelated transports can proceed independently.
- **Remove unnecessary queue turns.** Record the player’s activity with the order while preserving its effect on inactivity and protection. Wake the worker when work is ready and let it take the next eligible action immediately. Keep chronological order where two actions affect the same ships, planet, or battle.
- **Reduce manufacturing work.** Settle consecutive unit completions together when possible. If a battle or dispatch falls between two completions, it must see exactly the ships that were ready at that moment.
- **Fix Review and Send independently.** Prepare the quote as the player edits and reuse it while it’s valid. On Send, show immediate feedback. Once the server accepts the order, reset the form so the player can prepare another fleet. Show “Fleet dispatched” when launch is confirmed, even if an overview refresh is still running. A failed order must be recoverable without overwriting the next draft.
- **Cut idle database traffic.** Wake connected clients when their game changes. Keep a lightweight fallback for missed updates and reconnects. An idle tab should do very little work.

## What done looks like

| Player action | Acceptance |
| --- | --- |
| Click Review on an unchanged draft with a valid quote | Review is ready to send within 100 ms, with no repeat quote request. |
| Send a valid foreground dispatch | The API returns durable acceptance within 250 ms for at least 99% of eligible requests. |
| Click Send and see the fleet launch | At least 99% of eligible foreground dispatches show launch confirmation within one second of the click. |

Verify these on the current infrastructure during busy play, including when fleets arrive and ships finish building. Measure API acceptance and visible confirmation separately, and report rejected or uncertain orders alongside the timings. Local benchmarks help choose fixes. Production measurements tell us when we’re done.
