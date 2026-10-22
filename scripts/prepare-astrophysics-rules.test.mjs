import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { prepareAstrophysicsRules } from './prepare-astrophysics-rules.mjs'

function exported() {
  const artifact = JSON.parse(fs.readFileSync(new URL('../rules/mvp-v1-slice-5.json', import.meta.url)))
  artifact.progression.research.ImpulseDrive = { base: [2000, 4000, 600], growth: [2, 1] }
  artifact.catalog.find(e => e.key.id === 'ImpulseDrive').enabled = true
  return { universe: 'beta', base_revision: 12, speed: 5, artifact }
}
test('patch changes only Astrophysics and preserves export identity and custom values', () => {
  const before = exported()
  before.artifact.base_income[0] = 47
  const saved = structuredClone(before)
  const after = prepareAstrophysicsRules(before)
  assert.deepEqual(before, saved)
  assert.deepEqual(after.artifact.progression.research.Astrophysics, { base: [4000, 8000, 4000], growth: [7, 4] })
  const entry = after.artifact.catalog.find(e => e.key.id === 'Astrophysics')
  assert.equal(entry.enabled, true)
  assert.deepEqual(entry.requirements, [
    { type: 'BodyBuilding', building: 'ResearchLab', level: 3 },
    { type: 'PlayerResearch', research: 'EspionageTechnology', level: 4 },
    { type: 'PlayerResearch', research: 'ImpulseDrive', level: 3 },
  ])
  assert.deepEqual(prepareAstrophysicsRules(after), after)
  delete after.artifact.progression.research.Astrophysics
  Object.assign(entry, before.artifact.catalog.find(e => e.key.id === 'Astrophysics'))
  assert.deepEqual(after, before)
})
test('missing or disabled dependencies reject before writing a proposal', () => {
  assert.throws(() => prepareAstrophysicsRules({}), /world rules export/)
  for (const id of ['ImpulseDrive', 'EspionageTechnology']) {
    for (const missing of [true, false]) {
      const doc = exported()
      if (missing) delete doc.artifact.progression.research[id]
      else doc.artifact.catalog.find(e => e.key.id === id).enabled = false
      assert.throws(() => prepareAstrophysicsRules(doc), new RegExp(`Enable ${id}`))
    }
  }
})
