import { openProductionSettings } from './fixtures/production-settings'
import {menuDestination} from './fixtures/navigation'
import { test, expect } from './fixtures/test'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

test('keyboard completes production, facility, research and shared ship/defense order flows',async({page})=>{

 const accounts=JSON.parse(readFileSync(process.env.ORBIT_MVP_ACCOUNTS_FILE!,'utf8'));
 const press=async(name:string)=>{const role=/^(Upgrade |Research |Build .)/.test(name)?'link':'button';const control=page.getByRole(role,{name,exact:true});await expect(control).toBeEnabled();await control.focus();await page.keyboard.press('Enter')};
 const navigate=async(name:string)=>{await (await menuDestination(page,name)).focus();await page.keyboard.press('Enter')};
 await page.setViewportSize({width:390,height:844});await page.goto('/login');await page.getByLabel('Account',{exact:true}).focus();await page.keyboard.type(accounts[0].name);await page.keyboard.press('Tab');await page.keyboard.type(accounts[0].password);await page.keyboard.press('Enter');await expect(page.locator('main h1')).toHaveText(/^Empire —/);
 const session=await(await page.request.get('/api/v1/session')).json(),u=session.memberships[0].universe,binding=await(await page.request.get(`/api/v3/universes/${u}/binding?request_id=${randomUUID()}`)).json();
 const read=async()=>{for(let retry=0;retry<50;retry++){const response=await page.request.post(`/api/v3/universes/${u}/overview`,{headers:{Origin:process.env.ORBIT_TEST_BASE_URL!,'X-CSRF-Token':session.csrf},data:{binding:binding.binding,request_id:randomUUID()}});if(response.status()===503){await page.waitForTimeout(50);continue}expect(response.ok()).toBe(true);return response.json()}throw Error('Authoritative view did not catch up')};
 const before=await read();
 await navigate('Resources');await openProductionSettings(page);await page.getByLabel('metal mine production').focus();await page.keyboard.press('End');await expect(page.getByLabel('metal mine production')).toHaveValue('100');await page.getByRole('link',{name:'Develop',exact:true}).click();await expect.poll(async()=>(await read()).progression.production[0].settings.metal_mine).toBe(100);
 await navigate('Facilities');await press('Upgrade Robotics Factory');await expect(page.getByRole('region',{name:'Progression quote'})).toBeFocused();await press('Confirm upgrade');await expect.poll(async()=>(await read()).constructions.length).toBe(1);
 await navigate('Research');await press('Research Computer Technology');await press('Confirm research');await expect.poll(async()=>(await read()).progression.research_operation?.research).toBe('ComputerTechnology');
 await navigate('Shipyard');await press('Build Light Fighter');await expect(page.getByRole('region',{name:'Progression quote'})).toContainText('Prepaid · shared ship/defense queue.');await press('Build');await expect.poll(async()=>(await read()).progression.manufacturing.length).toBe(1);
 await navigate('Defense');await press('Build Rocket Launcher');await press('Build');await expect.poll(async()=>(await read()).progression.manufacturing.length).toBe(2);
 const pending=await read();expect(pending.progression.manufacturing.map((x:{state:string})=>x.state)).toEqual(['Producing','PaidQueued']);
 const due=Math.max(pending.constructions[0].due_at,pending.progression.research_operation.due_at,...pending.progression.manufacturing.map((x:{final_due_at:number})=>x.final_due_at));
 const {execFileSync}=await import('node:child_process');execFileSync('docker',['compose','exec','-T','db','psql','-U','orbit','-d',process.env.TEST_DB_NAME!,'-c',`UPDATE orbit_test_clock SET at_ms=${due+86_400_000}`],{stdio:'pipe'});
 await expect.poll(async()=>(await read()).progression.manufacturing.length).toBe(0);const after=await read();expect(after.bodies[0].levels.RoboticsFactory).toBe(before.bodies[0].levels.RoboticsFactory+1);expect(after.research.find((r:{research:string})=>r.research==='ComputerTechnology').level).toBe(before.research.find((r:{research:string})=>r.research==='ComputerTechnology').level+1);
});
