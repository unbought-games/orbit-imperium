import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { prepareLargeCargoRules } from './prepare-large-cargo-rules.mjs'
const read = (path) =>
  JSON.parse(fs.readFileSync(new URL(path, import.meta.url)))
const exported = () => ({
  universe: 'beta',
  base_revision: 7,
  speed: 5,
  artifact: read('../rules/mvp-v1-slice-5.json'),
})

test('Large Cargo activation preserves custom universe rules and is idempotent', () => {
  const before = exported()
  before.artifact.base_income[0] = 47
  before.artifact.progression.research.CombustionDrive.base[0] = 2345
  const saved = structuredClone(before),
    after = prepareLargeCargoRules(before)
  assert.deepEqual(before, saved)
  assert.deepEqual(prepareLargeCargoRules(after), after)
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
  const content = read('../rules/content/large-cargo.json')
  assert.deepEqual(after.artifact.ships.LargeCargo, content.ship)
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
  const entry = after.artifact.catalog.find((e) => e.key.id === 'LargeCargo')
  assert.equal(entry.enabled, true)
  assert.equal(entry.mobile, true)
  assert.deepEqual(entry.requirements, content.requirements)
})

test('Large Cargo patch requires enabled and defined research', () => {
  assert.throws(() => prepareLargeCargoRules({}), /world rules export/)
  for (const id of ['CombustionDrive'])
    for (const missing of [true, false]) {
      const doc = exported()
      if (missing) delete doc.artifact.progression.research[id]
      else doc.artifact.catalog.find((e) => e.key.id === id).enabled = false
      assert.throws(
        () => prepareLargeCargoRules(doc),
        new RegExp(`Enable ${id}`),
      )
    }
})

test('complete fixture preserves existing ships and defenses when adding Large Cargo', () => {
  const after = prepareLargeCargoRules({
    universe: 'fixture',
    base_revision: 0,
    speed: 10,
    artifact: read('../rules/mvp-v1-slice-11.json'),
  }).artifact
  after.id = 'mvp-v1-slice-12'
  assert.deepEqual(after, read('../rules/mvp-v1-slice-12.json'))
})

test('Large Cargo patch requires an enabled, defined Shipyard', () => {
  for (const missing of [true, false]) {
    const doc = exported()
    if (missing) delete doc.artifact.buildings.Shipyard
    else
      doc.artifact.catalog.find((e) => e.key.id === 'Shipyard').enabled = false
    assert.throws(() => prepareLargeCargoRules(doc), /Enable Shipyard/)
  }
})

test('Large Cargo patch replaces its existing definitions without duplicating entries or changing other rules', () => {
  const before = prepareLargeCargoRules(exported())
  before.artifact.ships.LargeCargo.capacity = 999
  before.artifact.progression.unit_costs.find(
    (e) => e.item.id === 'LargeCargo',
  ).cost.metal = 1
  before.artifact.world.combat.units.find(
    (e) => e.item.id === 'LargeCargo',
  ).attack_hundredths = 1
  before.artifact.world.combat.rapid_fire.find(
    (e) => e.shooter.id === 'LargeCargo',
  ).factor = 2
  const after = prepareLargeCargoRules(before)
  assert.deepEqual(after, prepareLargeCargoRules(exported()))
  const original = exported()
  delete after.artifact.ships.LargeCargo
  after.artifact.progression.unit_costs =
    after.artifact.progression.unit_costs.filter(
      (e) => e.item.id !== 'LargeCargo',
    )
  after.artifact.world.combat.units = after.artifact.world.combat.units.filter(
    (e) => e.item.id !== 'LargeCargo',
  )
  after.artifact.world.combat.rapid_fire =
    after.artifact.world.combat.rapid_fire.filter(
      (e) => e.shooter.id !== 'LargeCargo',
    )
  after.artifact.catalog = after.artifact.catalog.map((e) =>
    e.key.id === 'LargeCargo'
      ? original.artifact.catalog.find((e) => e.key.id === 'LargeCargo')
      : e,
  )
  assert.deepEqual(after, original)
})

test('CLI writes the prepared export and refuses to overwrite an existing file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'large-cargo-rules-'))
  try {
    const input = path.join(dir, 'before.json')
    const output = path.join(dir, 'after.json')
    const document = exported()
    fs.writeFileSync(input, JSON.stringify(document))
    const run = () =>
      spawnSync(
        process.execPath,
        [
          new URL('./prepare-large-cargo-rules.mjs', import.meta.url).pathname,
          input,
          output,
        ],
        { encoding: 'utf8' },
      )
    const first = run()
    assert.equal(first.status, 0, first.stderr)
    const saved = fs.readFileSync(output, 'utf8')
    assert.deepEqual(JSON.parse(saved), prepareLargeCargoRules(document))
    assert.notEqual(run().status, 0)
    assert.equal(fs.readFileSync(output, 'utf8'), saved)
    assert.deepEqual(JSON.parse(fs.readFileSync(input)), document)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
