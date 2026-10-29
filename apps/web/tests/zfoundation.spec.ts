import { selectBody } from './fixtures/body-selector'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import {foreground} from './fixtures/navigation'
import {test,expect} from './fixtures/test'
import {execFileSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {overview} from './v2'
import type {Attempt} from '../src/client-model/commands'
test('two bodies retain independent pending actions through keyboard switching and reload',async({page})=>{
 // Isolate lost acknowledgments from the independent SSE outcome channel.
 await page.route('**/updates?epoch=*', route=>route.fulfill({status:503,body:''}));
 await page.setViewportSize({width:390,height:844});await page.goto('/login');await page.getByLabel('Account',{exact:true}).fill('alpha');await page.getByLabel('Password').fill(process.env.ALPHA_PASSWORD!);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:/^Empire —/,exact:true})).toBeVisible()
 const view=await overview(page.request),source=view.bodies[0].id,body=randomUUID(),b=view.binding
 execFileSync('docker',['compose','exec','-T','db','psql','-U','orbit','-d',process.env.TEST_DB_NAME!,'-c',`INSERT INTO bodies SELECT '${body}',universe,owner,kind,galaxy,system,10,fields,max_temperature,amounts,carry,checkpoint_at,revision FROM bodies WHERE id='${source}'; INSERT INTO legacy_body_capacities(body,capacity) SELECT '${body}',capacity FROM legacy_body_capacities WHERE body='${source}'; INSERT INTO building_levels SELECT '${body}',building,level FROM building_levels WHERE body='${source}'; INSERT INTO collection_heads(universe,kind,key) VALUES('${b.universe}','constructions','${body}'),('${b.universe}','inventory:${b.player}','${body}');`],{stdio:'pipe'})
 await foreground(page)
 await page.getByRole('combobox', { name: 'Selected body' }).click()
 await expect(page.getByRole('option').and(page.locator(`[data-value="${body}"]`))).toHaveCount(1)
 await page.keyboard.press('Escape')
 const sent:string[]=[]
 const attention=page.getByRole('complementary',{name:'Action needs attention',exact:true})
 const saved=()=>page.evaluate(()=>Object.entries(sessionStorage).filter(([key])=>key.startsWith('orbit:attempts:v2:')).map(([,value])=>JSON.parse(value) as Attempt))
 await page.route('**/commands',async route=>{sent.push(route.request().postDataJSON().command_id);await route.fetch();await route.abort('failed')})
 await page.route('**/commands/*?epoch=*',route=>route.fulfill({status:503,contentType:'application/problem+json',body:JSON.stringify({type:'about:blank',status:503,code:'Unavailable'})}))
 await selectBody(page, source);await page.getByRole('button',{name:'Upgrade Crystal Mine',exact:true}).click();await page.getByRole('button',{name:'Confirm upgrade'}).click();await expect(attention).toContainText('We’re checking whether this order went through.');await expect.poll(async()=>(await saved()).filter(a=>a.status==='uncertain').length).toBe(1)
 const selector = page.getByRole('combobox', { name: 'Selected body' })
 await selector.focus()
 await page.keyboard.press('Enter')
 await expect(page.getByRole('listbox')).toBeVisible()
 await page.keyboard.press('Home')
 if (await page.getByRole('option').first().getAttribute('data-value') !== body) await page.keyboard.press('End')
 await expect(page.getByRole('option').and(page.locator(`[data-value="${body}"]`))).toBeFocused()
 await page.keyboard.press('Enter')
 await expect(selector).toHaveAttribute('data-value', body)

 await page.getByRole('button',{name:'Upgrade Crystal Mine',exact:true}).click();await page.getByRole('button',{name:'Confirm upgrade'}).click();await expect(attention).toHaveCount(1);await expect(attention).toContainText('2 actions need attention.');await expect.poll(async()=>(await saved()).filter(a=>a.status==='uncertain').length).toBe(2)
 const keys=await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('orbit:attempts:v2:')));expect(keys).toHaveLength(2);expect(new Set(sent).size).toBe(2)
 await page.reload();await expect(attention).toHaveCount(1);await expect(attention).toContainText('2 actions need attention.');await expect.poll(async()=>(await saved()).filter(a=>a.status==='uncertain').length).toBe(2);await expect(page.getByRole('heading',{name:'Active fleets',exact:true})).toHaveCount(1);await expect(page.getByRole('heading',{name:'Recent reports',exact:true})).toHaveCount(1)
 await page.unrouteAll({behavior:'wait'});await expect.poll(async()=>(await saved()).filter(a=>sent.includes(a.envelope.command_id)&&a.status==='committed'&&a.reconciled).length).toBe(2);await expect(attention).toHaveCount(0);expect(sent).toHaveLength(2);expect(new Set(sent).size).toBe(2)
 await expect.poll(async()=>(await overview(page.request)).constructions.map((work:{body:string})=>work.body).sort()).toEqual([source,body].sort())
 await expect(page.getByText('Research actions: unavailable in this universe.')).toBeVisible();await expect(page.getByText('Manufacturing actions: unavailable in this universe.')).toBeVisible();await diagnosticScreenshot(page, {path:'target/foundation-mobile.png',fullPage:true})
 await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('dialog').getByRole('link',{name:'Settings',exact:true}).click();await expect(page.getByRole('heading',{name:'Settings',exact:true})).toBeVisible()
 expect(new URL(page.url()).searchParams.get('body')).toBe(body);await page.reload();await expect(page.getByRole('combobox', { name: 'Selected body' })).toHaveAttribute('data-value', body)
 await selectBody(page, source);await expect(page).toHaveURL(new RegExp(`body=${source}`));await page.goBack();await expect(page.getByRole('combobox', { name: 'Selected body' })).toHaveAttribute('data-value', body)
 await page.goForward();await expect(page.getByRole('combobox', { name: 'Selected body' })).toHaveAttribute('data-value', source)
 const second=(await overview(page.request)).bodies[1].id;await page.goto(`/u/${new URL(page.url()).pathname.split('/')[2]}/?body=${second}`);await expect(page.getByRole('combobox', { name: 'Selected body' })).toHaveAttribute('data-value', second);await expect(page).toHaveURL(new RegExp(`/b/${second}/overview$`))
 await page.getByRole('button',{name:'Cancel construction · full refund',exact:true}).click()
  await expect(page.getByRole('dialog', { name: 'Cancel construction?', exact: true })).toHaveCount(0)
 await expect.poll(async()=>(await saved()).filter(a=>a.envelope.command.type==='CancelConstruction'&&a.status==='committed'&&a.reconciled).length).toBe(1)
 await expect.poll(async()=>(await overview(page.request)).constructions.map((work:{body:string})=>work.body)).toEqual([source,body].filter(id=>id!==second))
 await expect(page.getByRole('heading',{name:'Construction in progress',exact:true})).toHaveCount(0)
 await expect(page.getByRole('combobox', { name: 'Selected body' })).toHaveAttribute('data-value', second);await expect(page).toHaveURL(new RegExp(`/b/${second}/overview$`))
})
