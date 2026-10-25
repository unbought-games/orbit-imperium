import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { prepareSolarSatelliteRules } from './prepare-solar-satellite-rules.mjs'
const read = (path) => JSON.parse(fs.readFileSync(new URL(path, import.meta.url)))
const exported = () => ({ universe: 'beta', base_revision: 7, speed: 5, artifact: read('../rules/mvp-v1-slice-11.json') })
test('satellite activation preserves other content, requires no research, and is idempotent', () => {
  const before = exported()
  before.artifact.base_income[0] = 47
  before.artifact.buildings.Shipyard.base[0] = 999
  const saved = structuredClone(before), after = prepareSolarSatelliteRules(before)
  assert.deepEqual(before, saved)
  assert.deepEqual(prepareSolarSatelliteRules(after), after)
  assert.equal(after.universe, before.universe)
  assert.equal(after.base_revision, before.base_revision)
  assert.equal(after.speed, before.speed)
  for (const field of ['buildings', 'ships', 'base_income']) assert.deepEqual(after.artifact[field], before.artifact[field])
  assert.deepEqual(after.artifact.progression.research, before.artifact.progression.research)
  const entry = after.artifact.catalog.find((e) => e.key.id === 'SolarSatellite')
  assert.equal(entry.enabled, true)
  assert.equal(entry.mobile, false)
  assert.deepEqual(entry.requirements, [{type:'BodyBuilding', building:'Shipyard', level:1}])
  const pairs = after.artifact.world.combat.rapid_fire.filter((r) => r.target.id === 'SolarSatellite')
  assert.equal(pairs.length, 6)
  assert.ok(pairs.every((r) => r.factor === 5))
  assert.ok(!pairs.some((r) => r.shooter.id === 'EspionageProbe'))
  assert.deepEqual(after.artifact.world.combat.rapid_fire.filter((r) => r.target.id !== 'SolarSatellite'), before.artifact.world.combat.rapid_fire)
})
test('activation rejects missing industrial prerequisites', () => {
  assert.throws(() => prepareSolarSatelliteRules({}), /world rules export/)
  for (const id of ['Shipyard', 'RoboticsFactory']) for (const missing of [true, false]) {
    const doc = exported()
    if (missing) delete doc.artifact.buildings[id]
    else doc.artifact.catalog.find((e) => e.key.id === id).enabled = false
    assert.throws(() => prepareSolarSatelliteRules(doc), new RegExp(`Enable ${id}`))
  }
})
test('activation also supports the original world profile and reproduces the combined fixture', () => {
  const minimal = prepareSolarSatelliteRules({...exported(), artifact:read('../rules/mvp-v1-slice-5.json')})
  assert.equal(minimal.artifact.world.combat.rapid_fire.filter((r) => r.target.id === 'SolarSatellite').length, 3)
  const a = prepareSolarSatelliteRules(exported()).artifact
  a.id = 'mvp-v1-solar-satellite'
  assert.deepEqual(a, read('../rules/mvp-v1-solar-satellite.json'))
})

 test('ship patches add satellite rapid fire regardless of activation order', async () => {
  const {prepareHeavyFighterRules} = await import('./prepare-heavy-fighter-rules.mjs')
  const {prepareCruiserRules} = await import('./prepare-cruiser-rules.mjs')
  const {prepareColonizationRules} = await import('./prepare-colonization-rules.mjs')
  for (const [id,prepare] of [['HeavyFighter',prepareHeavyFighterRules],['Cruiser',prepareCruiserRules],['ColonyShip',prepareColonizationRules]]) {
    const before=exported()
    before.artifact.catalog.find((e)=>e.key.id===id).enabled=false
    delete before.artifact.ships[id]
    before.artifact.progression.unit_costs=before.artifact.progression.unit_costs.filter((u)=>u.item.id!==id)
    before.artifact.world.combat.units=before.artifact.world.combat.units.filter((u)=>u.item.id!==id)
    before.artifact.world.combat.rapid_fire=before.artifact.world.combat.rapid_fire.filter((r)=>r.shooter.id!==id && r.target.id!==id)
    const after=prepare(prepareSolarSatelliteRules(before))
    const rf=after.artifact.world.combat.rapid_fire.filter((r)=>r.shooter.id===id && r.target.id==='SolarSatellite')
    assert.deepEqual(rf,[{shooter:{kind:'Ship',id},target:{kind:'Ship',id:'SolarSatellite'},factor:5}])
  }
})
