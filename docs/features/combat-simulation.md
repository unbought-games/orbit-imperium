# Espionage report combat simulation

An explicit **Simulate combat** action opens an editable draft from the player's
report-visible espionage snapshot. Forces and combat technology retain their
observation time; no target lookup occurs. Known empty sections mean zero, while
unknown sections remain blank until the player enters assumptions or explicitly
assumes zero. Edits are separate from report facts. Own technology defaults come
from the existing game view; attacking ship counts start at zero.

The authenticated, CSRF-protected `POST /api/v4/universes/{universe}/combat-simulation`
endpoint accepts a bound context and two hypothetical forces. It validates the
binding/epoch, takes combat rules from that universe's current rules artifact,
and invokes `orbit_engine::resolve_battle` ten times. Fresh simulation randomness
has no connection to the universe's secret random stream. It does not admit a
command, mutate gameplay, consult target facts, or return player/body identifiers
from a battle. It is available to every protocol-4 player.

The initial interactive service supports 2,000 total units and technology 0–100,
with two CPU workers and no unbounded queue. Excess values are rejected, never
clamped. Empty known defenses are supported. Results are sample outcomes and mean
survivors before repairs; they exclude missiles, repair rolls, debris recovery,
loot and fuel. Scope changes or input edits invalidate results. Large actual
fleets can be explored only by explicitly editing the scenario, not by quietly
scaling down a report.

## Community simulator investigation

On 2026-10-25, the published Orbit Combat Desk page and its `app.mjs` module at
https://orbit-combat-desk.brian-making-things.chatgpt.site/ were inspected. Its
form creates defender values as zero, reads only attacker technology from local
storage, and has no URL/message/file import handler. Its page explicitly says
its OGame-style model may differ from Orbit Imperium. An ordinary external link
would lose the report data, and undocumented URL parameters would not work.
The native integration therefore reuses the game's combat implementation rather
than copying or modifying that independently owned simulator.

Coverage includes pure visibility/mapping and input validation tests, Rust engine
reuse with custom rule statistics, an authenticated HTTP integration test, and
fixture browser tests covering prefill, explicit unknown assumptions, request
contents, result invalidation, mobile widths and Escape/focus restoration.
