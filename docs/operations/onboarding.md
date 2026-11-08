# Opening chapters

The versioned `colony-opening-v1` program recognizes new ordinary building,
research, manufacturing, attack and raid-delivery accomplishments. Grants are
once-only, automatic, and delivered to the empire's homeworld. Raid loot remains
physical fleet cargo. There is no claim bank or reward for changing presentation.

## Deployment

Migration `0039_onboarding.sql` adds the objective, private-site and presentation
records and enrolls existing members with the final opening definition. It runs
through normal schema preparation; no activation command or rollout flag is needed.
Use the normal application restart so all serving code understands the new records.

Existing empires retain the full interface and begin with no earned directives.
The migration does not scan past activity, change balances or grant ships. New
ordinary completions satisfy the checklist, including upgrades above a target
level. Existing accepted orders retain their inputs and paid terms; the migration
adds their reward/site dependencies and fences attempts loaded before the upgrade.
New human signups start in beginner mode. Bots retain the full interface.

## Gameplay and support

The first chapters establish a productive economy, manufacture a real Light
Fighter and Small Cargo, demonstrate two near-orbital attacks and return/reinvest.
Guidance recommends Robotics 2 after a small functioning base, then Lab 2 and
Shipyard 2 while research and remaining economy construction overlap. Both 2x
and 3x use ordinary rates and flight durations. No gifted fleet, combat immunity,
replacement ship, speed multiplier or refund exists.

Personal sites issue lazily for humans in either presentation mode. Opening guidance
is an explicit ordered action; reading the tutorial is read-only. Full-interface
selection affects only presentation. It does not cancel orders, issue a grant,
create or retire a site. An equivalent ordinary player attack can satisfy lessons.
Once contact is experienced the first site retires; the second retires after
positive raid loot is loaded by surviving fighter and cargo ships. Its delivery
milestone still waits for return. A recalled pre-contact or nonqualifying sortie
retains the opportunity and its actual depleted stock/forces, without restoration.
Retirement hides new dispatch opportunities while retaining flights and reports.

Encounter safety is proven for the authored one-satellite content and the active
validated combat parameters in engine tests. Custom subsequent combat-rule changes
have normal consequences and require rechecking content; never imply guaranteed
wins for unsuitable fleets or arbitrary custom rules. Debris is retained locally
as report facts and is not collectible. Small Cargo collects stockpile loot.

## Energy-first opening

New enrollments use an energy-first colony chapter: Solar Plant 1, Metal Mine 1,
Crystal Mine 1, Metal Mine 2, Solar Plant 2, then a production-controls review
before Crystal Mine 2. Solar power and both mines then progress through levels 3 and 4 before the
existing fuel, infrastructure, and later economy milestones. There are 20 colony
directives and 31 across the complete briefing. Rewards are redistributed across
the additional building milestones; the total resource grants are unchanged.

With standard rules at full allocations, the first pair of mines uses all of
Solar Plant 1's power. Metal Mine 2 creates a 13.2 energy shortfall and 62.5%
production factor. Solar Plant 2 restores a 13.2 surplus and full output; Crystal
Mine 2 brings demand back to the supply. These are taught as consequences of
ordinary mechanics, not extra progression gates: players may build in other orders.

The resource-settings review awards 200 metal and 100 crystal and requires no allocation change.
After Solar Plant reaches level 2, the player can select
“Understood” in the advisor on resource settings. The authenticated, ordered
`ReviewProductionSettings` action records an explicit review fact and a once-only
receipt. Visiting a page, changing presentation, and reaching those levels alone
do not complete the review. The review remains accessible in the full interface.

The mid-colony power directive targets Solar Plant 5 immediately after Metal
Mine 4, followed by Deuterium Synthesizer 1 and 2, then Crystal Mine 4.

After Robotics Factory 2, the colony checklist ends with four targets in ascending
level order: Deuterium Synthesizer 5, Crystal Mine 6, Metal Mine 7, and Solar Plant 9.
The final setup has about 21 spare energy at full production under standard rules.

The fleet chapter now targets Research Lab 2 and Shipyard 2 before the first
Light Fighter. At 3× speed with Robotics Factory 2, sequential lab/yard
construction, Energy 1, Combustion 1, and one fighter take 25m16s instead of
31m12s, including both buildings from level 0 and excluding resource waits.
The later duplicate Shipyard 2 directive is removed and its reward is combined
into the fleet chapter's shipyard directive.

Personal encounters are discoverable as indented Galaxy rows at their orbital
coordinates: Tin Can Outpost and Magpie Depot. Briefing opens the site's Galaxy
popover before dispatch. The image/name/status and normal Actions button open
the same popover; blank row space is inert. Details show defenses, stockpile,
recommended fleet and Send fleet (preparation only), Follow fleet while busy,
or Completed after retirement. Sites remain private to their beneficiary.

Beginner presentation automatically ends when **Bring raid loot home** (`haul`)
has an authoritative completion receipt. Earlier unfinished directives and
Reinvest in your Metal Mine remain available with their normal rewards.
This is derived on each read, including existing saves; no preference update,
resource grant, or migration is needed. Loot loaded aboard a returning fleet
does not unlock the full interface until the haul directive is completed.
