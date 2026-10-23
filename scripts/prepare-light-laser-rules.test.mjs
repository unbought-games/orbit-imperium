import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { prepareLightLaserRules } from './prepare-light-laser-rules.mjs'

const read = name => JSON.parse(fs.readFileSync(new URL(`../rules/${name}`, import.meta.url)))
const exported = (slice = 5) => ({ universe: 'beta', base_revision: 12, speed: 5, artifact: read(`mvp-v1-slice-${slice}.json`) })

test('adds exact laser research, manufacturing and combat definitions while preserving unrelated rules', () => {
  const before = exported()
  before.artifact.base_income[0] = 47
  before.artifact.world.combat.defense_recovery_probability = [3, 4]
  const saved = structuredClone(before)
  const after = prepareLightLaserRules(before)
  assert.deepEqual(before, saved)
  assert.deepEqual(after.artifact.progression.research.LaserTechnology, { base: [200, 100, 0], growth: [2, 1] })
  const laser = after.artifact.catalog.find(e => e.key.id === 'LaserTechnology')
  const defense = after.artifact.catalog.find(e => e.key.id === 'LightLaser')
  assert.equal(laser.enabled, true)
  assert.deepEqual(laser.requirements, [
    { type: 'BodyBuilding', building: 'ResearchLab', level: 1 },
    { type: 'PlayerResearch', research: 'EnergyTechnology', level: 2 },
  ])
  assert.equal(defense.enabled, true)
  assert.equal(defense.mobile, false)
  assert.deepEqual(defense.requirements, [
    { type: 'BodyBuilding', building: 'Shipyard', level: 2 },
    { type: 'PlayerResearch', research: 'EnergyTechnology', level: 1 },
    { type: 'PlayerResearch', research: 'LaserTechnology', level: 3 },
  ])
  assert.deepEqual(after.artifact.progression.unit_costs.at(-1), {
    item: { kind: 'Defense', id: 'LightLaser' }, cost: { metal: 1500, crystal: 500, deuterium: 0 },
  })
  assert.deepEqual(after.artifact.world.combat.units.at(-1), {
    item: { kind: 'Defense', id: 'LightLaser' }, cost: [1500, 500, 0], attack_hundredths: 10000, shield_hundredths: 2500,
  })
  assert.deepEqual(prepareLightLaserRules(after), after)
  delete after.artifact.progression.research.LaserTechnology
  Object.assign(laser, before.artifact.catalog.find(e => e.key.id === 'LaserTechnology'))
  Object.assign(defense, before.artifact.catalog.find(e => e.key.id === 'LightLaser'))
  after.artifact.progression.unit_costs.pop()
  after.artifact.world.combat.units.pop()
  assert.deepEqual(after, before)
})

test('complete slice fixture matches the operator patch and replaces existing definitions without duplicates', () => {
  const next = prepareLightLaserRules(exported(7)).artifact
  next.id = 'mvp-v1-slice-8'
  assert.deepEqual(next, read('mvp-v1-slice-8.json'))
  const doc = prepareLightLaserRules(exported())
  doc.artifact.progression.research.LaserTechnology.base = [1, 2, 3]
  doc.artifact.progression.unit_costs.at(-1).cost.metal = 999
  doc.artifact.world.combat.units.at(-1).attack_hundredths = 999
  assert.deepEqual(prepareLightLaserRules(doc), prepareLightLaserRules(exported()))
})

test('rejects missing definitions and disabled dependencies', () => {
  assert.throws(() => prepareLightLaserRules({}), /world rules export/)
  for (const id of ['RoboticsFactory', 'ResearchLab', 'Shipyard', 'EnergyTechnology']) {
    for (const missing of [true, false]) {
      const doc = exported()
      if (missing) delete (id === 'EnergyTechnology' ? doc.artifact.progression.research : doc.artifact.buildings)[id]
      else doc.artifact.catalog.find(e => e.key.id === id).enabled = false
      assert.throws(() => prepareLightLaserRules(doc), new RegExp(`Enable ${id}`))
    }
  }
  for (const id of ['LaserTechnology', 'LightLaser']) {
    const doc = exported()
    doc.artifact.catalog = doc.artifact.catalog.filter(e => e.key.id !== id)
    assert.throws(() => prepareLightLaserRules(doc), /world rules export/)
  }
})

test('CLI writes a proposal exclusively and leaves the export unchanged', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-laser-'))
  try {
    const input = path.join(dir, 'before.json'), output = path.join(dir, 'after.json')
    const original = JSON.stringify(exported())
    fs.writeFileSync(input, original)
    const run = () => spawnSync(process.execPath, ['scripts/prepare-light-laser-rules.mjs', input, output], { encoding: 'utf8' })
    assert.equal(run().status, 0)
    assert.deepEqual(JSON.parse(fs.readFileSync(output)), prepareLightLaserRules(exported()))
    assert.notEqual(run().status, 0)
    assert.equal(fs.readFileSync(input, 'utf8'), original)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
