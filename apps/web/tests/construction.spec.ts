import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
test('quote, commit, cancel, and deadline completion through the real scheduler',async({page})=>{
 await page.goto('/login');await page.getByLabel('Account',{exact:true}).fill('alpha');await page.getByLabel('Password').fill(process.env.ALPHA_PASSWORD!);await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByRole('button',{name:'Upgrade Metal Mine',exact:true}).click();await expect(page.getByRole('region',{name:'Upgrade quote'})).toContainText('90 metal · 22 crystal · 161 seconds');
 await page.getByRole('button',{name:'Confirm upgrade'}).click();await expect(page.getByRole('heading',{name:'Construction in progress'})).toBeVisible();
 await page.getByRole('button',{name:'Cancel construction · full refund'}).click();await expect(page.getByRole('heading',{name:'Construction in progress'})).toHaveCount(0);
 await page.getByRole('button',{name:'Upgrade Metal Mine',exact:true}).click();await page.getByRole('button',{name:'Confirm upgrade'}).click();await expect(page.getByRole('heading',{name:'Construction in progress'})).toBeVisible();
 execFileSync('docker',['compose','exec','-T','db','psql','-U','orbit','-d',process.env.TEST_DB_NAME!,'-c','UPDATE orbit_test_clock SET at_ms=1161000'],{stdio:'pipe'});
 await expect(page.getByRole('heading',{name:'Construction in progress'})).toHaveCount(0);
 await expect(page.locator('article').filter({has:page.getByRole('heading',{name:'Metal Mine',exact:true})})).toContainText('Level 2');
});
