import {universeSlug} from '../src/client-model/universe-name'
import { test, expect } from './fixtures/test'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

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
  await page.goto(`/u/${universeSlug(session.memberships[0].universe_name)}/b/${view.bodies[0].id}/reports/${reportId}`)
  await expect(page.getByRole('region',{name:'Report observation'})).toBeVisible()
  await expect(page.getByRole('button',{name:'Prepare harvest',exact:true})).toHaveCount(0)
  await page.unrouteAll({behavior:'wait'})
})
