import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { prepareHeavyLaserRules } from './prepare-heavy-laser-rules.mjs'

const read = name => JSON.parse(fs.readFileSync(new URL(`../rules/${name}`, import.meta.url)))
const exported = () => ({ universe: 'beta', base_revision: 12, speed: 5, artifact: read('mvp-v1-slice-11.json') })

test('adds exact Heavy Laser gates, manufacturing and combat while preserving unrelated custom rules', () => {
  const before = exported()
  before.artifact.base_income[0] = 47
  before.artifact.progression.research.LaserTechnology.base = [1234, 567, 89]
  before.artifact.world.combat.defense_recovery_probability = [3, 4]
  const saved = structuredClone(before)
  const after = prepareHeavyLaserRules(before)
  assert.deepEqual(before, saved)
  const defense = after.artifact.catalog.find(e => e.key.id === 'HeavyLaser')
  assert.equal(defense.enabled, true)
  assert.equal(defense.mobile, false)
  assert.deepEqual(defense.body_kinds, ['Planet'])
  assert.deepEqual(defense.requirements, [
    { type: 'BodyBuilding', building: 'Shipyard', level: 4 },
    { type: 'PlayerResearch', research: 'EnergyTechnology', level: 3 },
    { type: 'PlayerResearch', research: 'LaserTechnology', level: 6 },
  ])
  assert.deepEqual(after.artifact.progression.unit_costs.at(-1), {
    item: { kind: 'Defense', id: 'HeavyLaser' }, cost: { metal: 6000, crystal: 2000, deuterium: 0 },
  })
  assert.deepEqual(after.artifact.world.combat.units.at(-1), {
    item: { kind: 'Defense', id: 'HeavyLaser' }, cost: [6000, 2000, 0], attack_hundredths: 25000, shield_hundredths: 10000,
  })
  assert.deepEqual(prepareHeavyLaserRules(after), after)
  Object.assign(defense, before.artifact.catalog.find(e => e.key.id === 'HeavyLaser'))
  after.artifact.progression.unit_costs.pop()
  after.artifact.world.combat.units.pop()
  assert.deepEqual(after, before)
})

test('complete fixture matches preparation and existing Heavy Laser values are replaced without duplicates', () => {
  const next = prepareHeavyLaserRules(exported()).artifact
  next.id = 'mvp-v1-heavy-laser'
  assert.deepEqual(next, read('mvp-v1-heavy-laser.json'))
  const document = prepareHeavyLaserRules(exported())
  document.artifact.catalog.find(e => e.key.id === 'HeavyLaser').requirements = []
  document.artifact.progression.unit_costs.at(-1).cost.metal = 999
  document.artifact.world.combat.units.at(-1).attack_hundredths = 999
  assert.deepEqual(prepareHeavyLaserRules(document), prepareHeavyLaserRules(exported()))
})

test('rejects malformed exports and missing or disabled dependencies', () => {
  for (const value of [null, {}, { universe: 'beta', base_revision: 0, artifact: { catalog: {} } }]) {
    assert.throws(() => prepareHeavyLaserRules(value), /world rules export/)
  }
  for (const id of ['Shipyard', 'EnergyTechnology', 'LaserTechnology']) {
    for (const missing of [true, false]) {
      const document = exported()
      if (missing) delete (id === 'Shipyard' ? document.artifact.buildings : document.artifact.progression.research)[id]
      else document.artifact.catalog.find(e => e.key.id === id).enabled = false
      assert.throws(() => prepareHeavyLaserRules(document), new RegExp(`Enable ${id}`))
    }
  }
  const document = exported()
  document.artifact.catalog = document.artifact.catalog.filter(e => e.key.id !== 'HeavyLaser')
  assert.throws(() => prepareHeavyLaserRules(document), /world rules export/)
  for (const section of ['progression', 'world']) {
    const incomplete = exported()
    delete incomplete.artifact[section]
    assert.throws(() => prepareHeavyLaserRules(incomplete), /world rules export/)
  }
})

test('CLI writes a proposal exclusively and leaves the export unchanged', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-heavy-laser-'))
  try {
    const input = path.join(dir, 'before.json'), output = path.join(dir, 'after.json')
    const original = JSON.stringify(exported())
    fs.writeFileSync(input, original)
    const run = () => spawnSync(process.execPath, ['scripts/prepare-heavy-laser-rules.mjs', input, output], { encoding: 'utf8' })
    assert.equal(run().status, 0)
    assert.deepEqual(JSON.parse(fs.readFileSync(output)), prepareHeavyLaserRules(exported()))
    assert.notEqual(run().status, 0)
    assert.equal(fs.readFileSync(input, 'utf8'), original)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
