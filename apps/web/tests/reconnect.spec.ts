import {foreground,signOut} from './fixtures/navigation'
import {test,expect} from '@playwright/test'
import {execFileSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {overview} from './v2'
import type {Attempt} from '../src/client-model/commands'
const sql=(query:string)=>execFileSync('docker',['compose','exec','-T','db','psql','-U','orbit','-d',process.env.TEST_DB_NAME!,'-c',query],{stdio:'pipe'})
test('lost POST acknowledgement survives refresh with one durable identity',async({page})=>{
 // Isolate lost acknowledgments from the independent SSE outcome channel.
 await page.route('**/updates?epoch=*', route=>route.fulfill({status:503,body:''}));
 await page.goto('/login');await page.getByLabel('Account',{exact:true}).fill('alpha');await page.getByLabel('Password').fill(process.env.ALPHA_PASSWORD!);await page.getByRole('button',{name:'Sign in',exact:true}).click()
 const ids:string[]=[]
 let originalEnvelope:unknown
 const saved=()=>page.evaluate(()=>Object.entries(sessionStorage).filter(([key])=>key.startsWith('orbit:attempts:v2:')).map(([,value])=>JSON.parse(value) as Attempt))
 const attention=page.getByRole('complementary',{name:'Action needs attention',exact:true})
 const construction=page.getByRole('heading',{name:'Construction in progress',exact:true})
 await page.route('**/commands',async route=>{originalEnvelope=route.request().postDataJSON();ids.push(route.request().postDataJSON().command_id);await route.fetch();await route.abort('failed')})
 await page.route('**/commands/*?epoch=*',route=>route.fulfill({status:503,contentType:'application/problem+json',body:JSON.stringify({type:'about:blank',status:503,code:'Unavailable'})}))
 await page.getByRole('button',{name:'Upgrade Crystal Mine',exact:true}).click();await page.getByRole('button',{name:'Confirm upgrade'}).click();await expect(attention).toContainText('Response uncertain. Your action is saved.')
 await expect.poll(async()=>(await saved()).filter(a=>a.status==='uncertain').length).toBe(1)
 await page.reload();await expect(construction).toContainText('Construction in progress');await expect(attention.getByRole('button',{name:'Resolve saved command',exact:true})).toBeVisible()
 const restored=await saved();expect(restored).toHaveLength(1);expect(restored[0].envelope).toEqual(originalEnvelope);expect(restored[0].envelope.command_id).toBe(ids[0]);expect(restored[0].status).toBe('uncertain')
 await page.unroute('**/commands/*?epoch=*')
 await expect.poll(async()=>(await saved()).filter(a=>a.envelope.command_id===ids[0]&&a.status==='committed'&&a.reconciled).length).toBe(1)
 await expect(attention).toHaveCount(0);expect(ids).toHaveLength(1);expect(new Set(ids).size).toBe(1)
 const confirmed=await overview(page.request);expect(confirmed.constructions).toHaveLength(1);expect(confirmed.constructions[0].building).toBe('CrystalMine')
 await page.unroute('**/commands');await page.getByRole('button',{name:'Cancel construction · full refund',exact:true}).click();await expect(construction).toHaveCount(0)
 await expect.poll(async()=>(await overview(page.request)).constructions.length).toBe(0)
})
test('malformed responses preserve the last validated private view',async({page})=>{
 await page.goto('/login');await page.getByLabel('Account',{exact:true}).fill('beta');await page.getByLabel('Password').fill(process.env.BETA_PASSWORD!);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:/^Overview —/,exact:true})).toBeVisible()
 await page.route('**/overview',async route=>{const response=await route.fetch();const body=await response.json();body.bodies[0].amounts.metal='-999';await route.fulfill({response,json:body})})
 await foreground(page)
 await expect(page.getByRole('alert').filter({hasText:'Connection interrupted — awaiting server confirmation.'})).toBeVisible();await expect(page.getByText('-999',{exact:true})).toHaveCount(0);await expect(page.getByRole('heading',{level:1}).filter({hasText:'Planet [1:1:9]'})).toBeVisible();await page.unrouteAll({behavior:'wait'})
})
test('a wrong-principal first overview is never rendered or activated',async({page})=>{
 await page.route('**/api/v1/session?bootstrap=true',async route=>{const response=await route.fetch();const body=await response.json();body.result.game.snapshot.view.binding.player='22222222-2222-4222-8222-222222222222';await route.fulfill({response,json:body})})
 await page.goto('/login');await page.getByLabel('Account',{exact:true}).fill('alpha');await page.getByLabel('Password').fill(process.env.ALPHA_PASSWORD!);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByText('Unable to prepare your game. Please retry.')).toBeVisible();await expect(page.getByRole('heading',{name:/^Overview —/,exact:true})).toHaveCount(0);await page.unrouteAll({behavior:'wait'});await page.getByRole('button',{name:'Retry connection'}).click();await expect(page.getByRole('heading',{name:/^Overview —/,exact:true})).toBeVisible()
})
test('real epoch change after bootstrap rebinds without replay',async({page})=>{
 let changed=false,rediscovered=false
 page.on('request',r=>{if(r.url().includes('/binding?'))rediscovered=true})
 await page.route('**/api/v1/session?bootstrap=true',async route=>{const response=await route.fetch();const payload=await response.json();const candidate=payload.result.game.snapshot.candidate;if(!changed){changed=true;sql(`UPDATE universes SET epoch='${randomUUID()}' WHERE id='${candidate.binding.universe}'`)}await route.fulfill({response,json:payload})})
 await page.goto('/login');await page.getByLabel('Account',{exact:true}).fill('alpha');await page.getByLabel('Password').fill(process.env.ALPHA_PASSWORD!);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:/^Overview —/,exact:true})).toBeVisible();expect(changed).toBe(true);await foreground(page);await expect.poll(()=>rediscovered).toBe(true);await expect(page.getByRole('heading',{name:/^Overview —/,exact:true})).toBeVisible();await page.unrouteAll({behavior:'wait'})
 const current=await overview(page.request);expect(current.protocol).toBe(2);await signOut(page);await page.getByLabel('Account',{exact:true}).fill('beta');await page.getByLabel('Password').fill(process.env.BETA_PASSWORD!);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{level:1}).filter({hasText:'Planet [1:1:9]'})).toBeVisible();await expect(page.getByRole('heading',{level:1}).filter({hasText:'Planet [1:1:8]'})).toHaveCount(0)
})
