import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { prepareGaussCannonRules } from './prepare-gauss-cannon-rules.mjs'

const read = name => JSON.parse(fs.readFileSync(new URL(`../rules/${name}`, import.meta.url)))
const exported = () => ({ universe: 'beta', base_revision: 12, speed: 5, artifact: read('mvp-v1-slice-11.json') })

test('adds exact Gauss Cannon gates, manufacturing and combat while preserving unrelated custom rules', () => {
  const before = exported()
  before.artifact.base_income[0] = 47
  before.artifact.progression.research.EnergyTechnology.base = [1234, 567, 89]
  before.artifact.world.combat.defense_recovery_probability = [3, 4]
  const saved = structuredClone(before)
  const after = prepareGaussCannonRules(before)
  assert.deepEqual(before, saved)
  const defense = after.artifact.catalog.find(e => e.key.id === 'GaussCannon')
  assert.equal(defense.enabled, true)
  assert.equal(defense.mobile, false)
  assert.deepEqual(defense.body_kinds, ['Planet'])
  assert.deepEqual(defense.requirements, [
    { type: 'BodyBuilding', building: 'Shipyard', level: 6 },
    { type: 'PlayerResearch', research: 'EnergyTechnology', level: 6 },
    { type: 'PlayerResearch', research: 'WeaponsTechnology', level: 3 },
    { type: 'PlayerResearch', research: 'ShieldingTechnology', level: 1 },
  ])
  assert.deepEqual(after.artifact.progression.unit_costs.at(-1), {
    item: { kind: 'Defense', id: 'GaussCannon' }, cost: { metal: 20000, crystal: 15000, deuterium: 2000 },
  })
  assert.deepEqual(after.artifact.world.combat.units.at(-1), {
    item: { kind: 'Defense', id: 'GaussCannon' }, cost: [20000, 15000, 2000], attack_hundredths: 110000, shield_hundredths: 20000,
  })
  assert.deepEqual(prepareGaussCannonRules(after), after)
  Object.assign(defense, before.artifact.catalog.find(e => e.key.id === 'GaussCannon'))
  after.artifact.progression.unit_costs.pop()
  after.artifact.world.combat.units.pop()
  assert.deepEqual(after, before)
})

test('complete fixture matches preparation and existing Gauss Cannon values are replaced without duplicates', () => {
  const next = prepareGaussCannonRules(exported()).artifact
  next.id = 'mvp-v1-slice-12'
  assert.deepEqual(next, read('mvp-v1-slice-12.json'))
  const document = prepareGaussCannonRules(exported())
  document.artifact.catalog.find(e => e.key.id === 'GaussCannon').requirements = []
  document.artifact.progression.unit_costs.at(-1).cost.metal = 999
  document.artifact.world.combat.units.at(-1).attack_hundredths = 999
  assert.deepEqual(prepareGaussCannonRules(document), prepareGaussCannonRules(exported()))
})

test('rejects malformed exports and missing or disabled dependencies', () => {
  for (const value of [null, {}, { universe: 'beta', base_revision: 0, artifact: { catalog: {} } }]) {
    assert.throws(() => prepareGaussCannonRules(value), /world rules export/)
  }
  for (const id of ['Shipyard', 'EnergyTechnology', 'WeaponsTechnology', 'ShieldingTechnology']) {
    for (const missing of [true, false]) {
      const document = exported()
      if (missing) delete (id === 'Shipyard' ? document.artifact.buildings : document.artifact.progression.research)[id]
      else document.artifact.catalog.find(e => e.key.id === id).enabled = false
      assert.throws(() => prepareGaussCannonRules(document), new RegExp(`Enable ${id}`))
    }
  }
  const document = exported()
  document.artifact.catalog = document.artifact.catalog.filter(e => e.key.id !== 'GaussCannon')
  assert.throws(() => prepareGaussCannonRules(document), /world rules export/)
  for (const section of ['progression', 'world']) {
    const incomplete = exported()
    delete incomplete.artifact[section]
    assert.throws(() => prepareGaussCannonRules(incomplete), /world rules export/)
  }
})

test('CLI writes a proposal exclusively and leaves the export unchanged', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-gauss-cannon-'))
  try {
    const input = path.join(dir, 'before.json'), output = path.join(dir, 'after.json')
    const original = JSON.stringify(exported())
    fs.writeFileSync(input, original)
    const run = () => spawnSync(process.execPath, ['scripts/prepare-gauss-cannon-rules.mjs', input, output], { encoding: 'utf8' })
    assert.equal(run().status, 0)
    assert.deepEqual(JSON.parse(fs.readFileSync(output)), prepareGaussCannonRules(exported()))
    assert.notEqual(run().status, 0)
    assert.equal(fs.readFileSync(input, 'utf8'), original)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
