import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { prepareImpulseRules } from './prepare-impulse-rules.mjs'

test('Impulse patch preserves exported identity and unrelated universe customization', () => {
  const artifact = JSON.parse(fs.readFileSync(new URL('../rules/mvp-v1-slice-5.json', import.meta.url)))
  artifact.base_income[0] = 47
  artifact.ships.SmallCargo.capacity = 6000
  const before = { universe: 'retained-beta', base_revision: 9, artifact, speed: 5 }
  const saved = structuredClone(before)
  const next = prepareImpulseRules(before)
  assert.deepEqual(before, saved)
  assert.equal(next.speed, 5)
  assert.equal(next.universe, before.universe)
  assert.equal(next.base_revision, 9)
  assert.deepEqual(next.artifact.progression.research.ImpulseDrive, { base: [2000, 4000, 600], growth: [2, 1] })
  assert.deepEqual(next.artifact.ships.SmallCargo.impulse_drive, { minimum_level: 5, base_speed: 10000, fuel: 20 })
  assert.equal(next.artifact.catalog.find(e => e.key.id === 'ImpulseDrive').enabled, true)
  assert.deepEqual(prepareImpulseRules(next), next)
  // Removing only the three intended edits gives exactly the original export.
  delete next.artifact.progression.research.ImpulseDrive
  delete next.artifact.ships.SmallCargo.impulse_drive
  next.artifact.catalog = next.artifact.catalog.map(e => e.key.id === 'ImpulseDrive' ? artifact.catalog.find(old => old.key.id === 'ImpulseDrive') : e)
  assert.deepEqual(next, saved)
})

test('refuses non-export and non-world documents', () => {
  for (const value of [{}, { artifact: {} }, { universe: 'x', base_revision: 0, artifact: { progression: {} } }]) {
    assert.throws(() => prepareImpulseRules(value), /Expected a world rules export/)
  }
})
