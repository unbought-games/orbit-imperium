// Test setup only. No server route or production bootstrap imports this module.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

export function assertFixtureDatabase(name) {
  assert.match(
    name,
    /^orbit_(progression|missions|raiding)_[a-f0-9]{12}$/,
    'Prepared states require an isolated acceptance database',
  )
}
const buildings = {
  SolarPlant: 14,
  MetalMine: 12,
  CrystalMine: 10,
  DeuteriumSynthesizer: 8,
  RoboticsFactory: 2,
  ResearchLab: 6,
  Shipyard: 4,
}
const research = {
  EnergyTechnology: 3,
  CombustionDrive: 6,
  ShieldingTechnology: 2,
  EspionageTechnology: 2,
  ComputerTechnology: 1,
  WeaponsTechnology: 1,
  ArmourTechnology: 1,
}
const inventory = {
  SmallCargo: 1,
  LightFighter: 1,
  Recycler: 1,
  EspionageProbe: 1,
  RocketLauncher: 1,
  SmallShieldDome: 1,
}
const SCALE = 1_000_000
const sum = (values) => values.reduce((a, b) => a + b, 0)
// Fixture paid lineage uses the pinned rule artifact. Assertions still use real engine quotes.
function levelValue(base, growth, level) {
  const n = BigInt(growth[0]) ** BigInt(level - 1),
    d = BigInt(growth[1]) ** BigInt(level - 1)
  const value =
    sum(base.map((amount) => Number((BigInt(amount) * n) / d))) * SCALE
  assert.ok(Number.isSafeInteger(value))
  return value
}

/** Server must be stopped. Players not listed remain untouched starter accounts. */
export async function prepareProgression(client, universe, players) {
  const began = performance.now()
  assertFixtureDatabase(
    (await client.query('SELECT current_database() name')).rows[0].name,
  )
  assert.ok(
    players.length > 0 &&
      new Set(players.map((p) => p.player)).size === players.length,
  )
  await client.query('BEGIN')
  try {
    const {
      rows: [guard],
    } = await client.query(`SELECT
      (SELECT count(*) FROM universes) universes,
      (SELECT count(*) FROM commands) commands,
      (SELECT count(*) FROM transition_journal) transitions,
      (SELECT count(*) FROM inventories) inventories,
      (SELECT count(*) FROM building_levels WHERE level<>0) levels,
      (SELECT count(*) FROM research_levels WHERE level<>0) research,
      (SELECT count(*) FROM orbit_test_clock) clocks`)
    assert.deepEqual(
      guard,
      {
        universes: '1',
        commands: '0',
        transitions: '0',
        inventories: '0',
        levels: '0',
        research: '0',
        clocks: '1',
      },
      'Only pristine acceptance worlds can be prepared',
    )
    const {
      rows: [rules],
    } = await client.query(
      'SELECT r.profile, r.hash FROM rulesets r JOIN universes u ON u.profile_hash=r.hash WHERE u.id=$1',
      [universe],
    )
    assert.ok(rules?.profile.artifact.progression)
    const artifact = rules.profile.artifact
    const world = (
      await client.query("SELECT to_regclass('asset_lots') IS NOT NULL present")
    ).rows[0].present
    const at = Number(
      (await client.query('SELECT at_ms FROM orbit_test_clock')).rows[0].at_ms,
    )
    let sequence = 0
    const lots = []
    for (const spec of players) {
      const { rows: bodies } = await client.query(
        'SELECT id FROM bodies WHERE universe=$1 AND owner=$2',
        [universe, spec.player],
      )
      assert.equal(
        bodies.length,
        1,
        'Fixture requires exactly one planet per player',
      )
      const body = bodies[0].id
      const addLot = (item, level, quantity, value) => {
        if (!world) return
        const id = randomUUID()
        lots.push({
          id,
          owner: spec.player,
          item,
          level,
          quantity,
          unit_value_micro: value,
          location: item.kind === 'Research' ? 'Player' : { Body: body },
          rules_hash: rules.hash,
          source_operation: id,
          acquired_at: at,
          acquired_sequence: sequence++,
        })
      }
      for (const [building, level] of Object.entries(buildings)) {
        const result = await client.query(
          'UPDATE building_levels SET level=$2 WHERE body=$1 AND building=$3',
          [body, level, building],
        )
        assert.equal(result.rowCount, 1)
        const rule = artifact.buildings[building]
        for (let n = 1; n <= level; n++)
          addLot(
            { kind: 'Building', id: building },
            n,
            1,
            levelValue(rule.base, rule.growth, n),
          )
      }
      for (const [id, level] of Object.entries({
        ...research,
        ...spec.research,
      })) {
        const result = await client.query(
          'UPDATE research_levels SET level=$2, revision=revision+1 WHERE owner=$1 AND research=$3',
          [spec.player, level, id],
        )
        assert.equal(result.rowCount, 1)
        for (let n = 1; n <= level; n++)
          addLot(
            { kind: 'Research', id },
            n,
            1,
            levelValue(artifact.progression.research[id].base, [2, 1], n),
          )
      }
      for (const [id, count] of Object.entries({
        ...inventory,
        ...spec.inventory,
      })) {
        assert.ok(Number.isSafeInteger(count) && count > 0)
        const unit = artifact.progression.unit_costs.find(
          (x) => x.item.id === id,
        )
        assert.ok(unit, `Unknown fixture unit ${id}`)
        await client.query(
          'INSERT INTO inventories(body,owner,item,count) VALUES($1,$2,$3,$4)',
          [body, spec.player, unit.item, count],
        )
        addLot(unit.item, null, count, sum(Object.values(unit.cost)) * SCALE)
      }
      // Over-capacity stock is valid (e.g. delivered cargo); storage remains at its real level-0 capacity.
      await client.query(
        'UPDATE bodies SET amounts=$2, revision=revision+1 WHERE id=$1',
        [
          body,
          {
            metal: 1_000_000 * SCALE,
            crystal: 1_000_000 * SCALE,
            deuterium: 1_000_000 * SCALE,
          },
        ],
      )
      await client.query(
        'UPDATE viewer_heads SET revision=revision+1 WHERE universe=$1 AND player=$2',
        [universe, spec.player],
      )
      await client.query(
        'UPDATE collection_heads SET revision=revision+1 WHERE universe=$1 AND key=ANY($2::uuid[])',
        [universe, [body, spec.player]],
      )
    }
    if (world) {
      for (const [index, lot] of lots.entries())
        await client.query(
          'INSERT INTO asset_lots(universe,key,data) VALUES($1,$2,$3)',
          [universe, String(index), lot],
        )
      await client.query(
        'UPDATE world_heads SET revision=revision+1 WHERE universe=$1',
        [universe],
      )
    }
    await client.query('COMMIT')
    console.log(
      `Prepared ${players.length} isolated player state(s) in ${Math.round(performance.now() - began)}ms`,
    )
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}
