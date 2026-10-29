import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { moveProductionSlider, openProductionSettings } from './fixtures/production-settings'
import {navigate,signOut,foreground} from './fixtures/navigation'
import {test,expect,type APIResponse} from './fixtures/test';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import type {Attempt} from '../src/client-model/commands';
test('mobile and desktop progression controls, blocked purchases, pending work, and private relogin',async({page})=>{
 // Isolate lost acknowledgments from the independent SSE outcome channel.
 await page.route('**/updates?epoch=*', route=>route.fulfill({status:503,body:''}));

 const accounts=JSON.parse(readFileSync(process.env.ORBIT_MVP_ACCOUNTS_FILE!,'utf8')) as {name:string,password:string}[];
 const signIn=async(i:number)=>{await page.goto('/login');await page.getByLabel('Account',{exact:true}).fill(accounts[i].name);await page.getByLabel('Password').fill(accounts[i].password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:/^Empire —/,exact:true})).toBeVisible()};
 const read=async(request:()=>Promise<APIResponse>)=>{
  let response!:APIResponse;
  // The scheduler can temporarily withhold a view while earlier work commits.
  // Stop retrying as soon as any other status arrives, then require success.
  await expect.poll(async()=>{response=await request();return response.status()},{timeout:5_000,intervals:[50,100,250]}).not.toBe(503);
  expect(response.status(),`Unexpected response from ${response.url()}`).toBe(200);
  return response.json();
 };
 const view=async()=>{const session=await read(()=>page.request.get('/api/v1/session')),u=session.memberships[0].universe;const b=await read(()=>page.request.get(`/api/v3/universes/${u}/binding?request_id=${randomUUID()}`));return read(()=>page.request.post(`/api/v3/universes/${u}/overview`,{headers:{Origin:process.env.ORBIT_TEST_BASE_URL!,'X-CSRF-Token':session.csrf},data:{binding:b.binding,request_id:randomUUID()}}))};
 const go=(destination:string)=>navigate(page,destination);
 const advance=(at:number)=>execFileSync('docker',['compose','exec','-T','db','psql','-U','orbit','-d',process.env.TEST_DB_NAME!,'-c',`UPDATE orbit_test_clock SET at_ms=${at}`],{stdio:'pipe'});
 await page.setViewportSize({width:320,height:900});await signIn(0);
 await expect(page.getByText('Fleet missions unavailable',{exact:false})).toBeVisible();
 await go('resources');
 await openProductionSettings(page);
 await expect(page.getByLabel('fusion reactor production')).toBeDisabled();
 await moveProductionSlider(page, 'metal mine production', '50');
 await expect.poll(async()=>(await view()).progression.production[0].settings.metal_mine).toBe(50);
 await page.reload();await openProductionSettings(page);await expect(page.getByLabel('metal mine production')).toHaveValue('50');
 await go('research');
 await page.getByRole('link',{name:'Research Computer Technology',exact:true}).click();await expect(page.getByRole('region',{name:'Progression quote'})).toContainText('Required to improve');
 await page.getByRole('button',{name:'Confirm research',exact:true}).click();await expect(page.getByRole('region',{name:'Active research'})).toBeVisible();
 await expect.poll(async()=>(await view()).progression.research_operation?.research).toBe('ComputerTechnology');
 await go('resources');await go('research');await expect(page.locator('main h1')).toHaveText('Research');
 let originalId='';let originalEnvelope:unknown;
 const savedManufacture=()=>page.evaluate(id=>Object.entries(sessionStorage).filter(([key])=>key.startsWith('orbit:attempts:v3:')).map(([,value])=>JSON.parse(value) as Attempt).find(a=>a.envelope.command_id===id),originalId);
 const receiptRoute='**/api/v3/universes/*/commands/*?epoch=*';
 await page.route(receiptRoute,route=>new URL(route.request().url()).pathname.endsWith(`/${originalId}`)?route.fulfill({status:503,contentType:'application/problem+json',body:JSON.stringify({type:'about:blank',status:503,code:'Unavailable'})}):route.continue());
 await page.route('**/api/v3/universes/*/commands',async route=>{originalEnvelope=route.request().postDataJSON();originalId=route.request().postDataJSON().command_id;await route.fetch();await route.abort('failed')},{times:1});
 await go('shipyard');
 await page.getByRole('link',{name:'Build Light Fighter',exact:true}).click();await page.getByLabel('Shipyard quantity').fill('2');await expect(page.getByRole('region',{name:'Progression quote'})).toContainText('No cancellation, pause, or reordering.');await page.getByRole('button',{name:'Build',exact:true}).click();
 await expect(page.getByRole('button',{name:'Retry order'})).toBeVisible();
 expect(originalId).toBeTruthy();
 await go('resources');await page.reload();
 await expect(page.getByText('Light Fighter · 2 remaining',{exact:false})).toBeVisible();
 const restored=await page.evaluate(id=>Object.entries(sessionStorage).filter(([k,v])=>k.startsWith('orbit:attempts:v3:')&&JSON.parse(v).envelope.command_id===id).map(([,v])=>JSON.parse(v)),originalId);
 expect(restored).toHaveLength(1);expect(restored[0].envelope).toEqual(originalEnvelope);expect(restored[0].envelope.protocol).toBe(3);expect(restored[0].envelope.command.quantity).toBe('2');expect(restored[0].status).toBe('uncertain');
 await page.unroute(receiptRoute);
 await expect.poll(async()=>{const a=await savedManufacture();return a?.status==='committed'&&a.reconciled}).toBe(true);
 const recovered=await view(),attempt=await savedManufacture();expect(recovered.progression.manufacturing).toHaveLength(1);expect(recovered.progression.manufacturing[0].quantity).toBe('2');expect(attempt?.receipt?.status).toBe('Committed');if(attempt?.receipt?.status==='Committed')expect(attempt.receipt.result_ids).toEqual([recovered.progression.manufacturing[0].id]);

 await page.unroute('**/updates?epoch=*');await foreground(page);
 await go('facilities');
 await page.getByRole('link',{name:'Upgrade Research Lab',exact:true}).click();await expect(page.getByLabel('Action blockers')).toContainText('Lab Locked');await expect(page.getByRole('button',{name:'Confirm upgrade'})).toBeDisabled();await page.getByRole('link',{name:/^Back to /}).click();
 await go('resources');
 await page.getByRole('link',{name:'Upgrade Metal Mine',exact:true}).click();await page.getByRole('button',{name:'Confirm upgrade'}).click();await expect(page.getByRole('region',{name:'Active construction'})).toBeVisible();
 await expect.poll(async()=>(await view()).constructions.map((work:{building:string})=>work.building)).toEqual(['MetalMine']);
 const v=await view();expect(v.progression.research_operation).toBeTruthy();expect(v.constructions).toHaveLength(1);expect(v.progression.manufacturing).toHaveLength(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await diagnosticScreenshot(page, {path:'test-results/progression-mobile.png',fullPage:true});
 await page.reload();await go('research');await page.getByRole('link',{name:'Research Computer Technology',exact:true}).click();await expect(page.getByRole('region',{name:'Active research'})).toBeVisible();
 advance(Math.max(v.progression.research_operation.due_at,v.constructions[0].due_at,v.progression.manufacturing[0].final_due_at));
 await expect(page.getByRole('region',{name:'Active research'})).toHaveCount(0);await expect.poll(async()=>(await view()).constructions).toHaveLength(0);await go('shipyard');await expect(page.getByText('No ships or defenses in production.',{exact:true})).toBeVisible();
 await page.setViewportSize({width:1440,height:900});
 await go('defense');
 await page.getByRole('link',{name:'Build Small Shield Dome',exact:true}).click();await expect(page.getByLabel('Action blockers')).toContainText('Capacity Reserved');
 await diagnosticScreenshot(page, {path:'test-results/progression-desktop.png',fullPage:true});
 await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/v1/session')&&r.request().method()==='DELETE'),signOut(page)]);await expect(page.getByLabel('Password')).toBeVisible();await signIn(1);await expect(page.getByRole('region',{name:'Progression quote'})).toHaveCount(0);const other=await view();expect(other.bodies[0].inventories).toEqual([]);expect(other.research.every((x:{level:number})=>x.level===0)).toBe(true);expect(other.bodies[0].id).not.toBe(v.bodies[0].id);expect((await page.evaluate(()=>Object.keys(sessionStorage))).filter(k=>k.startsWith('orbit:attempts:v3:'))).toHaveLength(0);
 await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/v1/session')&&r.request().method()==='DELETE'),signOut(page)]);await expect(page.getByLabel('Password')).toBeVisible();await signIn(0);await go('resources');await openProductionSettings(page);await expect(page.getByLabel('metal mine production')).toHaveValue('50');await expect(page.getByRole('region',{name:'Progression quote'})).toHaveCount(0);
});
