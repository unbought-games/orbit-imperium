import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { prepareIonCannonRules } from './prepare-ion-cannon-rules.mjs'

const read = name => JSON.parse(fs.readFileSync(new URL(`../rules/${name}`, import.meta.url)))
const exported = () => ({ universe: 'beta', base_revision: 12, speed: 5, artifact: read('mvp-v1-slice-9.json') })

test('adds exact Ion Cannon gates, manufacturing and combat while preserving unrelated custom rules', () => {
  const before = exported()
  before.artifact.base_income[0] = 47
  before.artifact.progression.research.IonTechnology.base = [1234, 567, 89]
  before.artifact.world.combat.defense_recovery_probability = [3, 4]
  const saved = structuredClone(before)
  const after = prepareIonCannonRules(before)
  assert.deepEqual(before, saved)
  const defense = after.artifact.catalog.find(e => e.key.id === 'IonCannon')
  assert.equal(defense.enabled, true)
  assert.equal(defense.mobile, false)
  assert.deepEqual(defense.body_kinds, ['Planet'])
  assert.deepEqual(defense.requirements, [
    { type: 'BodyBuilding', building: 'Shipyard', level: 4 },
    { type: 'PlayerResearch', research: 'IonTechnology', level: 4 },
  ])
  assert.deepEqual(after.artifact.progression.unit_costs.at(-1), {
    item: { kind: 'Defense', id: 'IonCannon' }, cost: { metal: 2000, crystal: 6000, deuterium: 0 },
  })
  assert.deepEqual(after.artifact.world.combat.units.at(-1), {
    item: { kind: 'Defense', id: 'IonCannon' }, cost: [2000, 6000, 0], attack_hundredths: 15000, shield_hundredths: 50000,
  })
  assert.deepEqual(prepareIonCannonRules(after), after)
  Object.assign(defense, before.artifact.catalog.find(e => e.key.id === 'IonCannon'))
  after.artifact.progression.unit_costs.pop()
  after.artifact.world.combat.units.pop()
  assert.deepEqual(after, before)
})

test('complete fixture matches preparation and existing Ion Cannon values are replaced without duplicates', () => {
  const next = prepareIonCannonRules(exported()).artifact
  next.id = 'mvp-v1-slice-10'
  assert.deepEqual(next, read('mvp-v1-slice-10.json'))
  const document = prepareIonCannonRules(exported())
  document.artifact.catalog.find(e => e.key.id === 'IonCannon').requirements = []
  document.artifact.progression.unit_costs.at(-1).cost.metal = 999
  document.artifact.world.combat.units.at(-1).attack_hundredths = 999
  assert.deepEqual(prepareIonCannonRules(document), prepareIonCannonRules(exported()))
})

test('rejects malformed exports and missing or disabled dependencies', () => {
  for (const value of [null, {}, { universe: 'beta', base_revision: 0, artifact: { catalog: {} } }]) {
    assert.throws(() => prepareIonCannonRules(value), /world rules export/)
  }
  for (const id of ['Shipyard', 'IonTechnology']) {
    for (const missing of [true, false]) {
      const document = exported()
      if (missing) delete (id === 'Shipyard' ? document.artifact.buildings : document.artifact.progression.research)[id]
      else document.artifact.catalog.find(e => e.key.id === id).enabled = false
      assert.throws(() => prepareIonCannonRules(document), new RegExp(`Enable ${id}`))
    }
  }
  const document = exported()
  document.artifact.catalog = document.artifact.catalog.filter(e => e.key.id !== 'IonCannon')
  assert.throws(() => prepareIonCannonRules(document), /world rules export/)
  for (const section of ['progression', 'world']) {
    const incomplete = exported()
    delete incomplete.artifact[section]
    assert.throws(() => prepareIonCannonRules(incomplete), /world rules export/)
  }
})

test('CLI writes a proposal exclusively and leaves the export unchanged', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-ion-cannon-'))
  try {
    const input = path.join(dir, 'before.json'), output = path.join(dir, 'after.json')
    const original = JSON.stringify(exported())
    fs.writeFileSync(input, original)
    const run = () => spawnSync(process.execPath, ['scripts/prepare-ion-cannon-rules.mjs', input, output], { encoding: 'utf8' })
    assert.equal(run().status, 0)
    assert.deepEqual(JSON.parse(fs.readFileSync(output)), prepareIonCannonRules(exported()))
    assert.notEqual(run().status, 0)
    assert.equal(fs.readFileSync(input, 'utf8'), original)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
