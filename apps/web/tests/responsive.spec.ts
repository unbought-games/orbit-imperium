import { openProductionSettings } from './fixtures/production-settings'
import {universeSlug} from '../src/client-model/universe-name'
import {navigate,foreground} from './fixtures/navigation'
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
test('routed progression shell: viewport matrix, keyboard, history, invalid IDs and no navigation purchases', async ({page,browser})=>{

 await page.emulateMedia({reducedMotion:'reduce'});
 const accounts=JSON.parse(readFileSync(process.env.ORBIT_MVP_ACCOUNTS_FILE!,'utf8'));
 await page.goto('/login');await page.getByLabel('Account',{exact:true}).fill(accounts[0].name);await page.getByLabel('Password').fill(accounts[0].password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:/^Empire —/,exact:true})).toBeVisible();
 const session=await(await page.request.get('/api/v1/session')).json(),u=session.memberships[0].universe;
 const binding=await(await page.request.get(`/api/v3/universes/${u}/binding?request_id=${randomUUID()}`)).json();
 const v=await(await page.request.post(`/api/v3/universes/${u}/overview`,{headers:{Origin:process.env.ORBIT_TEST_BASE_URL!,'X-CSRF-Token':session.csrf},data:{binding:binding.binding,request_id:randomUUID()}})).json(),body=v.bodies[0].id;
 let writes=0;page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/commands'))writes++});
 const go=async(name:string)=>{
  if(await page.getByRole('heading',{name:'Destination unavailable',exact:true}).isVisible()) await page.getByRole('link',{name:'Open your universe overview'}).click();
  const title=name[0].toUpperCase()+name.slice(1);
  await navigate(page,title);
  await expect(page.locator('main h1')).toHaveText(name==='overview'?/^Empire —/:title)
 };
 for(const [width,height] of [[360,800],[390,844],[768,1024],[1440,900],[844,390],[320,800]]){
  await page.setViewportSize({width,height});
  for(const dest of ['overview','resources','facilities','research','shipyard','defense','settings']){
   await go(dest);await expect(page.locator('main')).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width} ${dest} overflow`).toBe(true);
   const small=await page.locator('button,input,select,summary,nav a,main a,aside a').evaluateAll(nodes=>nodes.filter(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&(r.width<(innerWidth<1024?44:24)||r.height<(innerWidth<1024?44:24))}).map(n=>n.textContent));expect(small).toEqual([]);
  }
  await go('overview');if(width===1440){expect((await page.getByRole('main').boundingBox())?.width).toBe(1368);await expect(page.getByRole('complementary',{name:'Planets and moons'})).toHaveCount(0);const nav=page.getByRole('navigation',{name:'Main navigation',exact:true});const world=await nav.getByRole('link',{name:'Empire',exact:true}).boundingBox(),build=await nav.getByRole('link',{name:'Build',exact:true}).boundingBox();expect(world!.y).toBe(build!.y);expect(world!.x+world!.width).toBeLessThan(build!.x)}
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`test-results/overview-${width}x${height}.png`});
  await go('resources');await page.getByRole('link',{name:'Upgrade Metal Mine',exact:true}).click();await expect(page.getByRole('region',{name:'Progression quote'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`test-results/responsive-${width}x${height}.png`,fullPage:true});await page.getByRole('link',{name:/^Back to /}).click();
 }
 await page.setViewportSize({width:390,height:844});await go('overview');
 await page.getByRole('button',{name:'Menu',exact:true}).last().focus();await page.keyboard.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Menu',exact:true}).last()).toBeFocused();
 await page.keyboard.press('Enter');await page.getByRole('dialog',{name:'Navigation'}).getByRole('link',{name:'Research'}).focus();await page.keyboard.press('Enter');await expect(page.locator('main h1')).toBeFocused();
 await go('facilities');await page.goBack();await expect(page.locator('main h1')).toHaveText('Research');await page.goForward();await expect(page.locator('main h1')).toHaveText('Facilities');await page.reload();await expect(page.locator('main h1')).toHaveText('Facilities');
 for(const invalid of [`/u/${universeSlug(session.memberships[0].universe_name)}/b/${randomUUID()}/resources`,`/u/${randomUUID()}/overview`,`/u/${universeSlug(session.memberships[0].universe_name)}/galaxy`,`/u/${universeSlug(session.memberships[0].universe_name)}/fleets`]){await page.goto(invalid);await expect(page.locator('main h1')).toHaveText('Destination unavailable');await expect(page.getByRole('link',{name:'Upgrade Metal Mine',exact:true})).toHaveCount(0)}
 await go('shipyard');await page.getByRole('link',{name:'Build Small Cargo',exact:true}).click();await page.getByLabel('Shipyard quantity').fill('9007199254740993');expect(await page.getByLabel('Shipyard quantity').inputValue()).toBe('9007199254740993');await expect(page.getByLabel('Action blockers')).toContainText('Numeric Range');await page.getByRole('link',{name:/^Back to /}).click();
 await page.getByRole('link',{name:'Build Small Cargo',exact:true}).click();await page.getByLabel('Shipyard quantity').fill('0');await expect(page.getByLabel('Shipyard quantity')).toBeFocused();await expect(page.getByRole('alert')).toContainText('positive whole quantity');

 await go('resources');
 let releaseInspection:()=>void=()=>{}, inspectionStarted:()=>void=()=>{};
 const started=new Promise<void>(resolve=>{inspectionStarted=resolve});
 const released=new Promise<void>(resolve=>{releaseInspection=resolve});
 await page.route('**/progression-options',async r=>{const response=await r.fetch();inspectionStarted();await released;await r.fulfill({response})},{times:1});
 await page.getByRole('link',{name:'Upgrade Metal Mine',exact:true}).click();await started;await go('facilities');releaseInspection();await page.waitForResponse(r=>r.url().endsWith('/progression-options'));await expect(page.getByRole('region',{name:'Progression quote'})).toHaveCount(0);
 await page.getByRole('link',{name:'Upgrade Research Lab',exact:true}).click();await expect(page.getByRole('region',{name:'Progression quote'})).toContainText('Research Lab');await page.getByRole('link',{name:/^Back to /}).click();
 await page.addStyleTag({content:'html {font-size:200%!important} * {line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important} p {margin-bottom:2em!important}'});await go('resources');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/responsive-text-spacing.png',fullPage:true});

 // Presentation-only stress, independently labeled from the real journeys above.
 await page.route('**/api/v3/universes/*/overview',async r=>{
  const response=await r.fetch(),fixture=await response.json();
  fixture.bodies[0].amounts.metal='9223372036854775807';
  fixture.bodies[0].inventories=[{item:{kind:'Ship',id:'SmallCargo'},count:'9007199254740993'}];
  fixture.progression.manufacturing=Array.from({length:50},(_,i)=>({id:randomUUID(),body, item:{kind:'Ship',id:'LightFighter'},quantity:'9007199254740994',completed_prefix:'9007199254740993',remaining:'1',paid:{metal:'9223372036854775807',crystal:'0',deuterium:'0'},accepted_at:fixture.as_of_ms,first_start_at:fixture.as_of_ms+i*1000,next_due_at:fixture.as_of_ms+(i+1)*1000,final_due_at:fixture.as_of_ms+(i+1)*1000,unit_duration_ms:1000,state:i===0?'Producing':'PaidQueued',can_cancel:false}));
  await r.fulfill({response,json:fixture});
 });
 await foreground(page);
 await page.getByRole('button',{name:'Metal details'}).click();
 await expect(page.getByText('9,223,372,036,854',{exact:true}).first()).toBeVisible({timeout:15000});
 await page.keyboard.press('Escape');
 await expect(page.getByRole('complementary',{name:'Activity'})).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/responsive-stress.png',fullPage:true});await page.unrouteAll({behavior:'wait'});
 expect(writes).toBe(0);console.log(`Browser ${browser.version()}; keyboard and pointer emulation; all routes at six viewports; text resize/spacing; zero navigation command submissions.`);
});

test('keyboard purchase, disconnected countdown and authoritative reconnect preserve focus and announcements',async({page,context})=>{

 const accounts=JSON.parse(readFileSync(process.env.ORBIT_MVP_ACCOUNTS_FILE!,'utf8'));
 await page.setViewportSize({width:390,height:844});await page.goto('/login');await page.getByLabel('Account',{exact:true}).fill(accounts[2].name);await page.keyboard.press('Tab');await page.keyboard.type(accounts[2].password);await page.keyboard.press('Enter');await expect(page.locator('main h1')).toHaveText(/^Empire —/);
 await page.getByRole('button',{name:'Menu',exact:true}).focus();await page.keyboard.press('Enter');await page.getByRole('dialog',{name:'Navigation'}).getByRole('link',{name:'Resources',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.locator('main h1')).toBeFocused();await page.getByRole('link',{name:'Upgrade Metal Mine',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.getByRole('region',{name:'Progression quote'})).toBeFocused();await page.getByRole('button',{name:'Confirm upgrade'}).focus();await page.keyboard.press('Enter');await expect(page.getByRole('region',{name:'Buildings',exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'Buildings',exact:true})).toContainText(/Metal Mine · Level \d+/);
 const session=await(await page.request.get('/api/v1/session')).json(),u=session.memberships[0].universe,binding=await(await page.request.get(`/api/v3/universes/${u}/binding?request_id=${randomUUID()}`)).json();
 const read=async()=>{for(let retry=0;retry<50;retry++){const response=await page.request.post(`/api/v3/universes/${u}/overview`,{headers:{Origin:process.env.ORBIT_TEST_BASE_URL!,'X-CSRF-Token':session.csrf},data:{binding:binding.binding,request_id:randomUUID()}});if(response.status()===503){await page.waitForTimeout(50);continue}expect(response.ok()).toBe(true);return response.json()}throw Error('Authoritative view did not catch up')};
 const before=await read();const announcement=await page.locator('[role="status"][aria-live="polite"]').textContent();await page.getByRole('link',{name:/^Back to /,exact:true}).click();await page.getByRole('link',{name:'Upgrade Metal Mine',exact:true}).focus();await context.setOffline(true);
 await expect(page.getByRole('region',{name:'Buildings',exact:true}).getByText('Awaiting confirmation',{exact:false})).toBeVisible({timeout:20_000});await expect(page.getByRole('region',{name:'Buildings',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Upgrade Metal Mine',exact:true})).toBeFocused();expect(await page.locator('[role="status"][aria-live="polite"]').textContent()).toBe(announcement);
 const {execFileSync}=await import('node:child_process');execFileSync('docker',['compose','exec','-T','db','psql','-U','orbit','-d',process.env.TEST_DB_NAME!,'-c',`UPDATE orbit_test_clock SET at_ms=${before.constructions[0].due_at}`],{stdio:'pipe'});
 await context.setOffline(false);await expect(page.getByRole('region',{name:'Buildings',exact:true})).toContainText('No construction in progress.',{timeout:20_000});await expect(page.getByRole('link',{name:'Upgrade Metal Mine',exact:true})).toBeFocused();expect((await read()).bodies[0].levels.MetalMine).toBe(1);
});

test('keyboard completes production, facility, research and shared ship/defense order flows',async({page})=>{

 const accounts=JSON.parse(readFileSync(process.env.ORBIT_MVP_ACCOUNTS_FILE!,'utf8'));
 const press=async(name:string)=>{await expect(page.getByRole('button',{name,exact:true})).toBeEnabled();await page.getByRole('button',{name,exact:true}).focus();await page.keyboard.press('Enter')};
 const navigate=async(name:string)=>{await press('Menu');await page.getByRole('dialog',{name:'Navigation'}).getByRole('link',{name,exact:false}).focus();await page.keyboard.press('Enter')};
 await page.setViewportSize({width:390,height:844});await page.goto('/login');await page.getByLabel('Account',{exact:true}).focus();await page.keyboard.type(accounts[0].name);await page.keyboard.press('Tab');await page.keyboard.type(accounts[0].password);await page.keyboard.press('Enter');await expect(page.locator('main h1')).toHaveText(/^Empire —/);
 const session=await(await page.request.get('/api/v1/session')).json(),u=session.memberships[0].universe,binding=await(await page.request.get(`/api/v3/universes/${u}/binding?request_id=${randomUUID()}`)).json();
 const read=async()=>{for(let retry=0;retry<50;retry++){const response=await page.request.post(`/api/v3/universes/${u}/overview`,{headers:{Origin:process.env.ORBIT_TEST_BASE_URL!,'X-CSRF-Token':session.csrf},data:{binding:binding.binding,request_id:randomUUID()}});if(response.status()===503){await page.waitForTimeout(50);continue}expect(response.ok()).toBe(true);return response.json()}throw Error('Authoritative view did not catch up')};
 const before=await read();
 await navigate('Resources');await openProductionSettings(page);await page.getByLabel('metal mine production').focus();await page.keyboard.type('100');await expect(page.getByLabel('metal mine production')).toHaveValue('100');await page.getByRole('link',{name:'Build',exact:true}).click();await expect.poll(async()=>(await read()).progression.production[0].settings.metal_mine).toBe(100);
 await navigate('Facilities');await press('Upgrade Robotics Factory');await expect(page.getByRole('region',{name:'Progression quote'})).toBeFocused();await press('Confirm upgrade');await expect.poll(async()=>(await read()).constructions.length).toBe(1);
 await navigate('Research');await press('Research Computer Technology');await press('Confirm research');await expect.poll(async()=>(await read()).progression.research_operation?.research).toBe('ComputerTechnology');
 await navigate('Shipyard');await press('Build Light Fighter');await expect(page.getByRole('region',{name:'Progression quote'})).toContainText('Prepaid · shared ship/defense queue.');await press('Build');await expect.poll(async()=>(await read()).progression.manufacturing.length).toBe(1);
 await navigate('Defense');await press('Build Rocket Launcher');await press('Build');await expect.poll(async()=>(await read()).progression.manufacturing.length).toBe(2);
 const pending=await read();expect(pending.progression.manufacturing.map((x:{state:string})=>x.state)).toEqual(['Producing','PaidQueued']);
 const due=Math.max(pending.constructions[0].due_at,pending.progression.research_operation.due_at,...pending.progression.manufacturing.map((x:{final_due_at:number})=>x.final_due_at));
 const {execFileSync}=await import('node:child_process');execFileSync('docker',['compose','exec','-T','db','psql','-U','orbit','-d',process.env.TEST_DB_NAME!,'-c',`UPDATE orbit_test_clock SET at_ms=${due+86_400_000}`],{stdio:'pipe'});
 await expect.poll(async()=>(await read()).progression.manufacturing.length).toBe(0);const after=await read();expect(after.bodies[0].levels.RoboticsFactory).toBe(before.bodies[0].levels.RoboticsFactory+1);expect(after.research.find((r:{research:string})=>r.research==='ComputerTechnology').level).toBe(before.research.find((r:{research:string})=>r.research==='ComputerTechnology').level+1);
});
