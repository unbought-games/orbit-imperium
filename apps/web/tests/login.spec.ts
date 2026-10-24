import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import {signOut} from './fixtures/navigation'
import {overview} from './v2';
import {test,expect} from './fixtures/test';
test('two keyboard sign-ins expose separate owned planets and revoke logout',async({browser})=>{
 const a=await browser.newContext(),b=await browser.newContext();
 const alpha=await a.newPage(),beta=await b.newPage();
 for(const [page,name,password,coordinate] of [[alpha,'alpha',process.env.ALPHA_PASSWORD!,'[1:1:8]'],[beta,'beta',process.env.BETA_PASSWORD!,'[1:1:9]']] as const){
  await page.goto('/login');await page.getByLabel('Account',{exact:true}).fill(name);await page.keyboard.press('Tab');await page.keyboard.type(password);await page.keyboard.press('Enter');
  await expect(page.getByRole('heading',{name:/^Empire —/,exact:true})).toBeVisible();await expect(page.getByRole('heading',{level:1}).filter({hasText:coordinate})).toBeVisible();
  await expect(page.getByLabel('Orbital fleet').locator('dl > div').filter({hasText:'Small Cargo'}).locator('dd')).toHaveText('2');
  const view=await overview(page.request);const research=page.getByRole('region',{name:'Completed research'});await expect(research).toBeVisible();
  for(const level of view.research)await expect(research.getByText(`${level.research.replace(/([a-z])([A-Z])/g,'$1 $2')} · Level ${level.level}`,{exact:true})).toBeVisible();
  await expect(research.getByRole('button')).toHaveCount(0);await expect(page.getByRole('link',{name:'Research',exact:true})).toHaveCount(0);
 }
 await diagnosticScreenshot(beta, {path:'target/ui-desktop.png',fullPage:true});
 await beta.setViewportSize({width:390,height:844});
 await expect(beta.getByRole('region',{name:'Completed research'})).toBeVisible();
 await diagnosticScreenshot(beta, {path:'target/ui-mobile.png',fullPage:true});
 await signOut(alpha);await expect(alpha.getByLabel('Password')).toBeVisible();
 expect((await a.request.get('/api/v1/session')).status()).toBe(401);
 expect((await b.request.get('/api/v1/session')).status()).toBe(200);
 await a.close();await b.close();
});
