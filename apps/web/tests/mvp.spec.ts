import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';

test('five private accounts see only their starter, build, and switch safely at phone/desktop widths',async({page})=>{
 const accounts=JSON.parse(readFileSync(process.env.ORBIT_MVP_ACCOUNTS_FILE!,'utf8')) as {name:string,password:string}[];
 const ids=new Set<string>();
 const base=process.env.ORBIT_TEST_BASE_URL!;
 for(let i=0;i<accounts.length;i++){
  await page.setViewportSize({width:[320,390,1440,320,1440][i],height:900});
  await page.goto('/login');await page.getByLabel('Account',{exact:true}).fill(accounts[i].name);await page.getByLabel('Password').fill(accounts[i].password);await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('heading',{name:/^Empire —/,exact:true})).toBeVisible();
  await expect(page.getByLabel('Universe settings')).toContainText('10× — fixed for this universe');
  await expect(page.getByLabel('Universe settings')).toContainText('5 solar systems per galaxy');
  const session=await(await page.request.get('/api/v1/session')).json(),u=session.memberships[0].universe;
  const candidate=await(await page.request.get(`/api/v2/universes/${u}/binding?request_id=${randomUUID()}`)).json();
  const response=await page.request.post(`/api/v2/universes/${u}/overview`,{headers:{Origin:base,'X-CSRF-Token':session.csrf},data:{binding:candidate.binding,request_id:randomUUID()}});
  expect(response.ok()).toBeTruthy();const view=await response.json();expect(view.bodies).toHaveLength(1);expect(ids.has(view.bodies[0].id)).toBe(false);ids.add(view.bodies[0].id);
  expect(view.bodies[0].inventories).toEqual([]);expect(view.research.every((r:{level:number})=>r.level===0)).toBe(true);
  expect(view.bodies[0].levels).toEqual({MetalMine:0,CrystalMine:0,DeuteriumSynthesizer:0,SolarPlant:0});
  // Decorative artwork extends beyond its clipped container; document overflow is the user-visible constraint.
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.getByRole('button',{name:'Calculate transport'})).toBeDisabled();
  if(i===0){
   await page.getByRole('button',{name:'Upgrade Metal Mine',exact:true}).click();
   await expect(page.getByRole('region',{name:'Upgrade quote'})).toContainText('60 metal · 15 crystal · 10 seconds');
   await page.getByRole('button',{name:'Confirm upgrade'}).click();await expect(page.getByRole('heading',{name:'Construction in progress'})).toBeVisible();
   await page.reload();await expect(page.getByRole('heading',{name:'Construction in progress'})).toBeVisible();
   execFileSync('docker',['compose','exec','-T','db','psql','-U','orbit','-d',process.env.TEST_DB_NAME!,'-c','UPDATE orbit_test_clock SET at_ms=1010000'],{stdio:'pipe'});
   await expect(page.getByRole('heading',{name:'Construction in progress'})).toHaveCount(0);
   await expect(page.locator('article').filter({has:page.getByRole('heading',{name:'Metal Mine',exact:true})})).toContainText('Level 1');
   await page.screenshot({path:'test-results/mvp-v1-mobile.png',fullPage:true});
  } else {
   await expect(page.getByText('Action confirmed.',{exact:true})).toHaveCount(0);
   await expect(page.getByRole('region',{name:'Upgrade quote'})).toHaveCount(0);
  }
  if(await page.getByRole('button',{name:'Menu',exact:true}).isVisible()) await page.getByRole('button',{name:'Menu',exact:true}).click();
  await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.getByRole('heading',{name:/^Empire —/,exact:true})).toHaveCount(0);
  expect(await page.getByLabel('Password').inputValue()).toBe('');
 }
 expect(ids.size).toBe(5);
});
