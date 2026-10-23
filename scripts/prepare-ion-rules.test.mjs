import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { prepareIonRules } from './prepare-ion-rules.mjs'

const read = name => JSON.parse(fs.readFileSync(new URL(`../rules/${name}`, import.meta.url)))
const exported = () => ({ universe: 'beta', base_revision: 12, speed: 5, artifact: read('mvp-v1-slice-8.json') })

test('adds Ion costs and gates without changing prerequisites or unrelated universe rules', () => {
  const before = exported()
  before.artifact.base_income[0] = 47
  before.artifact.progression.research.LaserTechnology.base = [400, 200, 0]
  const saved = structuredClone(before)
  const after = prepareIonRules(before)
  assert.deepEqual(before, saved)
  assert.deepEqual(after.artifact.progression.research.IonTechnology, { base: [1000, 300, 100], growth: [2, 1] })
  const ion = after.artifact.catalog.find(e => e.key.id === 'IonTechnology')
  assert.equal(ion.enabled, true)
  assert.deepEqual(ion.requirements, [
    { type: 'BodyBuilding', building: 'ResearchLab', level: 4 },
    { type: 'PlayerResearch', research: 'EnergyTechnology', level: 4 },
    { type: 'PlayerResearch', research: 'LaserTechnology', level: 5 },
  ])
  assert.deepEqual(prepareIonRules(after), after)
  delete after.artifact.progression.research.IonTechnology
  Object.assign(ion, before.artifact.catalog.find(e => e.key.id === 'IonTechnology'))
  assert.deepEqual(after, before)
})

test('slice 9 matches the operator patch and existing Ion customizations are explicitly replaced', () => {
  const next = prepareIonRules(exported()).artifact
  next.id = 'mvp-v1-slice-9'
  assert.deepEqual(next, read('mvp-v1-slice-9.json'))
  const document = prepareIonRules(exported())
  document.artifact.progression.research.IonTechnology.base = [1, 2, 3]
  document.artifact.catalog.find(e => e.key.id === 'IonTechnology').requirements = []
  assert.deepEqual(prepareIonRules(document), prepareIonRules(exported()))
})

test('rejects missing definitions and disabled prerequisite content', () => {
  for (const value of [{}, { ...exported(), artifact: { catalog: {} } }]) {
    assert.throws(() => prepareIonRules(value), /world rules export/)
  }
  for (const id of ['ResearchLab', 'EnergyTechnology', 'LaserTechnology']) {
    for (const mode of ['definition', 'entry', 'disabled']) {
      const document = exported()
      if (mode === 'definition') delete (id === 'ResearchLab' ? document.artifact.buildings : document.artifact.progression.research)[id]
      if (mode === 'entry') document.artifact.catalog = document.artifact.catalog.filter(e => e.key.id !== id)
      if (mode === 'disabled') document.artifact.catalog.find(e => e.key.id === id).enabled = false
      assert.throws(() => prepareIonRules(document), new RegExp(`Enable ${id}`))
    }
  }
  const document = exported()
  document.artifact.catalog = document.artifact.catalog.filter(e => e.key.id !== 'IonTechnology')
  assert.throws(() => prepareIonRules(document), /world rules export/)
})

test('CLI writes exclusively, preserves the input and cleans up its temporary files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-ion-'))
  try {
    const input = path.join(dir, 'before.json'), output = path.join(dir, 'after.json')
    const original = JSON.stringify(exported())
    fs.writeFileSync(input, original)
    const run = () => spawnSync(process.execPath, ['scripts/prepare-ion-rules.mjs', input, output], { encoding: 'utf8' })
    assert.equal(run().status, 0)
    assert.deepEqual(JSON.parse(fs.readFileSync(output)), prepareIonRules(exported()))
    assert.notEqual(run().status, 0)
    assert.equal(fs.readFileSync(input, 'utf8'), original)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
