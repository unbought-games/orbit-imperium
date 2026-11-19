import { installReportReadReceipt, fixtureReportContext, fixtureReportPath } from './fixtures/game'
import { refuseFixtureReads } from './fixtures/game'


import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect } from './fixtures/test'
import { installGameFixture, shellFixture, body, binding, id } from './fixtures/game'
import type { components } from '../src/contracts'
import { withReportResponse } from './fixtures/responses'
type S = components['schemas']
const coords = {galaxy:1,system:371,position:8}
const colony: S['BodyV3'] = {...body,id:id(90),coordinates:coords,fields:230,fields_used:0,fields_reserved:0,levels:Object.fromEntries(Object.keys(body.levels).map(k=>[k,0])),inventories:[],colony:{diameter_km:15191,min_temperature:24,max_temperature:64,created_at:1000,profile:'oi-redesign-reconstructed-v1'}}
const catalog: S['CatalogEntry3'][] = [
 {key:{kind:'Ship',id:'ColonyShip'},body_kinds:['Planet'],enabled:true,mobile:true,requirements:[{type:'BodyBuilding',building:'Shipyard',level:4},{type:'PlayerResearch',research:'ImpulseDrive',level:3}]},
 {key:{kind:'Ship',id:'SmallCargo'},body_kinds:['Planet'],enabled:true,mobile:true,requirements:[]},
]
const fixtureOptions = (bodies = [body], astrophysics = 1): Parameters<typeof shellFixture>[1] => ({protocol:4,bodies,catalog,research:[{research:'Astrophysics',level:astrophysics}],extraCapabilities:['Colonize','Deploy','Transport'],missions:{fleets:[],incoming:[],score_value_micro:'0',fleet_slots:'2'}})

const bound = (request_id:string,data:unknown)=>({protocol:4,binding,request_id,viewer_revision:'1',sampled_at:Date.now(),as_of_ms:Date.now(),data})


for(const success of [true])test(`colonization ${success?'success links to a usable colony':'failure explains conserved return'}`,async({page})=>{
 refuseFixtureReads(page, { progression: ['Upgrade'] })
 await installGameFixture(page,fixtureOptions(success?[body,colony]:[body]))
 const kind=success?'Colonized':'ColonizationFailed'
 const payload=success?{kind,body:colony.id,fleet:id(80),origin:body.id,destination_coordinates:coords,at:1000,fields:230,diameter_km:15191,min_temperature:24,max_temperature:64,resources:{metal:'1500000000',crystal:'500000000',deuterium:'0'},return_at:null}
 :{kind,reason:'Occupied',fleet:id(80),origin:body.id,destination_coordinates:coords,at:1000,return_at:120000}
 const header = {id:id(81),kind,observed_at:1000,read:false,hidden:false}
 await installReportReadReceipt(page, header)
 await page.route(url => url.pathname === fixtureReportPath(header.id),async route=>{
  const request=fixtureReportContext(route, header.id)
  await route.fulfill({json:bound(request.request_id,{header,payload})})
 })
 await withReportResponse(page, id(81), () => page.goto(`/u/andromeda/b/${body.id}/reports/${id(81)}`))
 const report=page.getByRole('region',{name:'Report observation'})
 await expect(report).toContainText(success?'Colony established':'The position was occupied')
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 }
 await diagnosticScreenshot(page, {path:`test-results/colony-${success?'success':'failure'}.png`,fullPage:true})
 if(success){
  await expect(report).toContainText('230 fields')
  await page.getByRole('link',{name:'Open colony resources'}).click()
  await expect(page).toHaveURL(new RegExp(`/b/${colony.id}/resources`))
  await expect(page.locator('main h1')).toContainText('Resources')
 }else await expect(report).toContainText('All ships and cargo return')
})
