# Moon destruction missions

Select a hostile moon in Galaxy or Dispatch and send a Destroy Moon mission with
at least one Dreadnought. Mobile escorts from the same empire may join the fleet.
Normal hostile launch protections, fleet slots, travel speed, fuel and recall
apply. A destruction fleet flies independently of alliance attack groups.

At the moon, the fleet fights stationed ships, defenses and allied fleets still
holding there. An attacker victory earns the usual loot. If a Dreadnought
survives the victory, two independent checks follow. For a moon of diameter
`d` km and `n` surviving Dreadnoughts, the chance of losing the moon is
`(100 − √d) × √n` percent. The chance of losing the attacking fleet is
`√d / 2` percent. Each probability is capped at 100% and rounded down to one
part per million. Losing the fleet consumes all escorts and cargo, including
loot. Only ordinary combat losses contribute debris.

## Flight commitments after destruction

| Flight | Outcome |
| --- | --- |
| Any active fleet launched from the moon | Returns to the parent planet under the original travel terms. |
| Deployment, transport or allied hold headed for the moon | Arrives at the same owner's parent planet at the scheduled time. |
| Attack, group attack, espionage or another destruction wave headed for the moon | Reaches the missing moon and returns on schedule. |
| Interplanetary missiles headed for the moon | Reach the missing target without using parent interceptors. |

The parent receives returning ships and cargo. The moon's buildings, remaining
local assets and unfinished paid jobs are lost. A replacement moon has a new
identity. A paid phalanx scan observes the effective planet endpoints where
the mission permits it. A voluntarily recalled deployment stays hidden.

## Universe activation

Update API, workers, web client and operator CLI together before applying the
standard rules upgrade. Use `orbit rules upgrade --dry-run --universe UUID`,
review the diff, then run `orbit rules upgrade --universe UUID` and
`orbit audit --universe UUID`. Standard bundle 0.19.0 enables the
`world.moon_destruction` profile `moon-destruction-v1`. Older rules keep their
original hashes and behavior. To close new launches, remove that profile
through a forward rules update. Already accepted missions settle on their terms.
Keep binaries capable of reading their reports and destruction records.

To exercise creation, dispatch, destruction, restart and flight settlement in
a disposable test universe, start the isolated test database and run
`make test-explicit SUITE=moon-destruction`.
