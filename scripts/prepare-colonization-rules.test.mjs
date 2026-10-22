import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {prepareImpulseRules} from './prepare-impulse-rules.mjs'
import {prepareAstrophysicsRules} from './prepare-astrophysics-rules.mjs'
import {prepareColonizationRules} from './prepare-colonization-rules.mjs'
const exported = () => prepareAstrophysicsRules(prepareImpulseRules({universe:'beta',base_revision:7,speed:5,artifact:JSON.parse(fs.readFileSync(new URL('../rules/mvp-v1-slice-5.json',import.meta.url)))}))
test('colony activation preserves custom rules and is idempotent',()=>{
 const before=exported();before.artifact.base_income[0]=47
 const saved=structuredClone(before),after=prepareColonizationRules(before)
 assert.deepEqual(before,saved)
 assert.deepEqual(prepareColonizationRules(after),after)
 assert.equal(after.universe,'beta');assert.equal(after.base_revision,7);assert.equal(after.speed,5)
 assert.equal(after.artifact.base_income[0],47)
 assert.equal(after.artifact.world.colonization.profile,'oi-redesign-reconstructed-v1')
 assert.deepEqual(after.artifact.ships.ColonyShip,{drive:'ImpulseDrive',base_speed:2500,drive_coefficient:[1,5],fuel:1000,capacity:7500})
 for(const key of Object.keys(before.artifact.ships))assert.deepEqual(after.artifact.ships[key],before.artifact.ships[key])
 assert.deepEqual(after.artifact.progression.research,before.artifact.progression.research)
 assert.equal(after.artifact.progression.unit_costs.length,before.artifact.progression.unit_costs.length+1)
 assert.equal(after.artifact.world.combat.units.length,before.artifact.world.combat.units.length+1)
})
test('colony patch requires the complete enabled research chain',()=>{
 assert.throws(()=>prepareColonizationRules({}),/world rules export/)
 for(const id of ['ImpulseDrive','Astrophysics'])for(const missing of [true,false]){
  const doc=exported()
  if(missing)delete doc.artifact.progression.research[id]
  else doc.artifact.catalog.find(e=>e.key.id===id).enabled=false
  assert.throws(()=>prepareColonizationRules(doc),new RegExp(`Enable ${id}`))
 }
})
