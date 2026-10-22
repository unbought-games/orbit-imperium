import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { prepareImpulseRules } from './prepare-impulse-rules.mjs'
import { prepareHeavyFighterRules } from './prepare-heavy-fighter-rules.mjs'
const read = (path) =>
  JSON.parse(fs.readFileSync(new URL(path, import.meta.url)))
const exported = () =>
  prepareImpulseRules({
    universe: 'beta',
    base_revision: 7,
    speed: 5,
    artifact: read('../rules/mvp-v1-slice-5.json'),
  })

test('Heavy Fighter activation preserves custom universe rules and is idempotent', () => {
  const before = exported()
  before.artifact.base_income[0] = 47
  before.artifact.progression.research.ImpulseDrive.base[0] = 2345
  const saved = structuredClone(before),
    after = prepareHeavyFighterRules(before)
  assert.deepEqual(before, saved)
  assert.deepEqual(prepareHeavyFighterRules(after), after)
  assert.equal(after.universe, 'beta')
  assert.equal(after.base_revision, 7)
  assert.equal(after.speed, 5)
  assert.equal(after.artifact.base_income[0], 47)
  assert.deepEqual(
    after.artifact.progression.research,
    before.artifact.progression.research,
  )
  for (const key of Object.keys(before.artifact.ships))
    assert.deepEqual(after.artifact.ships[key], before.artifact.ships[key])
  const content = read('../rules/content/heavy-fighter.json')
  assert.deepEqual(after.artifact.ships.HeavyFighter, content.ship)
  assert.equal(
    after.artifact.progression.unit_costs.length,
    before.artifact.progression.unit_costs.length + 1,
  )
  assert.equal(
    after.artifact.world.combat.units.length,
    before.artifact.world.combat.units.length + 1,
  )
  assert.deepEqual(after.artifact.world.combat.rapid_fire, [
    ...before.artifact.world.combat.rapid_fire,
    ...content.rapid_fire,
  ])
  const entry = after.artifact.catalog.find((e) => e.key.id === 'HeavyFighter')
  assert.equal(entry.enabled, true)
  assert.equal(entry.mobile, true)
  assert.deepEqual(entry.requirements, content.requirements)
})

test('Heavy Fighter patch requires enabled and defined research', () => {
  assert.throws(() => prepareHeavyFighterRules({}), /world rules export/)
  for (const id of ['ArmourTechnology', 'ImpulseDrive'])
    for (const missing of [true, false]) {
      const doc = exported()
      if (missing) delete doc.artifact.progression.research[id]
      else doc.artifact.catalog.find((e) => e.key.id === id).enabled = false
      assert.throws(
        () => prepareHeavyFighterRules(doc),
        new RegExp(`Enable ${id}`),
      )
    }
})

test('complete fixture equals the patch applied to the retained colony profile', () => {
  const after = prepareHeavyFighterRules({
    universe: 'fixture',
    base_revision: 0,
    speed: 10,
    artifact: read('../rules/mvp-v1-slice-6.json'),
  }).artifact
  after.id = 'mvp-v1-slice-7'
  assert.deepEqual(after, read('../rules/mvp-v1-slice-7.json'))
})
