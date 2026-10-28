# World management

The production `orbit` binary includes `world` commands. They connect directly to PostgreSQL using `DATABASE_URL`; use `--universe UUID` or `ORBIT_UNIVERSE_ID` when the database contains more than one universe. Database access is the authority; no additional admin account or HTTP endpoint is required.

In a checkout, `./orbit` builds the normal binary when needed and supplies this worktree's local database connection. Explicit `DATABASE_URL` takes precedence and never falls back after a connection failure.

```sh
make dev
./orbit world show --user user
./orbit world set ships 1:50:8 cruiser=100 --user user
./orbit world set research rival astrophysics=15
./orbit world set resources --user user --all-planets metal=1000000
./orbit world add planet --owner user --planet 1:58:8 --name Colony
./orbit world add bot --name neighbor --near 1:58:8 --preset strong
./orbit world attack 1:50:8 --from 1:49:7 --arrives-in 30s
./orbit world queue 1:50:8 building metalmine=13 --arrives-in 2m
./orbit world finish queues 1:50:8
./orbit world clear queues 1:50:8
./orbit world message user --from trader --text 'Fleet approaching'
./orbit world report user --kind espionage
./orbit world scenario apply edits.json
./orbit world scenario save experiment
./orbit world scenario load experiment --replace
make dev-reset
```

Planet names are labels. Select planets only by galaxy:system:position; select players by username. On fleet commands, optional `--user` selects the sender and checks ownership of `--from`, not the destination. Catalog names are case-insensitive. `show` lists coordinates, owners, catalog vocabulary, and queues. Output is JSON for scripts and agents.

Edits bypass gameplay payment and waiting but maintain the game records together. Creating queues grants the paid work; cancellation refunds their recorded value. Missions consume the selected stationed ships and cargo, carry their existing valuation, and run through ordinary arrival/combat/return processing; the operator may override timing. Report examples do not alter inventories or battle outcomes. `set` changes only listed items. `give` adds to existing amounts. Editing an active building or research operation requires finishing or clearing it first.

Commands can run while a matching-version server is serving. A shared transaction gate coordinates mutations; each edit briefly holds it exclusively across all database worlds. Worker calculations are fenced and retried against the new facts. Due gameplay is processed before a patch. Replacement is explicit and rotates the selected world's epoch. Connected clients receive the normal invalidation signals. Apply the world-management release to serving processes before using its online editing commands; older binaries do not participate in the gate.

A command generates an operation ID. Supply `--operation-id UUID` when retrying an action after an uncertain result; the same ID and request return the original result. Reusing the ID for a different request fails. A new event command intentionally creates another event.

See [scenario authoring](../../scenarios/README.md) for JSON batches, save/load semantics, credentials, and exported source facts. Existing worlds keep their active rules; use `orbit rules` explicitly to change retained-world rules. The playground uses the current bundled standard rules when created or reset.

`dev-seed` and the old binary `dev-reset` commands are retired. Historical foundation fixtures are available only through test-support commands, not through development startup.
