import { mkdirSync, readFileSync } from 'node:fs'
import { test, expect } from './fixtures/test'
import { installGameFixture, body, binding, id } from './fixtures/game'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import type { components } from '../src/contracts'
import { withBootstrapResponse, withReportResponse } from './fixtures/responses'
type S = components['schemas']
const now = 1793486400000
const target: S['MissionDestination4']={type:'Body',id:id(90),expected_owner:id(91),expected_kind:'Planet'}
const coordinates={galaxy:1,system:2,position:8}
const catalog:S['CatalogEntry3'][]=JSON.parse(readFileSync('rules/mvp-v1-slice-13.json','utf8')).catalog
async function expectLayoutAndCapture(page:Parameters<typeof installGameFixture>[0],name:string,width:number) {
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  if (process.env.ORBIT_TEST_SCREENSHOTS !== '1') return
 mkdirSync('test-results/alliance-attacks',{recursive:true})
 await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}))
 await diagnosticScreenshot(page,{path:`test-results/alliance-attacks/${name}-${width}x900.png`,fullPage:true})
}
for (const width of [390,1440]) test(`allied simulation preserves separate technologies ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.clock.setFixedTime(now)
 const units:S['CatalogEntry3'][]=[{key:{kind:'Ship',id:'LightFighter'},body_kinds:['Planet'],requirements:[],enabled:true,mobile:true,ship_statistics:{propulsion:null,combat:{attack_ticks:'5000000',shield_ticks:'1000000',hull_ticks:'40000000',rapid_fire_against:[],rapid_fire_from:[]}}}]
 await installGameFixture(page,{protocol:4,catalog:units,sampledAt:now,missions:{fleets:[],incoming:[],score_value_micro:'0',fleet_slots:'5'}})
 let submitted:S['SimulationInputs']|undefined
 await page.route('**/combat-simulation',async route=>{const r=route.request().postDataJSON();submitted=r.inputs;await route.fulfill({json:{...r.context,profile_hash:'a'.repeat(64),loot_rules_enabled:true,samples:Array.from({length:10},()=>({outcome:'AttackerVictory',rounds:1,attacker:[{item:{kind:'Ship',id:'LightFighter'},count:5}],defender:[],debris: { metal: '18000000', crystal: '6000000', deuterium: '0' }, surviving_cargo_capacity:'250000000',estimated_loot:null}))}})})
 await withBootstrapResponse(page, () => page.goto('/u/andromeda/combat-simulator'))
 await page.getByLabel('Attacker Light Fighter',{exact:true}).fill('2')
 await page.getByRole('button',{name:'Assume all unknown values are zero'}).click()
 await page.getByRole('button',{name:'Add attacking fleet',exact:true}).click()
 const ally=page.getByRole('group',{name:'Allied attacking fleet 1',exact:true})
 await expect(ally.getByLabel('Attacker Weapons Technology',{exact:true})).toHaveValue('')
 await ally.getByLabel('Attacker Weapons Technology',{exact:true}).fill('9')
 await ally.getByLabel('Attacker Shielding Technology',{exact:true}).fill('8')
 await ally.getByLabel('Attacker Armour Technology',{exact:true}).fill('7')
 await ally.getByLabel('Attacker Light Fighter',{exact:true}).fill('3')
 await expectLayoutAndCapture(page,'simulator-contingents',width)
 await page.getByRole('button',{name:'Run 10 battles'}).click()
 await expect(page.getByRole('region',{name:'Simulation results'})).toBeVisible()
 expect(submitted?.attacker.technology).toEqual([0,0,0]);expect(submitted?.attacking_allies?.[0].technology).toEqual([9,8,7])
 await expectLayoutAndCapture(page,'simulator-results',width)
 await ally.getByLabel('Attacker Weapons Technology',{exact:true}).fill('10')
 await expect(page.getByRole('region',{name:'Simulation results'})).toHaveCount(0)
})
for (const width of [390,1440]) test(`group combat reports show individual returns ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.clock.setFixedTime(now)
 await installGameFixture(page,{protocol:4,sampledAt:now,extraCapabilities:['Reports'],playerNames:{[binding.player]:'Commander',[id(91)]:'Orion'}})
 const header={id:id(600),kind:'Combat',observed_at:now,read:true,hidden:false,starred:false,shared:false,fleet_investment:null,defense_investment:null}
 const units=[{item:{kind:'Ship',id:'SmallCargo'},count:'1'}]
 const participants=[{owner:binding.player,origin:{Fleet:id(70)},side:'Attacker',technology:[2,3,4],units,location:{coordinates:body.coordinates,name:'Hades',kind:'Planet'}},{owner:binding.player,origin:{Fleet:id(72)},side:'Attacker',technology:[2,3,4],units,location:{coordinates:{galaxy:1,system:8,position:9},name:'Athena',kind:'Planet'}},{owner:id(91),origin:{Stationed:id(90)},side:'Defender',technology:[1,1,1],units:[],location:{coordinates,name:'Orion',kind:'Planet'}}]
 const zero={metal:'0',crystal:'0',deuterium:'0'}
 await page.route('**/api/v4/**/reports/**',route=>route.fulfill({json:{protocol:4,binding,request_id:route.request().postDataJSON().request_id,viewer_revision:'1',sampled_at:now,as_of_ms:now,data:{header,player_names:{[binding.player]:'Commander',[id(91)]:'Orion'},payload:{kind:'Combat',at:now,target:coordinates,target_name:'Orion',target_kind:'Planet',outcome:'AttackerVictory',participants,rounds:[],survivors:participants.map(({owner,origin,side,units})=>({owner,origin,side,units})),gross_losses:[],recovered:[],permanent_losses:[],debris:zero,loot:{...zero,metal:'2000000000'},own_cargo_loss:zero,own_returns:[{fleet:id(70),origin:body.coordinates,return_at:now+600000,loot:{...zero,metal:'1000000000'}},{fleet:id(72),origin:{galaxy:1,system:8,position:9},return_at:now+120000,loot:{...zero,metal:'1000000000'}}]}}}}))
 await withReportResponse(page, header.id, () => page.goto(`/u/andromeda/b/${body.id}/reports/${header.id}`))
 await expect(page.getByText(/Your fleet to \[1:371:12\] returns/)).toBeVisible()
 await expect(page.getByText(/Your fleet to \[1:8:9\] returns/)).toBeVisible()
 await expectLayoutAndCapture(page,'combat-returns',width)
})

for(const width of [390,1440]) test(`invitation and hostile group visibility ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.clock.setFixedTime(now);await page.emulateMedia({reducedMotion:'reduce'})
 const group:S['AttackGroup4']={id:id(71),revision:1,initiator:id(92),target,coordinates,arrival_at:now+600000,joining_open:true,can_join:true,members:[{owner:id(92),own_fleet:null,ships:[{ship_type:'Cruiser',count:'12'}]}]}
 await installGameFixture(page,{protocol:4,catalog,bodies:[{...body,name:'Hades'}],sampledAt:now,extraCapabilities:['Attack','AllianceAttacks'],attackGroups:[group],missions:{fleets:[],incoming:[{attack_group:id(81),sender:id(93),origin:{galaxy:1,system:3,position:4},target:body.id,mission:'Attack',arrival_at:now+300000,ships:{visibility:'Unknown'}}],fleet_slots:'5',score_value_micro:'0'},playerNames:{[id(92)]:'Cassiopeia',[id(93)]:'Vega'}})
 await withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/fleets`))
 await expect(page.getByRole('region',{name:'Alliance attacks'})).toContainText('Cassiopeia')
 await expect(page.getByRole('button',{name:'Join attack',exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'Invite players',exact:true})).toHaveCount(0)
 const incoming=page.getByRole('article',{name:'Incoming attack fleet'})
 await expect(incoming).toContainText('Alliance attack')
 await expect(incoming).toContainText('Ship composition unknown')
 await expectLayoutAndCapture(page,'invitation-and-incoming',width)
 await page.getByTestId('command-orb').click()
 await expect(page.getByRole('link',{name:'Alliance attack invitations'})).toBeVisible()
 await expectLayoutAndCapture(page,'invitation-hud',width)
})
