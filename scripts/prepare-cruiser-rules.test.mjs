import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { prepareCruiserRules } from './prepare-cruiser-rules.mjs'
const read = (path) =>
  JSON.parse(fs.readFileSync(new URL(path, import.meta.url)))
const exported = () => ({
  universe: 'beta',
  base_revision: 7,
  speed: 5,
  artifact: read('../rules/mvp-v1-slice-9.json'),
})

test('Cruiser activation preserves custom universe rules and is idempotent', () => {
  const before = exported()
  before.artifact.base_income[0] = 47
  before.artifact.progression.research.ImpulseDrive.base[0] = 2345
  const saved = structuredClone(before),
    after = prepareCruiserRules(before)
  assert.deepEqual(before, saved)
  assert.deepEqual(prepareCruiserRules(after), after)
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
  const content = read('../rules/content/cruiser.json')
  assert.deepEqual(after.artifact.ships.Cruiser, content.ship)
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
  const entry = after.artifact.catalog.find((e) => e.key.id === 'Cruiser')
  assert.equal(entry.enabled, true)
  assert.equal(entry.mobile, true)
  assert.deepEqual(entry.requirements, content.requirements)
})

test('Cruiser patch requires enabled and defined research', () => {
  assert.throws(() => prepareCruiserRules({}), /world rules export/)
  for (const id of ['IonTechnology', 'ImpulseDrive'])
    for (const missing of [true, false]) {
      const doc = exported()
      if (missing) delete doc.artifact.progression.research[id]
      else doc.artifact.catalog.find((e) => e.key.id === id).enabled = false
      assert.throws(() => prepareCruiserRules(doc), new RegExp(`Enable ${id}`))
    }
})

test('complete fixture preserves Ion Cannons when adding Cruisers', () => {
  const after = prepareCruiserRules({
    universe: 'fixture',
    base_revision: 0,
    speed: 10,
    artifact: read('../rules/mvp-v1-slice-10.json'),
  }).artifact
  after.id = 'mvp-v1-slice-11'
  assert.deepEqual(after, read('../rules/mvp-v1-slice-11.json'))
})

test('Cruiser patch requires an enabled, defined Shipyard', () => {
  for (const missing of [true, false]) {
    const doc = exported()
    if (missing) delete doc.artifact.buildings.Shipyard
    else
      doc.artifact.catalog.find((e) => e.key.id === 'Shipyard').enabled = false
    assert.throws(() => prepareCruiserRules(doc), /Enable Shipyard/)
  }
})

test('Cruiser patch replaces its existing definitions without duplicating entries or changing other rules', () => {
  const before = prepareCruiserRules(exported())
  before.artifact.ships.Cruiser.capacity = 999
  before.artifact.progression.unit_costs.find(
    (e) => e.item.id === 'Cruiser',
  ).cost.metal = 1
  before.artifact.world.combat.units.find(
    (e) => e.item.id === 'Cruiser',
  ).attack_hundredths = 1
  before.artifact.world.combat.rapid_fire.find(
    (e) => e.shooter.id === 'Cruiser',
  ).factor = 2
  const after = prepareCruiserRules(before)
  assert.deepEqual(after, prepareCruiserRules(exported()))
  const original = exported()
  delete after.artifact.ships.Cruiser
  after.artifact.progression.unit_costs =
    after.artifact.progression.unit_costs.filter((e) => e.item.id !== 'Cruiser')
  after.artifact.world.combat.units = after.artifact.world.combat.units.filter(
    (e) => e.item.id !== 'Cruiser',
  )
  after.artifact.world.combat.rapid_fire =
    after.artifact.world.combat.rapid_fire.filter(
      (e) => e.shooter.id !== 'Cruiser',
    )
  after.artifact.catalog = after.artifact.catalog.map((e) =>
    e.key.id === 'Cruiser'
      ? original.artifact.catalog.find((e) => e.key.id === 'Cruiser')
      : e,
  )
  assert.deepEqual(after, original)
})
