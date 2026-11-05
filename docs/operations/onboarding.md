# Opening chapters

The versioned `colony-opening-v1` program recognizes new ordinary building,
research, manufacturing, attack and raid-delivery accomplishments. Grants are
once-only, automatic, and delivered to the empire's homeworld. Raid loot remains
physical fleet cargo. There is no claim bank or reward for changing presentation.

## Activation

Fresh and existing worlds keep this feature disabled until explicitly activated.
Deploy a binary containing the complete objective/site/fleet/tutorial consumers
and the player UI to **every** API and worker replica. Stop all processes using
this database, then run the upgraded server binary:

```sh
orbit tutorial activate --universe UUID --all-binaries-ready
```

Use the same `DATABASE_URL` configuration as ordinary operator commands. The flag
attests that all binaries are upgraded; the exclusive database server guard refuses
activation while any serving process is running. The command validates the program,
site definitions and worst-case safety of the authored encounters under current
combat rules. It enrolls existing empires in full-interface presentation, expands
all accepted pending work with required homeworld and site scopes, invalidates
old claims, and enables grants/site execution in one transaction. A failure rolls
back the entire change. No pending input is deleted or recreated. Repeating a
successful activation preserves every enrollment/preference/receipt and reports
zero newly enrolled existing empires. Resume only upgraded processes after success.

No old gameplay history is replayed. Enrollment uses the activation ordering/time
boundary; pending future completions still qualify. Previously elapsed logical
activity does not gain retrospective grants. New human signups then begin with
beginner presentation; existing empires and bots retain full interface. Machine
identity is derived from the bot registry, including later conversions.

The compatibility barrier is maintenance-only and database-wide because the
existing server guard covers the database. This command is not an online rolling
activation mechanism. Back up and follow normal deployment procedures; do not
restart an old binary after activation. No disable/reset/reward-replay operation
is provided by this command.

## Gameplay and support

The first chapters establish a productive economy, manufacture a real Light
Fighter and Small Cargo, demonstrate two near-orbital attacks and return/reinvest.
Guidance recommends Robotics 2 after a small functioning base, then Lab 1 and
Shipyard 2 while research and remaining economy construction overlap. Both 2x
and 3x use ordinary rates and flight durations. No gifted fleet, combat immunity,
replacement ship, speed multiplier or refund exists.

Personal sites issue lazily for humans in beginner presentation. Opening guidance
is an explicit ordered action; reading the tutorial is read-only. Full-interface
selection affects only presentation. It does not cancel orders, issue a grant,
create or retire a site. An equivalent ordinary player attack can satisfy lessons.
Once contact is experienced the first site retires; the second retires after
positive raid loot is loaded by surviving fighter and cargo ships. Its delivery
milestone still waits for return. A recalled pre-contact or nonqualifying sortie
retains the opportunity and its actual depleted stock/forces, without restoration.
Retirement hides new dispatch opportunities while retaining flights and reports.

Encounter safety is proven for the authored one-satellite content and the active
validated combat parameters at activation. Custom subsequent combat-rule changes
have normal consequences and require rechecking content; never imply guaranteed
wins for unsuitable fleets or arbitrary custom rules. Debris is retained locally
as report facts and is not collectible. Small Cargo collects stockpile loot.
