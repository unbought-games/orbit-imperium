import { test, expect } from '@playwright/test'
import { shellFixture, body, binding, id } from './fixtures/game'
import type { components } from '../src/contracts'
type S = components['schemas']
const coords = {galaxy:1,system:371,position:8}
const colony: S['BodyV3'] = {...body,id:id(90),coordinates:coords,fields:230,fields_used:0,fields_reserved:0,levels:Object.fromEntries(Object.keys(body.levels).map(k=>[k,0])),inventories:[],colony:{diameter_km:15191,min_temperature:24,max_temperature:64,created_at:1000,profile:'oi-redesign-reconstructed-v1'}}
const catalog: S['CatalogEntry3'][] = [
 {key:{kind:'Ship',id:'ColonyShip'},body_kinds:['Planet'],enabled:true,mobile:true,requirements:[{type:'BodyBuilding',building:'Shipyard',level:4},{type:'PlayerResearch',research:'ImpulseDrive',level:3}]},
 {key:{kind:'Ship',id:'SmallCargo'},body_kinds:['Planet'],enabled:true,mobile:true,requirements:[]},
]
async function setup(page: Parameters<typeof shellFixture>[0], bodies = [body], astrophysics = 1) {
 await shellFixture(page,{protocol:4,bodies,catalog,research:[{research:'Astrophysics',level:astrophysics}],extraCapabilities:['Colonize','Deploy','Transport'],missions:{fleets:[],incoming:[],score_value_micro:'0',fleet_slots:'2'}})
}
const bound = (request_id:string,data:unknown)=>({protocol:4,binding,request_id,viewer_revision:'1',sampled_at:Date.now(),as_of_ms:Date.now(),data})
const emptyGalaxy = (galaxy: number, system: number): S['GalaxySystem4'] => ({
  galaxy, system, observed_at: Date.now(),
  positions: Array.from({ length: 15 }, (_, index) => ({
    coordinates: { galaxy, system, position: index + 1 }, body: null, debris: null,
  })),
})

test('colony position gates and full-capacity warning lead to an empty-position quote and one launch',async({page})=>{
 const source={...body,inventories:[...body.inventories,{item:{kind:'Ship' as const,id:'ColonyShip' as const},count:'2'}]}
 await setup(page,[source,colony])
 let sent:unknown=null, launches=0
 await page.route('**/world',async route=>{
  const request=route.request().postDataJSON()
  let data:unknown
  if(request.type==='Galaxy')data=emptyGalaxy(request.galaxy,request.system)
  else if(request.type==='ResolveDestination'){
   expect(request.selection.type).toBe('EmptyPositionAt')
   data={type:'EmptyPosition',coordinates:request.selection.coordinates,slot_revision:'0'}
  }else{
   expect(request.type).toBe('FleetQuote')
   data={intent:request.intent,profile_hash:'a'.repeat(64),terms_hash:'b'.repeat(64),distance:1020,speeds:[['ColonyShip','4000'],['SmallCargo','5000']],duration_ms:120000,fuel:'100000000',capacity:'20000000000',maximum_payload:'19900000000',slot_limit:'2'}
  }
  await route.fulfill({json:bound(request.context.request_id,data)})
 })
 await page.route('**/commands',async route=>{
  const pair=route.request().postDataJSON()
  sent=pair.gameplay.command;launches++
  await route.fulfill({json:{protocol:4,binding,command_id:pair.gameplay.command_id,admitted_at:Date.now(),executed_at:Date.now(),status:'Committed',result_ids:[id(80)],minimum_viewer_revision:'1'}})
 })
 await page.goto(`/u/andromeda/b/${body.id}/galaxy`)
 const cards=page.getByRole('region',{name:'Galaxy positions'}).getByRole('listitem')
 const lockedSlot=cards.nth(2).locator('summary')
 await expect(lockedSlot).toBeVisible()
 expect((await lockedSlot.boundingBox())!.height).toBeGreaterThanOrEqual(44)
 expect((await lockedSlot.boundingBox())!.height).toBeLessThanOrEqual(46)
 await lockedSlot.click()
 await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/galaxy`)
 await cards.nth(2).getByRole('button',{name:'Colonize',exact:true}).click()
 await expect(page.getByRole('combobox',{name:'Mission',exact:true})).toHaveValue('Colonize')
 await expect(page.getByRole('status').filter({hasText:'Astrophysics level 4'}).first()).toBeVisible()
 await expect(page.getByRole('button',{name:'Review fleet',exact:true})).toBeDisabled()
 await page.goto(`/u/andromeda/b/${body.id}/galaxy`)
 await cards.nth(3).locator('summary').click()
 await cards.nth(3).getByRole('button',{name:'Colonize',exact:true}).click()
 await expect(page.getByRole('combobox',{name:'Mission',exact:true})).toHaveValue('Colonize')
 await expect(page.getByRole('status').filter({hasText:'Planets:'})).toContainText('2 / 2')
 await page.getByRole('textbox',{name:'Colony Ship · 2 available'}).fill('2')
 await page.getByRole('textbox',{name:'Small Cargo · 2 available'}).fill('1')
 await page.getByRole('textbox',{name:'Metal',exact:true}).fill('1000')
 await page.getByRole('button',{name:'Review fleet',exact:true}).click()
 const quote=page.getByRole('region',{name:'Fleet quote'})
 await expect(quote).toContainText('2 Colony Ship')
 await quote.getByRole('button',{name:/Send/}).click()
 await expect.poll(()=>launches).toBe(1)
 expect(sent).toMatchObject({type:'World',action:{type:'LaunchFleet',intent:{mission:'Colonize',destination:{type:'EmptyPosition',coordinates:{galaxy:1,system:371,position:4},slot_revision:'0'},cargo:{metal:'1000000000',crystal:'0',deuterium:'0'}},expected_terms_hash:'b'.repeat(64)}})
 await page.reload()
 await expect(page.getByRole('combobox',{name:'Mission',exact:true})).toBeVisible()
 expect(launches).toBe(1)
})

for(const success of [true,false])test(`colonization ${success?'success links to a usable colony':'failure explains conserved return'}`,async({page})=>{
 await setup(page,success?[body,colony]:[body])
 const kind=success?'Colonized':'ColonizationFailed'
 const payload=success?{kind,body:colony.id,fleet:id(80),origin:body.id,destination_coordinates:coords,at:1000,fields:230,diameter_km:15191,min_temperature:24,max_temperature:64,resources:{metal:'1500000000',crystal:'500000000',deuterium:'0'},return_at:null}
 :{kind,reason:'Occupied',fleet:id(80),origin:body.id,destination_coordinates:coords,at:1000,return_at:120000}
 await page.route(`**/reports/${id(81)}`,async route=>{
  const request=route.request().postDataJSON()
  await route.fulfill({json:bound(request.request_id,{header:{id:id(81),kind,observed_at:1000,read:false,hidden:false},payload})})
 })
 await page.goto(`/u/andromeda/reports/${id(81)}?body=${body.id}`)
 const report=page.getByRole('region',{name:'Report observation'})
 await expect(report).toContainText(success?'Colony established':'The position was occupied')
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 }
 await page.screenshot({path:`test-results/colony-${success?'success':'failure'}.png`,fullPage:true})
 if(success){
  await expect(report).toContainText('230 fields')
  await page.getByRole('link',{name:'Open colony resources'}).click()
  await expect(page).toHaveURL(new RegExp(`/b/${colony.id}/resources`))
  await expect(page.locator('main h1')).toContainText('Resources')
 }else await expect(report).toContainText('All ships and cargo return')
})


test('occupied colony positions retain the actionable error through shared dispatch validation', async ({ page }) => {
  const source = { ...body, inventories: [{ item: { kind: 'Ship' as const, id: 'ColonyShip' as const }, count: '1' }] }
  await setup(page, [source])
  let resolved = 0
  let observed = 0
  await page.route('**/world', async route => {
    const request = route.request().postDataJSON()
    if (request.type === 'Galaxy') {
      observed++
      return route.fulfill({ json: bound(request.context.request_id, emptyGalaxy(request.galaxy, request.system)) })
    }
    expect(request.type).toBe('ResolveDestination')
    expect(request.selection.type).toBe('EmptyPositionAt')
    resolved++
    await route.fulfill({ status: 422, json: { type: 'about:blank', status: 422, code: 'GameRejected', game_code: 'PositionOccupied' } })
  })
  await page.goto(`/u/andromeda/b/${body.id}/dispatch`)
  await expect.poll(() => observed).toBe(1)
  await page.getByRole('combobox', { name: 'Mission', exact: true }).selectOption('Colonize')
  await page.getByLabel('Position', { exact: true }).fill('8')
  await page.getByRole('textbox', { name: 'Colony Ship · 1 available' }).fill('1')
  await page.getByRole('button', { name: 'Review fleet', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('This position is occupied. Choose an empty position.')
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(0)
  expect(resolved).toBe(1)
})


test('dispatch blocks a known locked colony position and enables an eligible position', async ({ page }) => {
  await setup(page)
  const requests: string[] = []
  page.on('request', request => {
    if (request.url().endsWith('/world')) requests.push(request.postDataJSON().type)
  })
  await page.goto(`/u/andromeda/b/${body.id}/dispatch`)
  await page.getByRole('combobox', { name: 'Mission', exact: true }).selectOption('Colonize')
  await page.getByLabel('Position', { exact: true }).fill('3')
  await expect(page.getByRole('status').filter({ hasText: 'Planets:' })).toContainText('Astrophysics level 4 is required for this position.')
  await expect(page.getByRole('button', { name: 'Review fleet', exact: true })).toBeDisabled()
  await page.getByLabel('Position', { exact: true }).fill('4')
  await expect(page.getByRole('button', { name: 'Review fleet', exact: true })).toBeEnabled()
  expect(requests).not.toContain('ResolveDestination')
  expect(requests).not.toContain('FleetQuote')
})

test('authoritative colony quote rejection explains the position research requirement', async ({ page }) => {
  const source = { ...body, inventories: [{ item: { kind: 'Ship' as const, id: 'ColonyShip' as const }, count: '1' }] }
  // The client snapshot allows the position, but the server still owns eligibility.
  await setup(page, [source], 4)
  const requests: string[] = []
  await page.route('**/world', async route => {
    const request = route.request().postDataJSON()
    requests.push(request.type)
    if (request.type === 'Galaxy') {
      return route.fulfill({ json: bound(request.context.request_id, emptyGalaxy(request.galaxy, request.system)) })
    }
    if (request.type === 'ResolveDestination') {
      await route.fulfill({ json: bound(request.context.request_id, { type: 'EmptyPosition', coordinates: request.selection.coordinates, slot_revision: '0' }) })
    } else {
      expect(request.type).toBe('FleetQuote')
      await route.fulfill({ status: 422, json: { type: 'about:blank', status: 422, code: 'GameRejected', game_code: 'PrerequisiteMissing' } })
    }
  })
  await page.goto(`/u/andromeda/b/${body.id}/dispatch`)
  await expect.poll(() => requests).toEqual(['Galaxy'])
  await page.getByRole('combobox', { name: 'Mission', exact: true }).selectOption('Colonize')
  await page.getByLabel('Position', { exact: true }).fill('3')
  await page.getByRole('textbox', { name: 'Colony Ship · 1 available' }).fill('1')
  await page.getByRole('button', { name: 'Review fleet', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Astrophysics level 4 is required for this position.')
  await expect(page.getByRole('alert')).not.toContainText('connection')
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(0)
  expect(requests).toEqual(['Galaxy', 'ResolveDestination', 'FleetQuote'])
})
