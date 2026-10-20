import {overview} from './v2';
import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
function clock(at:number){execFileSync('docker',['compose','exec','-T','db','psql','-U','orbit','-d',process.env.TEST_DB_NAME!,'-c',`UPDATE orbit_test_clock SET at_ms=${at}`],{stdio:'pipe'})}
test('two players deliver cargo, return ships, then recall without delivery',async({browser})=>{
 const a=await browser.newContext(),b=await browser.newContext();const alpha=await a.newPage(),beta=await b.newPage();
 for(const [page,name,password]of[[alpha,'alpha',process.env.ALPHA_PASSWORD!],[beta,'beta',process.env.BETA_PASSWORD!]] as const){await page.goto('/login');await page.getByLabel('Account',{exact:true}).fill(name);await page.getByLabel('Password').fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:/^Overview —/,exact:true})).toBeVisible()}
 await alpha.getByLabel('Cargo metal',{exact:true}).fill('100');await alpha.getByLabel('Cargo crystal',{exact:true}).fill('50');await alpha.getByLabel('Cargo deuterium',{exact:true}).fill('10');await alpha.getByRole('button',{name:'Calculate transport'}).click();await expect(alpha.getByRole('region',{name:'Transport quote'})).toContainText('4741 seconds each way · 3 deuterium fuel · 9,997 maximum payload');await alpha.getByRole('button',{name:'Launch transport'}).click();await expect(alpha.getByRole('button',{name:'Review recall'})).toBeVisible();
 const before=await overview(a.request);const arrival=before.fleets[0].due_at;
 clock(arrival);await expect(beta.getByRole('heading',{name:'Delivered',exact:true})).toBeVisible();await expect(alpha.getByRole('heading',{name:/Returning · 2 Small Cargo/})).toBeVisible();
 clock(arrival+4741000);await expect(alpha.getByText('No fleets in flight.')).toBeVisible();await expect(alpha.getByLabel('Stationed inventory').locator('dl > div').filter({hasText:'Small Cargo'}).locator('dd')).toHaveText('2');
 await alpha.getByRole('button',{name:'Calculate transport'}).click();await alpha.getByRole('button',{name:'Launch transport'}).click();await expect(alpha.getByRole('button',{name:'Review recall'})).toBeVisible();clock(arrival+4742000);await alpha.getByRole('button',{name:'Review recall'}).click();await alpha.getByRole('button',{name:'Recall fleet'}).click();await expect(alpha.getByRole('heading',{name:/Returning · 2 Small Cargo/})).toBeVisible();clock(arrival+4743000);await expect(alpha.getByText('No fleets in flight.')).toBeVisible();await expect(beta.getByRole('heading',{name:'Delivered',exact:true})).toHaveCount(1);
 const recipient=await overview(b.request);expect(recipient.bodies).toHaveLength(1);expect(recipient.bodies[0].amounts.deuterium).toBe('1010000000');expect(recipient.fleets).toHaveLength(0);
 await a.close();await b.close();
});
