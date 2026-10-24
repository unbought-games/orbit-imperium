import {universeSlug} from '../src/client-model/universe-name'
import { test, expect } from '@playwright/test'
import { readFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

test('scout report → attack with lost acknowledgement → incoming → combat → return → harvest', async ({ page, browser }) => {

  const accounts = JSON.parse(readFileSync(process.env.ORBIT_MVP_ACCOUNTS_FILE!, 'utf8'))
  const target = JSON.parse(process.env.ORBIT_RAID_TARGET!)
  const advance = (at: number) => execFileSync('docker', ['compose','exec','-T','db','psql','-U','orbit','-d',process.env.TEST_DB_NAME!,'-c',`UPDATE orbit_test_clock SET at_ms=${at}`], {stdio:'pipe'})
  const login = async (p: typeof page, n: number) => {
    await p.goto('/login')
    await p.getByLabel('Account', {exact:true}).fill(accounts[n].name)
    await p.getByLabel('Password').fill(accounts[n].password)
    await p.getByRole('button', {name:'Sign in',exact:true}).click()
    await expect(p.locator('main h1')).toHaveText(/^Empire —/)
  }
  const auth = async (p=page) => {
    const session=await (await p.request.get('/api/v1/session')).json()
    const u=session.memberships[0].universe
    const binding=(await (await p.request.get(`/api/v4/universes/${u}/binding?request_id=${randomUUID()}`)).json()).binding
    return {u,slug:universeSlug(session.memberships[0].universe_name),binding,headers:{Origin:process.env.ORBIT_TEST_BASE_URL!,'X-CSRF-Token':session.csrf}}
  }
  const view=async(p=page)=>{const a=await auth(p);const r=await p.request.post(`/api/v4/universes/${a.u}/overview`,{headers:a.headers,data:{binding:a.binding,request_id:randomUUID()}});return r.status()===503?null:r.json()}
  const fresh=async(p=page)=>{let result;await expect.poll(async()=>{result=await view(p);return !!result}).toBe(true);return result as Awaited<ReturnType<typeof view>>}
  await page.setViewportSize({width:390,height:844});await login(page,0)
  const a=await auth(),v=await fresh(),origin=v.bodies[0].id
  const go=async(name:string)=>{await page.goto(`/u/${a.slug}/${name}?body=${origin}`);await expect(page.locator('main h1')).toBeVisible()}
  // Separate adversarial branch: a legally dispatched lone probe meets three defending fighters.
  const post=async(path:string,data:unknown)=>page.request.post(`/api/v4/universes/${a.u}/${path}`,{headers:a.headers,data})
  const context=()=>({binding:a.binding,request_id:randomUUID()})
  const destination=(await (await post('world',{context:context(),type:'ResolveDestination',selection:{type:'BodyAt',coordinates:target.coordinates,kind:'Planet'}})).json()).data
  const probeIntent={origin,destination,mission:'Attack',ships:[{owner:a.binding.player,ship_type:'EspionageProbe',count:'1'}],cargo:{metal:'0',crystal:'0',deuterium:'0'},speed_percent:100}
  const probeQuote=(await (await post('world',{context:context(),type:'FleetQuote',intent:probeIntent})).json()).data
  const probeId=randomUUID()
  expect((await post('commands',{gameplay:{protocol:4,binding:a.binding,command_id:probeId,command:{type:'World',action:{type:'LaunchFleet',intent:probeIntent,expected_terms_hash:probeQuote.terms_hash}}},presence:{protocol:4,binding:a.binding,command_id:randomUUID(),command:{type:'World',action:{type:'RecordForegroundPresence',body:origin,cause:'GameplayGesture',paired_command_id:probeId}}}})).status()).toBe(202)
  await expect.poll(async()=>(await view())?.missions.fleets.length??-1).toBe(1)
  const probe=(await fresh()).missions.fleets[0];advance(probe.due_at)
  await expect.poll(async()=>(await view())?.missions.fleets.length??-1).toBe(0)
  await go('reports');await page.getByRole('link',{name:'Combat',exact:true}).first().click()
  await expect(page.getByRole('region',{name:'Report observation'})).toContainText('Contact lost in the first round')
  for(const name of ['Starting forces','Survivors','Defenses recovered','Permanent losses','Debris'])await expect(page.getByRole('heading',{name,exact:true})).toHaveCount(0)
  await expect(page.getByRole('button',{name:'Prepare harvest'})).toHaveCount(0)
  const lostId=new URL(page.url()).pathname.split('/').at(-1)!
  const lost=(await (await post(`reports/${lostId}`,context())).json()).data.payload
  for(const key of ['participants','rounds','survivors','debris','recovered','loot','outcome','return_at'])expect(lost).not.toHaveProperty(key)
  await go('reports')
  await page.getByRole('link',{name:'Espionage',exact:true}).first().click()
  await expect(page.getByRole('button',{name:'Prepare attack',exact:true})).toBeVisible()
  const spyUrl=page.url()
  await page.getByRole('button',{name:'Prepare attack',exact:true}).click()
  await expect(page.locator('main h1')).toHaveText('Dispatch')
  await expect(page.getByRole('combobox',{name:'Mission',exact:true})).toHaveValue('Attack')
  await expect(page.getByLabel('Position',{exact:true})).toHaveValue(String(target.coordinates.position))
  expect((await fresh()).missions.fleets).toHaveLength(0)
  const ship=(name:string)=>page.locator('fieldset label').filter({hasText:`${name} ·`}).locator('input')
  await ship('Light Fighter').fill('60');await ship('Small Cargo').fill('3')
  await page.route('**/api/v4/universes/*/world',async route=>{
    if(route.request().postDataJSON().type==='ResolveDestination'){
      const response=await route.fetch();const data=await response.json();data.data.id=randomUUID();await route.fulfill({response,json:data})
    }else await route.continue()
  })
  await page.getByRole('button',{name:'Review fleet'}).click()
  await expect(page.getByRole('alert').filter({hasText:'observed target has changed'})).toBeVisible()
  await expect(page.getByRole('region',{name:'Fleet quote'})).toHaveCount(0)
  await page.unrouteAll({behavior:'wait'})
  await page.getByLabel('Metal',{exact:true}).fill('10')
  // Malformed input remains a draft, with an accessible error and no launch.
  await page.getByLabel('Metal',{exact:true}).fill('-1');await page.getByRole('button',{name:'Review fleet'}).click()
  await expect(page.getByRole('alert').filter({hasText:'whole nonnegative'})).toBeVisible()
  await page.getByLabel('Metal',{exact:true}).fill('10')
  let release!:()=>void;const held=new Promise<void>(r=>{release=r});let pending=false
  await page.route('**/api/v4/universes/*/world',async route=>{if(route.request().postDataJSON().type==='FleetQuote'){pending=true;await held}await route.continue()})
  await page.getByRole('button',{name:'Review fleet'}).click();await expect.poll(()=>pending).toBe(true)
  await expect(page.getByRole('button',{name:'Reviewing…'})).toBeDisabled();release();await page.unrouteAll({behavior:'wait'})
  await expect(page.getByRole('region',{name:'Fleet quote'})).toBeVisible()
  await expect(page.getByRole('region',{name:'Fleet quote'})).toBeFocused()
  const screenshots = `${process.env.ORBIT_TEST_OUTPUT_DIR ?? 'test-results/browser-raiding'}/screenshots`
  mkdirSync(screenshots,{recursive:true})
  for(const [width,height] of [[320,800],[360,800],[390,844],[768,1024],[1440,900],[844,390]]){
    await page.setViewportSize({width,height})
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await page.screenshot({path:`${screenshots}/dispatch-${width}.png`,fullPage:true})
  }
  let pair: {gameplay:{command_id:string};presence:{command_id:string}}|undefined
  await page.route('**/api/v4/universes/*/commands',async route=>{const data=route.request().postDataJSON();if(data.gameplay?.command.action?.type==='LaunchFleet'){await route.fetch();pair=data;await route.abort('failed')}else await route.continue()})
  await page.getByRole('button',{name:/^Send /,exact:false}).focus();await page.keyboard.press('Enter')
  await expect.poll(()=>!!pair).toBe(true);await page.unrouteAll({behavior:'wait'});await page.reload()
  await expect.poll(async()=>(await view())?.missions.fleets.length??-1).toBe(1)
  const stored=await page.evaluate(id=>Object.entries(sessionStorage).filter(([k])=>k.startsWith('orbit:attempts:v4:')).map(([,v])=>JSON.parse(v)).find(x=>x.envelope.command_id===id)?.envelope,pair!.gameplay.command_id)
  expect(stored.presence).toEqual(pair!.presence)
  await go('fleets');await expect(page.getByRole('button',{name:'Review recall'})).toBeVisible()
  const defenderContext=await browser.newContext();const defender=await defenderContext.newPage();await defender.setViewportSize({width:360,height:800});await login(defender,1)
  const da=await auth(defender),dv=await fresh(defender)
  await defender.goto(`/u/${da.slug}/fleets?body=${dv.bodies[0].id}`)
  await expect(defender.locator('main')).toContainText('Attack')
  await expect(defender.locator('main')).toContainText('Types unknown')
  await defender.screenshot({path:`${screenshots}/incoming-360.png`,fullPage:true})
  // Defender can still inspect ordinary defense/manufacture controls while incoming.
  await defender.goto(`/u/${da.slug}/b/${dv.bodies[0].id}/defense`)
  await expect(defender.locator('main')).toContainText('Rocket Launcher')
  await defender.screenshot({path:`${screenshots}/defense-360.png`,fullPage:true})
  const launched=(await fresh()).missions.fleets[0];advance(launched.due_at)
  await expect.poll(async()=>(await view())?.missions.fleets[0]?.leg).toBe('Returning')
  await go('reports');await page.getByRole('link',{name:'Combat',exact:true}).first().click()
  await expect(page.getByRole('region',{name:'Report observation'})).toContainText('Victory')
  await expect(page.getByRole('region',{name:'Report observation'})).toContainText('Survivors return')
  const reportUrl=page.url(),reportId=new URL(reportUrl).pathname.split('/').at(-1)!
  const detail=async()=>{const r=await page.request.post(`/api/v4/universes/${a.u}/reports/${reportId}`,{headers:a.headers,data:{binding:a.binding,request_id:randomUUID()}});return r.status()===503?null:r.json()}
  const freshDetail=async()=>{let result;await expect.poll(async()=>{result=await detail();return !!result}).toBe(true);return result as Awaited<ReturnType<typeof detail>>}
  const historical=(await freshDetail()).data.payload
  expect(historical.mission).toBe('Attack');expect(historical).not.toHaveProperty('resources');expect(historical).not.toHaveProperty('rng')
  for(const [width,height] of [[320,800],[360,800],[390,844],[768,1024],[1440,900],[844,390]]){
    await page.setViewportSize({width,height})
    const rounds=page.locator('main details');if(await rounds.count())await rounds.first().evaluate(el=>{el.setAttribute('open','')})
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await page.screenshot({path:`${screenshots}/combat-${width}.png`,fullPage:true})
  }
  await page.getByRole('button',{name:'Mark read',exact:true}).click();await expect.poll(async()=>(await detail())?.data.header.read).toBe(true)
  await page.getByRole('button',{name:'Delete report',exact:true}).click();await expect.poll(async()=>(await detail())?.data.header.hidden).toBe(true)
  expect((await freshDetail()).data.payload).toEqual(historical)
  const returning=(await fresh()).missions.fleets[0];advance(returning.due_at);await expect.poll(async()=>(await view())?.missions.fleets.length??-1).toBe(0)
  await page.getByRole('button',{name:'Prepare harvest',exact:true}).click()
  await expect(page.getByRole('combobox',{name:'Mission',exact:true})).toHaveValue('Harvest');await ship('Recycler').fill('1')
  await page.getByRole('button',{name:'Review fleet'}).click();await expect(page.getByRole('region',{name:'Fleet quote'})).toBeVisible();await page.getByRole('button',{name:/^Send /,exact:false}).click()
  await expect.poll(async()=>(await view())?.missions.fleets.length??-1).toBe(1)
  const collector=(await fresh()).missions.fleets[0];advance(collector.due_at);await expect.poll(async()=>(await view())?.missions.fleets[0]?.leg).toBe('Returning')
  const collected=(await fresh()).missions.fleets[0];expect(BigInt(collected.cargo.metal)+BigInt(collected.cargo.crystal)).toBeGreaterThan(0n);advance(collected.due_at);await expect.poll(async()=>(await view())?.missions.fleets.length??-1).toBe(0)
  await page.goto(reportUrl);await expect(page.getByRole('region',{name:'Report observation'})).toBeVisible();expect((await freshDetail()).data.payload).toEqual(historical)
  await page.context().setOffline(true);await expect(page.reload()).rejects.toThrow();await page.context().setOffline(false);await page.goto(reportUrl);await expect(page.getByRole('region',{name:'Report observation'})).toBeVisible()
  await page.goto(spyUrl);await page.goBack();await expect(page).toHaveURL(reportUrl)
  const tab=await page.context().newPage();await tab.goto(reportUrl);await expect(tab.getByRole('region',{name:'Report observation'})).toBeVisible();await tab.close()
  await defenderContext.close()
})

test('zero-debris combat reports do not offer a harvest shortcut', async ({page})=>{
  const accounts=JSON.parse(readFileSync(process.env.ORBIT_MVP_ACCOUNTS_FILE!,'utf8'))
  await page.goto('/login');await page.getByLabel('Account',{exact:true}).fill(accounts[0].name);await page.getByLabel('Password').fill(accounts[0].password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.locator('main h1')).toHaveText(/^Empire —/)
  const session=await (await page.request.get('/api/v1/session')).json(),u=session.memberships[0].universe
  const binding=(await (await page.request.get(`/api/v4/universes/${u}/binding?request_id=${randomUUID()}`)).json()).binding
  const headers={Origin:process.env.ORBIT_TEST_BASE_URL!,'X-CSRF-Token':session.csrf}
  const post=async(path:string,data:unknown)=>(await page.request.post(`/api/v4/universes/${u}/${path}`,{headers,data})).json()
  const context=()=>({binding,request_id:randomUUID()})
  const view=await post('overview',context())
  const reports=await post('reports',{context:context(),cursor:null,kind:'Combat',limit:100,include_hidden:true})
  let reportId:string|undefined
  for(const report of reports.data.items){const detail=await post(`reports/${report.id}`,context());if(detail.data.payload.kind==='Combat'){reportId=report.id;break}}
  expect(reportId).toBeTruthy()
  // Fixture only: render the real authorized report schema with the empty-planet/defense-only debris outcome.
  await page.route('**/api/v4/universes/*/reports/*',async route=>{const response=await route.fetch();const data=await response.json();data.data.payload.debris={metal:'0',crystal:'0',deuterium:'0'};await route.fulfill({response,json:data})})
  await page.goto(`/u/${universeSlug(session.memberships[0].universe_name)}/reports/${reportId}?body=${view.bodies[0].id}`)
  await expect(page.getByRole('region',{name:'Report observation'})).toBeVisible()
  await expect(page.getByRole('button',{name:'Prepare harvest',exact:true})).toHaveCount(0)
  await page.unrouteAll({behavior:'wait'})
})
