# World scenarios

`playground.json` is the editable default for `make dev`. `make dev-reset` restores it.

Use `./orbit world scenario apply edits.json` to apply a handwritten batch to the running local world. The entire batch commits or rolls back together. Use `./orbit world scenario save my-world` to save a recipe under `scenarios/`, and `./orbit world scenario load my-world --replace` to restore it. `load` without `--replace` only creates an absent world.

```json
{
  "version": 1,
  "edits": [
    {"op": "set", "user": "user", "planet": "1:50:8", "ships": {"CRUISER": 100}},
    {"op": "set", "user": "rival", "research": {"astrophysics": 15}},
    {"op": "spy", "planet": "1:49:4", "from": "1:50:8", "arrives_in": "30s"}
  ]
}
```

Planets are always coordinates. Users are usernames in the selected universe. On a planet edit, `user` asserts ownership. `all_planets: true` requires a user and cannot accompany planet coordinates. `set` assigns absolute values; `give` adds. Resource amounts are whole game units. Catalog identifiers and operation names are case-insensitive. Duplicate catalog spellings, including case variants, fail. Names, passwords, and message text retain their case.

Every command is represented by an edit: `set`, `give`, `add-player`, `add-bot`, `add-planet`, `queue`, `finish`, `clear`, `attack`, `spy`, `transport`, `debris`, `report`, `message`, and `alliance`. Run `./orbit world --help` for arguments. `queue` takes exactly one building/research next level or ship/defense quantity. `arrives_in` is a positive duration ending in `ms`, `s`, `m`, `h`, or `d`; for manufacturing it is the per-unit duration. `finish` and `clear` operate on queues at a planet or across an explicitly selected user.

The [schema](schema.json) describes the JSON structure. The tool resolves catalog identifiers against the active world's rules and applies the same operations as individual CLI commands.

Saved recipes include source asset valuations, retained rules, colony creation facts, and live activity. Fields such as `stock`, `valuation`, `colony`, and `paid_rules_hash` preserve source facts and normally need no manual editing. Report payload references use `$planet` coordinates, `$user` usernames, and `$time` offsets. Recipes are not database backups: replay recreates reports/messages for inspection rather than copying authentication sessions or internal transaction history. Unsupported inventory or mission types produce an export error rather than being silently dropped.

Export never includes passwords. Replacing an existing world preserves account credentials. To load into another database, provide a separate credential map with `--credentials credentials.json`, for example `{"user":"password"}`. Bots require no password. The default playground explicitly contains its documented local login.
