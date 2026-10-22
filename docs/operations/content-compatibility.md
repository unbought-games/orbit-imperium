# Content update compatibility audit

Audited from production source `bc295c37a7bf7954d267e946ea720abcfdb8b3a2` after the
October 22, 2026 espionage incident. This audit covers content vocabulary and
response validation across game snapshots, bootstrap, reports, commands, saved
attempts, updates, and rules activation. It is not a certification of every
possible future schema or gameplay change.

## Incident and confirmed defects

The 22:26:11 UTC espionage observation was stored with its authorized recipient.
Its research section revealed `ImpulseDrive` and `Astrophysics`. Previous spy
reports had not revealed research. The fleet completed its return. The client
rejected the valid observation because `EspionagePayload4.research` independently
listed only the seven original research IDs and prohibited additional keys.
The UI caught the resulting validation exception and incorrectly suggested an
access or connection problem. Restarting the app loaded the same incompatible
contract, so it could not help. The saved observation needs no data repair.

| Surface | Audit result | Resolution |
| --- | --- | --- |
| Revealed espionage research | Active failure after additive research activation, even at level zero | Shared `ResearchLevels3`, using the complete `ResearchId3` vocabulary |
| Revealed espionage buildings | Same duplicated ten-building map | Shared `BuildingLevels3` |
| Protocol 3/4 overview buildings, including embedded/network bootstrap | Same duplicated map could reject the whole game snapshot | Same `BuildingLevels3`; tested through both overview and bootstrap validators |
| Combat fire totals | Schema allows wide decimal counters; client recursively applied an unrelated signed-64 limit | Validate each field using its schema; preserve historical combined and newer attributed rounds |
| Numeric public names and other text | The same recursive quantity check could reject legitimate text | Do not reinterpret arbitrary strings as quantities |
| Slot, stream, and saved-intent revisions | Previously relied on the recursive bound despite declaring an unbounded digit pattern | Reference `Decimal` explicitly, retaining signed-64 overflow rejection |
| Report failures | Validation, missing access, expired sessions, and transient errors shared one misleading message | Typed contract failure with explicit reload; preserve retry for transient errors and distinct access messages |

The expanded building-map defect is latent: the audited engine still rejects
activation of building definitions outside `Building::MVP`. Accepting supported
wire IDs does not enable those buildings or bypass the engine's content checks.

## Other paths inspected

- Modern catalogs, requirements, inventory, construction, research, manufacturing,
  fleet manifests/quotes, incoming ships, combat units and saved protocol 3/4
  commands already reference the shared content ID schemas. Tests now exercise
  every supported ID, including disabled catalog entries, and compare the actual
  Rust Serde vocabulary with OpenAPI. Mission, mission-leg and rejection enums
  are checked for drift too.
- Protocol 1/2 building/ship/research subsets are intentional frozen contracts.
  Their commands and stored attempts must not silently acquire later semantics.
- The server sends the selected rules' complete level maps. Rules activation
  initializes new entries at zero, preserves existing definitions and leaves
  historical JSON observations intact. Making a newly supported key mandatory
  in an old report would therefore be another bug. Shared maps retain baseline
  requirements but make later keys optional.
- Historical combined combat rounds and newer per-origin firing observations
  have separate valid shapes. Both remain accepted; mixed or malformed shapes
  remain rejected. Combat rendering already uses `BigInt`.
- Current report persistence stores recipient-specific JSON; reading does not
  deserialize it into today's narrower combat/espionage model. Authorization
  remains checked before the payload is returned. Unknown payload variants are
  still rejected by the client and now receive an honest compatibility error.
- Rules changes preserve topology, speed and protocol family. Retained client
  settings supply those fixed topology bounds; the current view supplies the
  catalog, levels and profile hash. Unsupported engine vocabulary and incompatible
  replay/schema versions still fail closed. Backward-incompatible runtime or
  persistence changes need their own migration/compatibility work.
- Entry HTML and API reads use `no-store`; Vite emits hashed JavaScript assets.
  No service worker caches reports. The game does not persist authoritative
  reports or snapshots in browser storage. Saved command attempts are versioned
  and binding-scoped. Page restoration revalidates the session. Clearing storage
  cannot fix a contract shipped incorrectly in the current build.

## Preventing recurrence

`make check` runs the following safeguards as part of existing routine suites:

1. A Rust test extracts Serde's actual enum vocabulary, including variants not
   enabled by bundled rules, and compares it with the shared OpenAPI IDs.
2. Tooling rejects newly copied content enums or fixed level maps outside the
   deliberately frozen legacy contracts. It checks the complete catalog against
   the same shared vocabulary. Generated TypeScript drift remains checked.
3. An actual engine espionage mission after additive research activation produces
   `contracts/fixtures/espionage-expanded.json`. The Rust test compares its output
   with this fixture; client tests validate that exact observation. This is a
   synthetic deterministic fixture, not exported production player data.
4. Client coverage includes current/expanded/historical observations, all known
   content IDs, both snapshot protocols and bootstrap, invalid levels and unknown
   IDs, wide combat counters, numeric text, and bounded resource/revision values.

`make test-ui` also covers mobile report navigation and reload, historical
unrevealed sections, expanded overview buildings, compatibility-error reload,
and recovery from a transient report failure. These are fixture browser tests;
the explicit full-system suites have not been promoted into routine CI.

For future additions, update the shared vocabulary alongside the engine, preserve
historical readers, regenerate TypeScript with `npm run contracts`, and extend
producer/consumer coverage for any new shape. Deploy compatible readers before
activating rules as described in [Rules updates](rules-updates.md). Already-open
tabs still execute their loaded JavaScript: genuinely new wire variants may need
a reload after deployment. These changes do not make arbitrary future protocol
shapes compatible or automatically reload a player's session.
