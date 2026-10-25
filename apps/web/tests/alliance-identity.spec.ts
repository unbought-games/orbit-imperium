import { test, expect } from './fixtures/test'
import { shellFixture, binding, body, id } from './fixtures/game'

const reportId=id(70), target=id(9)
const affiliation={id:id(85),universe:binding.universe,name:'Original alliance',tag:'OLD'}
const payload={kind:'Espionage',observed_at:1792692000000,target:{body:id(80),owner:target,kind:'Planet',coordinates:{galaxy:1,system:2,position:3}},resources:{visibility:'Known',value:{metal:'100000000',crystal:'0',deuterium:'0'}},fleet:{visibility:'Unknown'},defenses:{visibility:'Unknown'},buildings:{visibility:'Unknown'},research:{visibility:'Unknown'},activity:{type:'None'},counterespionage:{probability_ppm:0,detected:false}}

test('reports show historical alliance tags even when current player profiles have changed', async ({page})=>{
  await shellFixture(page,{protocol:4,extraCapabilities:['Reports']})
  await page.route('**/player-profiles',route=>{
    const {context}=route.request().postDataJSON();const now=Math.floor(Date.now()/1000)
    return route.fulfill({json:{binding,request_id:context.request_id,players:[{player:target,username:'Commander Vega',alliance:{...affiliation,tag:'NEW'},observed_at:now,expires_at:now+300}]}})
  })
  await page.route(`**/api/**/reports/${reportId}`,route=>{
    const context=route.request().postDataJSON()
    return route.fulfill({json:{protocol:4,binding,request_id:context.request_id,viewer_revision:'1',sampled_at:Date.now(),as_of_ms:Date.now(),data:{header:{id:reportId,kind:'Espionage',observed_at:payload.observed_at,read:true,hidden:false},payload,player_names:{[target]:'Commander Vega'},player_alliances:{[target]:affiliation}}}})
  })
  await page.goto(`/u/andromeda/b/${body.id}/reports/${reportId}`)
  const observation=page.getByRole('region',{name:'Report observation'})
  await expect(observation.getByRole('link',{name:'Alliance Original alliance [OLD]'})).toHaveAttribute('href',`/alliances/${binding.universe}/${affiliation.id}`)
  await expect(observation).not.toContainText('[NEW]')
  await expect(observation).toContainText('Commander Vega')
})

test('legacy reports and redacted shares never fill affiliation from live profiles', async ({page})=>{
  const token=id(86)
  await page.route(`**/api/v4/shared-reports/${token}`,route=>route.fulfill({json:{report:reportId,observed_at:payload.observed_at,options:{include_identity:false,include_coordinates:false},player_names:{'participant-1':'Player 1'},player_alliances:{},payload:{...payload,target:{owner:'participant-1',kind:'Planet'}}}}))
  await page.goto(`/reports/shared/${token}`)
  await expect(page.getByText('Player 1',{exact:true})).toBeVisible()
  await expect(page.locator('a[href^="/alliances/"]')).toHaveCount(0)
})

test('identity-included public shares retain historical alliance links without loading a game session',async({page})=>{
  const token=id(87);const requests:string[]=[]
  page.on('request',request=>{if(request.url().includes('/api/'))requests.push(request.url())})
  await page.route(`**/api/v4/shared-reports/${token}`,route=>route.fulfill({json:{report:reportId,observed_at:payload.observed_at,options:{include_identity:true,include_coordinates:false},player_names:{'participant-1':'Commander Vega'},player_alliances:{'participant-1':affiliation},payload:{...payload,target:{owner:'participant-1',kind:'Planet'}}}}))
  await page.goto(`/reports/shared/${token}`)
  await expect(page.getByRole('link',{name:'Alliance Original alliance [OLD]'})).toBeVisible()
  expect(requests).toHaveLength(1)
})
