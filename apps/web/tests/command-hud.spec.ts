import { expect, test, type Page } from './fixtures/test'
import { installGameFixture, binding, body, id, refreshGame } from './fixtures/game'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import observation from '../../../contracts/fixtures/espionage-expanded.json' with { type: 'json' }
import type { components } from '../src/contracts'
type S = components['schemas']
const output = 'test-results/live-hud'
const baseTime = 1793120000000
const emptyMissions = ():S['MissionView4'] => ({fleets:[],incoming:[],fleet_slots:'8',score_value_micro:'0'})
async function intelligenceFixture(page: Page, attack = true) {
  let revision = 1
  const missions = emptyMissions()
  const headers:S['ReportHeader4'][]=[]
  const conversations:S['SocialConversation'][]=[]
  const circulars:S['SocialCircular'][]=[]
  let failMailbox = false
  const reads:string[]=[]
  await installGameFixture(page,{protocol:4,missions,sampledAt:baseTime,viewerRevision:()=>String(revision),hasUnreadReports:()=>headers.some(h=>!h.read&&!h.hidden),extraCapabilities:['Reports','Espionage',...(attack ? ['Attack' as const] : [])]})
  await page.route('**/api/**/reports',route=>{
    const {context,cursor}=route.request().postDataJSON()
    const start=cursor?headers.findIndex(h=>h.id===cursor)+1:0
    const hasMore=start+50<headers.length
    return route.fulfill({json:{protocol:4,...context,viewer_revision:String(revision),sampled_at:baseTime,as_of_ms:baseTime,data:{items:headers.slice(start,start+50),has_more:hasMore,next_cursor:hasMore?headers[start+49].id:null,as_of_ms:baseTime}}})
  })
  await page.route('**/api/**/reports/*',route=>{
    const context=route.request().postDataJSON()
    const report=route.request().url().split('/').at(-1)!
    const header=headers.find(h=>h.id===report)
    return route.fulfill({json:{protocol:4,...context,viewer_revision:String(revision),sampled_at:baseTime,as_of_ms:baseTime,data:{header,payload:observation}}})
  })
  await page.route('**/social/query',route=>{
    const {context,query}=route.request().postDataJSON()
    if(failMailbox)return route.fulfill({status:503,json:{code:'Unavailable'}})
    return route.fulfill({json:{...context,conversations:query.type==='Conversations'?conversations:[],circulars:query.type==='Circulars'?circulars:[],messages:[],contacts:[],contact:null,next_cursor:null}})
  })
  await page.route('**/social/commands',route=>{
    const {command_id,action}=route.request().postDataJSON()
    reads.push(action.type)
    if(action.type==='Read'){const c=conversations.find(c=>c.latest.id===action.message);if(c)c.unread=false}
    if(action.type==='ReadCircular'){const c=circulars.find(c=>c.id===action.circular);if(c)c.read=true}
    return route.fulfill({json:{command_id,message:null}})
  })
  await page.route('**/commands',route=>{
    const {gameplay}=route.request().postDataJSON()
    if(gameplay?.command?.action?.type!=='MarkReportRead')return route.fallback()
    const header=headers.find(h=>h.id===gameplay.command.action.report);if(header)header.read=true
    reads.push('MarkReportRead');revision++
    return route.fulfill({json:{protocol:4,binding,command_id:gameplay.command_id,status:'Committed',admitted_at:baseTime,executed_at:baseTime,result_ids:[],minimum_viewer_revision:String(revision)}})
  })
  return { missions, headers, conversations, circulars, reads, fail:()=>{failMailbox=true}, restore:()=>{failMailbox=false}, refresh:async()=>{revision++;await refreshGame(page)} }
}
test('live mobile HUD receives reports, messages and threats across navigation and preserves server truth',async({page})=>{
  await page.setViewportSize({width:390,height:844})
  await page.emulateMedia({reducedMotion:'reduce'})
  const f=await intelligenceFixture(page)
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message))
  await page.goto(`/u/andromeda/b/${body.id}/overview`)
  const orb=page.getByTestId('command-orb')
  await expect(orb).toHaveAttribute('data-tone','ice')
  await diagnosticScreenshot(page,{path:`${output}/idle-390x844.png`})
  // The inbox has loaded empty before its first real arrival.
  await orb.click();await expect(page.getByText('No new intelligence. All channels clear.')).toBeVisible()
  await page.getByRole('button',{name:'Close command HUD'}).click()
  f.headers.push({id:id(850),kind:'Espionage',observed_at:baseTime,read:false,hidden:false})
  await f.refresh()
  const report=page.getByLabel('Recent game events').getByRole('button',{name:/Espionage report/})
  await expect(report).toBeVisible();await expect(orb).toHaveAttribute('data-tone','champagne')
  await diagnosticScreenshot(page,{path:`${output}/report-toast-390x844.png`})
  await report.click()
  const panel=page.getByRole('dialog',{name:'Espionage report',exact:true})
  await expect(panel.getByText('Receiving report…')).toHaveCount(0)
  await expect(panel.getByRole('group',{name:'Resource amounts'})).toBeVisible()
  await expect.poll(()=>f.reads).toContain('MarkReportRead')
  await diagnosticScreenshot(page,{path:`${output}/report-open-390x844.png`})
  expect(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true)
  await page.setViewportSize({width:320,height:740})
  expect(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true)
  await diagnosticScreenshot(page,{path:`${output}/report-open-320x740.png`})
  await page.setViewportSize({width:390,height:844})
  await page.getByRole('button',{name:'Close command HUD'}).click()
  await expect(orb).toHaveAttribute('data-tone','ice')
  f.conversations.push({contact:{player:id(99),username:'Nova',blocked:false,request:null,requested_by:null,accepted:false},latest:{id:id(851),sequence:'1',sender:id(99),body:'**Scouts are ready.**\n\nMeet at sector 42.',sent_at:baseTime},unread:true})
  await f.refresh()
  const message=page.getByLabel('Recent game events').getByRole('button',{name:/Message received/})
  await expect(message).toBeVisible();await message.click()
  await expect(page.getByRole('dialog').locator('strong',{hasText:'Scouts are ready.'})).toBeVisible()
  await diagnosticScreenshot(page,{path:`${output}/message-open-390x844.png`})
  await expect.poll(()=>f.reads).toContain('Read')
  await expect(page.getByRole('button',{name:'Mark read',exact:true})).toHaveCount(0)
  await page.getByRole('button',{name:'Close command HUD'}).click()
  await expect(orb).toHaveAttribute('data-tone','ice')
  f.circulars.push({id:id(852),alliance:id(90),alliance_name:'Starlight',alliance_tag:'STAR',sender:id(99),sender_name:'Nova',body:'Defend the outpost.',sent_at:baseTime,read:false})
  await f.refresh()
  await page.getByLabel('Recent game events').getByRole('button',{name:/Alliance transmission/}).click()
  await expect(page.getByRole('dialog')).toContainText('Defend the outpost.')
  await expect.poll(()=>f.reads).toContain('ReadCircular')
  await page.getByRole('button',{name:'Close command HUD'}).click()
  f.missions.incoming.push({sender:id(99),origin:{galaxy:1,system:372,position:3},target:body.id,mission:'Attack',arrival_at:baseTime+180000,ships:{visibility:'Unknown'}})
  await f.refresh()
  await expect(orb).toHaveAttribute('data-tone','red')
  const threat=page.getByLabel('Recent game events').getByRole('button',{name:/Hostile fleet inbound/})
  await expect(threat).toBeVisible()
  await diagnosticScreenshot(page,{path:`${output}/attack-toast-390x844.png`})
  await threat.click();await expect(page.getByRole('dialog')).toContainText('Ship composition unknown')
  await diagnosticScreenshot(page,{path:`${output}/attack-open-390x844.png`})
  await page.getByRole('button',{name:'Close command HUD'}).click()
  await threat.focus();await page.keyboard.press('Escape');await expect(threat).toHaveCount(0)
  await expect(orb).toHaveAttribute('data-tone','red')
  await orb.click()
  await diagnosticScreenshot(page,{path:`${output}/inbox-390x844.png`})
  await page.getByRole('dialog').getByRole('link',{name:'Fleet activity',exact:true}).click()
  await expect(page).toHaveURL(/\/fleets\/?$/)
  await expect(orb).toHaveAttribute('data-tone','red')
  f.missions.incoming.length=0;await f.refresh()
  await expect(orb).toHaveAttribute('data-tone','ice')
  expect(errors).toEqual([])
})

test('initial unread persists and mailbox failures remain recoverable; desktop has no HUD',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'})
  const f=await intelligenceFixture(page)
  f.headers.push({id:id(850),kind:'Espionage',observed_at:baseTime,read:false,hidden:false})
  await page.goto(`/u/andromeda/b/${body.id}/overview`)
  const orb=page.getByTestId('command-orb')
  await expect(orb).toHaveAttribute('data-tone','champagne')
  await expect(page.getByLabel('Recent game events').getByRole('button')).toHaveCount(0)
  f.fail();await f.refresh();await orb.click()
  await expect(page.getByRole('alert').filter({hasText:'Some intelligence is unavailable'})).toBeVisible()
  f.restore();await page.getByRole('button',{name:'Retry intelligence'}).click()
  await expect(page.getByText('Some intelligence is unavailable. Try again.')).toHaveCount(0)
  await page.getByRole('button',{name:'Close command HUD'}).click()
  await page.emulateMedia({reducedMotion:'no-preference'})
  expect(await orb.evaluate(node=>getComputedStyle(node,'::before').animationName)).not.toBe('none')
  await page.emulateMedia({reducedMotion:'reduce'})
  expect(await orb.evaluate(node=>getComputedStyle(node,'::before').animationName)).toBe('none')
  await page.setViewportSize({width:1440,height:900})
  await expect(orb).toHaveCount(0)
  await diagnosticScreenshot(page,{path:`${output}/desktop-1440x900.png`})
})

test('real quick-build only acknowledges committed orders and leaves rejection visible',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'})
  let reject=false
  await installGameFixture(page,{protocol:4,missions:emptyMissions(),catalog:[{key:{kind:'Building',id:'MetalMine'},enabled:true,mobile:false,body_kinds:['Planet'],requirements:[]}]})
  await page.route('**/progression-options',route=>{
    const {context,request}=route.request().postDataJSON()
    return route.fulfill({json:{protocol:4,...context,viewer_revision:'1',sampled_at:Date.now(),as_of_ms:Date.now(),request,terms_hash:'b'.repeat(64),blockers:[],estimates:null,terms:{type:'Building',profile_hash:'a'.repeat(64),body:body.id,building:'MetalMine',action:'Upgrade',source_level:1,target_level:2,paid:{metal:'1000000',crystal:'1000000',deuterium:'0'},duration_ms:60000,formula:'BuildingRedesign2011',facilities:[],required_energy:'0',reserve_fields:1}}})
  })
  await page.route('**/commands',route=>{
    const {gameplay}=route.request().postDataJSON();if(gameplay.command.type!=='StartUpgrade')return route.fallback()
    return route.fulfill({json:{protocol:4,binding,command_id:gameplay.command_id,admitted_at:Date.now(),executed_at:Date.now(),...(reject?{status:'Rejected',code:'InsufficientResources'}:{status:'Committed',result_ids:[id(900)],minimum_viewer_revision:'1'})}})
  })
  await page.goto(`/u/andromeda/b/${body.id}/resources`)
  const quick=page.getByRole('button',{name:/Upgrade Metal Mine|Build Metal Mine/}).first()
  await expect(quick).toBeEnabled();await quick.click()
  const toast=page.getByLabel('Recent game events').getByRole('button',{name:/Construction started/})
  await expect(toast).toBeVisible();await expect(toast).toContainText('level 2')
  await expect(page.getByTestId('command-orb')).toHaveAttribute('data-tone','green')
  await diagnosticScreenshot(page,{path:`${output}/building-390x844.png`})
  // Reload intentionally removes ephemeral acknowledgments and restored success history is silent.
  reject=true;await page.reload();await expect(page.getByTestId('command-orb')).toHaveAttribute('data-tone','ice')
  await quick.click();await expect(page.getByLabel('Action needs attention')).toContainText('rejected')
  await expect(page.getByLabel('Recent game events').getByRole('button')).toHaveCount(0)
})

for (const kind of ['research', 'defense'] as const) {
  test(`real ${kind} confirmation shows the quoted action in the mobile HUD`, async ({page}) => {
    await page.setViewportSize({width:390,height:844})
    await page.emulateMedia({reducedMotion:'reduce'})
    const planet={...body,levels:{...body.levels,ResearchLab:10,Shipyard:10}}
    const key:S['ItemKey3']=kind==='research'?{kind:'Research',id:'EnergyTechnology'}:{kind:'Defense',id:'RocketLauncher'}
    await installGameFixture(page,{protocol:4,bodies:[planet],missions:emptyMissions(),research:[{research:'EnergyTechnology',level:1}],catalog:[{key,enabled:true,mobile:false,body_kinds:['Planet'],requirements:[]}]})
    await page.route('**/progression-options',route=>{
      const {context,request}=route.request().postDataJSON()
      const common={profile_hash:'a'.repeat(64),paid:{metal:'2000000',crystal:'1000000',deuterium:'0'}}
      const terms=request.type==='Research'?{...common,type:'Research',host:body.id,research:'EnergyTechnology',source_level:1,target_level:2,duration_ms:60000,formula:'ResearchClassic',labs:[],effective_lab:'10',required_energy:'0'}:{...common,type:'Manufacture',body:body.id,item:key,quantity:request.quantity,unit_cost:common.paid,unit_duration_ms:60000,formula:'ManufactureClassic',facilities:[]}
      return route.fulfill({json:{protocol:4,...context,viewer_revision:'1',sampled_at:Date.now(),as_of_ms:Date.now(),request,terms,terms_hash:'b'.repeat(64),blockers:[],estimates:null}})
    })
    const sent:string[]=[]
    await page.route('**/commands',route=>{
      const {gameplay}=route.request().postDataJSON()
      if(!['StartResearch','StartManufacture'].includes(gameplay.command.type))return route.fallback()
      sent.push(gameplay.command.type)
      return route.fulfill({json:{protocol:4,binding,command_id:gameplay.command_id,status:'Committed',admitted_at:Date.now(),executed_at:Date.now(),result_ids:[id(901)],minimum_viewer_revision:'1'}})
    })
    await page.goto(`/u/andromeda/b/${body.id}/${kind}/${kind==='research'?'energy-technology':'rocket-launcher'}`)
    await page.getByRole('region',{name:'Progression quote'}).getByRole('button',{name:kind==='research'?'Confirm research':'Build',exact:true}).click()
    const toast=page.getByLabel('Recent game events').getByRole('button',{name:kind==='research'?/Research started/:/Defense order accepted/})
    await expect(toast).toBeVisible()
    await expect(toast).toContainText(kind==='research'?'Energy Technology':'Rocket Launcher')
    if(kind==='defense')await expect(toast.getByRole('img',{name:'Metal',exact:true})).toBeVisible()
    expect(sent).toEqual([kind==='research'?'StartResearch':'StartManufacture'])
    await expect(page.getByTestId('command-orb')).toHaveAttribute('data-tone','green')
    await diagnosticScreenshot(page,{path:`${output}/${kind}-390x844.png`})
  })
}

test('orb boots from its center, types the complete label and clears it without moving', async ({page}) => {
  await page.setViewportSize({width:390,height:844})
  await page.clock.install()
  await intelligenceFixture(page)
  await page.goto(`/u/andromeda/b/${body.id}/overview`)
  const orb = page.getByTestId('command-orb')
  await expect(orb).toBeVisible()
  const caption = page.getByTestId('orb-caption')
  await expect(caption).toHaveText('Systems Online')
  // Sample the real CSS animation at explicit times rather than wall-clock sleeps.
  const frames = await orb.evaluate(el => {
    const animation = el.getAnimations()[0]
    animation.pause(); animation.currentTime = 0
    const start = {opacity:getComputedStyle(el).opacity, transform:getComputedStyle(el).transform}
    animation.currentTime = 700
    return {start, end:{opacity:getComputedStyle(el).opacity, transform:getComputedStyle(el).transform}, origin:getComputedStyle(el).transformOrigin}
  })
  expect(frames.start.opacity).toBe('0')
  expect(frames.start.transform).toBe('matrix(0.15, 0, 0, 0.15, 0, 0)')
  expect(frames.end.opacity).toBe('1')
  expect(frames.origin).toBe('37px 37px')
  const text = caption.locator('span')
  await text.evaluate(el => { for(const animation of el.getAnimations()){animation.pause();animation.currentTime=1600} })
  expect(await text.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await diagnosticScreenshot(page,{path:`${output}/startup-complete-390x844.png`})
  const before = await orb.boundingBox()
  await page.clock.fastForward(6000)
  await expect(caption).toHaveCount(0)
  expect(await orb.boundingBox()).toEqual(before)
  await diagnosticScreenshot(page,{path:`${output}/startup-cleared-390x844.png`})
})

test.describe('HUD touch scroll ownership', () => {
  test.use({hasTouch:true,isMobile:true})
  test('report and long message capture gestures; backdrop and boundaries cannot move the game', async ({page}) => {
    await page.setViewportSize({width:390,height:844})
    await page.emulateMedia({reducedMotion:'reduce'})
    const f = await intelligenceFixture(page)
    f.headers.push({id:id(850),kind:'Espionage',observed_at:baseTime,read:false,hidden:false})
    f.conversations.push({contact:{player:id(99),username:'Nova',blocked:false,request:null,requested_by:null,accepted:false},latest:{id:id(851),sequence:'1',sender:id(99),body:Array.from({length:30},(_,i)=>`Field update ${i+1}: Scouts are ready.`).join('\n\n'),sent_at:baseTime},unread:true})
    await page.goto(`/u/andromeda/b/${body.id}/overview`)
    const orb = page.getByTestId('command-orb')
    await expect(orb).toHaveAttribute('data-tone','champagne')
    await page.evaluate(()=>window.scrollTo(0,150))
    const originalY = await page.evaluate(()=>scrollY)
    expect(originalY).toBeGreaterThan(0)
    await orb.click()
    const panel = page.getByRole('dialog')
    await panel.getByRole('button',{name:/Espionage report/}).click()
    await expect(panel.getByRole('group',{name:'Resource amounts'})).toBeVisible()
    expect(await panel.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true)
    const frozen = await page.evaluate(()=>({position:document.body.style.position,top:document.body.style.top,y:scrollY}))
    expect(frozen.position).toBe('fixed')
    expect(frozen.top).toBe(`${-originalY}px`)
    const cdp = await page.context().newCDPSession(page)
    async function swipe(x:number,from:number,to:number) {
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:from}]})
      for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:from+(to-from)*i/8}]})
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
    }
    await panel.evaluate(el=>{el.scrollTop=0})
    await page.mouse.move(190,400);await page.mouse.wheel(0,300)
    await expect.poll(()=>panel.evaluate(el=>el.scrollTop)).toBeGreaterThan(0)
    await panel.evaluate(el=>{el.scrollTop=0})
    await swipe(190,620,300)
    await expect.poll(()=>panel.evaluate(el=>el.scrollTop)).toBeGreaterThan(0)
    await diagnosticScreenshot(page,{path:`${output}/report-scrolled-390x844.png`})
    await panel.evaluate(el=>{el.scrollTop=el.scrollHeight})
    await expect.poll(()=>panel.evaluate(el=>Math.abs(el.scrollHeight-el.clientHeight-el.scrollTop))).toBeLessThan(2)
    await swipe(190,620,300)
    await page.mouse.move(4,400);await page.mouse.wheel(0,600)
    await swipe(4,620,300)
    expect(await page.evaluate(()=>({position:document.body.style.position,top:document.body.style.top,y:scrollY}))).toEqual(frozen)
    await page.keyboard.press('Escape')
    await expect(panel).not.toBeVisible()
    await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(originalY)
    expect(await page.evaluate(()=>document.body.style.position)).toBe('')
    await orb.click()
    await panel.getByRole('button',{name:/Message received/}).click()
    await expect(panel).toContainText('Field update 30')
    await panel.evaluate(el=>{el.scrollTop=0})
    await swipe(190,620,300)
    await expect.poll(()=>panel.evaluate(el=>el.scrollTop)).toBeGreaterThan(0)
    await diagnosticScreenshot(page,{path:`${output}/message-scrolled-390x844.png`})
    // A mobile-to-desktop resize unmounts the HUD and must also release the lock.
    await page.setViewportSize({width:1440,height:900})
    await expect(panel).toHaveCount(0)
    expect(await page.evaluate(()=>document.body.style.position)).toBe('')
    await diagnosticScreenshot(page,{path:`${output}/scroll-restored-desktop-1440x900.png`})
    await cdp.detach()
  })
})

for (const attackEnabled of [true, false]) {
  test(`HUD espionage attack action respects capability ${attackEnabled} and prepares the observed target`, async ({page}) => {
    await page.setViewportSize({width:390,height:844})
    await page.emulateMedia({reducedMotion:'reduce'})
    const f = await intelligenceFixture(page, attackEnabled)
    f.headers.push({id:id(850),kind:'Espionage',observed_at:baseTime,read:false,hidden:false})
    await page.goto(`/u/andromeda/b/${body.id}/overview`)
    await page.getByTestId('command-orb').click()
    await page.getByRole('dialog').getByRole('button',{name:/Espionage report/}).click()
    const panel = page.getByRole('dialog',{name:'Espionage report',exact:true})
    await expect(panel.getByRole('group',{name:'Resource amounts'})).toBeVisible()
    const attack = panel.getByRole('button',{name:'Attack',exact:true})
    if (!attackEnabled) {
      await expect(attack).toHaveCount(0)
      return
    }
    await expect(attack).toBeVisible()
    const attackBox = (await attack.boundingBox())!
    expect(attackBox.y).toBeLessThan((await panel.getByRole('heading',{name:'Resources',exact:true}).boundingBox())!.y)
    expect(attackBox.y+attackBox.height).toBeLessThan(844)
    await diagnosticScreenshot(page,{path:`${output}/report-attack-390x844.png`})
    await page.setViewportSize({width:320,height:740})
    expect(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true)
    await expect(attack).toBeVisible()
    await diagnosticScreenshot(page,{path:`${output}/report-attack-320x740.png`})
    await attack.click()
    await expect(page).toHaveURL(new RegExp(`/b/${body.id}/dispatch\\?`))
    const url = new URL(page.url())
    expect(Object.fromEntries(url.searchParams)).toMatchObject({mission:'Attack',galaxy:'1',system:'1',position:'9',target:'planet'})
    expect(await page.evaluate(()=>history.state.dispatchObservation)).toMatchObject({target:{type:'Body',id:observation.target.body,expected_owner:observation.target.owner,expected_kind:observation.target.kind},observedAt:baseTime})
    await expect(panel).not.toBeVisible()
    expect(await page.evaluate(()=>document.body.style.position)).toBe('')
    await expect(page.getByRole('combobox',{name:'Mission',exact:true})).toHaveValue('Attack')
    // The same action remains in the full report at desktop sizes.
    await page.setViewportSize({width:1440,height:900})
    await page.goto(`/u/andromeda/b/${body.id}/reports/${id(850)}`)
    await expect(page.getByRole('button',{name:'Attack',exact:true})).toBeVisible()
    await diagnosticScreenshot(page,{path:`${output}/report-attack-desktop-1440x900.png`})
  })
}

test('HUD details return to the list without closing, even after scrolling a report', async ({page}) => {
  await page.setViewportSize({width:390,height:844})
  await page.emulateMedia({reducedMotion:'reduce'})
  const f = await intelligenceFixture(page)
  f.headers.push({id:id(850),kind:'Espionage',observed_at:baseTime,read:false,hidden:false})
  f.conversations.push({contact:{player:id(99),username:'Nova',blocked:false,request:null,requested_by:null,accepted:false},latest:{id:id(851),sequence:'1',sender:id(99),body:'Scouts are ready.',sent_at:baseTime},unread:true})
  await page.goto(`/u/andromeda/b/${body.id}/overview`)
  await expect(page.getByTestId('unread-count')).toHaveText('2')
  await diagnosticScreenshot(page,{path:`${output}/unread-2-390x844.png`})
  await page.getByTestId('command-orb').click()
  const panel = page.getByRole('dialog')
  await expect(panel.getByRole('button',{name:'Back to list'})).toHaveCount(0)
  await panel.getByRole('button',{name:/Espionage report/}).click()
  await expect(panel.getByRole('button',{name:'Attack',exact:true})).toBeVisible()
  const back = panel.getByRole('button',{name:'Back to list',exact:true})
  await expect(back).toBeVisible()
  await diagnosticScreenshot(page,{path:`${output}/report-back-390x844.png`})
  await panel.evaluate(el=>{el.scrollTop=el.scrollHeight})
  const bounds = (await panel.boundingBox())!
  const backBounds = (await back.boundingBox())!
  expect(backBounds.y).toBeGreaterThanOrEqual(bounds.y)
  expect(backBounds.y+backBounds.height).toBeLessThan(bounds.y+bounds.height)
  await diagnosticScreenshot(page,{path:`${output}/report-back-scrolled-390x844.png`})
  await back.click()
  await expect(page.getByTestId('unread-count')).toHaveText('1')
  await expect(panel).toHaveAccessibleName('Command uplink')
  await expect(panel.getByRole('heading',{name:'Command uplink'})).toBeFocused()
  expect(await panel.evaluate(el=>el.scrollTop)).toBe(0)
  expect(await page.evaluate(()=>document.body.style.position)).toBe('fixed')
  await expect(panel.getByRole('button',{name:/Espionage report/})).toHaveCount(0)
  await diagnosticScreenshot(page,{path:`${output}/returned-list-390x844.png`})
  await panel.getByRole('button',{name:/Message received/}).click()
  await expect(panel).toContainText('Scouts are ready.')
  await back.click()
  await expect(panel).toHaveAccessibleName('Command uplink')
  await expect(panel).toContainText('No new intelligence. All channels clear.')
  await expect(page.getByTestId('unread-count')).toHaveCount(0)
  await page.getByRole('button',{name:'Close command HUD'}).click()
  expect(await page.evaluate(()=>document.body.style.position)).toBe('')
  await page.setViewportSize({width:1440,height:900})
  await expect(page.getByTestId('command-orb')).toHaveCount(0)
  await diagnosticScreenshot(page,{path:`${output}/back-list-desktop-1440x900.png`})
})

test('unread badge traverses older reports and caps the visible count at 99', async ({page}) => {
  await page.setViewportSize({width:390,height:844})
  await page.emulateMedia({reducedMotion:'reduce'})
  const f = await intelligenceFixture(page)
  f.headers.push(...Array.from({length:170},(_,i)=>({id:id(1000+i),kind:'Espionage',observed_at:baseTime-i,read:i<50,hidden:false})))
  await page.goto(`/u/andromeda/b/${body.id}/overview`)
  await expect(page.getByTestId('unread-count')).toHaveText('99')
  await expect(page.getByTestId('command-orb')).toHaveAccessibleName('99 or more unread items. Open command HUD')
  await diagnosticScreenshot(page,{path:`${output}/unread-99-390x844.png`})
  for(const header of f.headers)header.read=true
  await f.refresh()
  await expect(page.getByTestId('unread-count')).toHaveCount(0)
  await expect(page.getByTestId('command-orb')).toHaveAttribute('data-tone','ice')
})

test('HUD list infinitely loads past the badge cap, retries in place, and restores the list after detail', async ({page}) => {
  await page.setViewportSize({width:390,height:844})
  await page.emulateMedia({reducedMotion:'reduce'})
  const f = await intelligenceFixture(page)
  f.headers.push(...Array.from({length:130},(_,i)=>({id:id(2000+i),kind:'Espionage',observed_at:baseTime-i,read:false,hidden:false})))
  let fail = true
  let release: (()=>void)|undefined
  let requests = 0
  await page.route('**/api/**/reports',async route=>{
    if(route.request().postDataJSON().cursor===id(2099)){
      requests++
      if(fail)return route.fulfill({status:503,json:{code:'Unavailable'}})
      await new Promise<void>(resolve=>{release=resolve})
    }
    return route.fallback()
  })
  await page.goto(`/u/andromeda/b/${body.id}/overview`)
  await expect(page.getByTestId('unread-count')).toHaveText('99')
  await page.getByTestId('command-orb').click()
  const panel=page.getByRole('dialog')
  const list=panel.getByLabel('Intelligence list')
  const entries=list.getByRole('button')
  await expect(entries).toHaveCount(20)
  await expect(list).toHaveAttribute('aria-busy','false')
  await diagnosticScreenshot(page,{path:`${output}/infinite-first-390x844.png`})
  for(const count of [40,60,80,100]){
    await panel.evaluate(el=>{el.scrollTop=el.scrollHeight})
    await expect(entries).toHaveCount(count)
    await expect(list).toHaveAttribute('aria-busy','false')
  }
  expect(requests).toBe(0)
  await panel.evaluate(el=>{el.scrollTop=el.scrollHeight})
  await expect(panel.getByRole('button',{name:'Retry loading'})).toBeVisible()
  await expect(entries).toHaveCount(100)
  expect(requests).toBe(1)
  await diagnosticScreenshot(page,{path:`${output}/infinite-retry-390x844.png`})
  fail=false
  await panel.getByRole('button',{name:'Retry loading'}).click()
  await expect(panel.getByRole('status').filter({hasText:'Loading intelligence…'})).toBeVisible()
  await diagnosticScreenshot(page,{path:`${output}/infinite-loading-390x844.png`})
  await expect.poll(()=>!!release).toBe(true)
  release!()
  await expect(entries).toHaveCount(120)
  expect(requests).toBe(2)
  // Opening an already loaded row must not throw away the loaded pages or position.
  await entries.nth(95).scrollIntoViewIfNeeded()
  const position=await panel.evaluate(el=>el.scrollTop)
  await entries.nth(95).click()
  await expect(panel.getByRole('button',{name:'Attack',exact:true})).toBeVisible()
  await panel.getByRole('button',{name:'Back to list'}).click()
  await expect(panel).toHaveAccessibleName('Command uplink')
  await expect(entries).toHaveCount(120)
  expect(Math.abs(await panel.evaluate(el=>el.scrollTop)-position)).toBeLessThan(5)
  expect(await page.evaluate(()=>document.body.style.position)).toBe('fixed')
  await panel.evaluate(el=>{el.scrollTop=el.scrollHeight})
  await expect(entries).toHaveCount(129)
  await expect(panel.getByRole('status').filter({hasText:'You’re all caught up.'})).toBeVisible()
  await expect(panel.getByRole('button',{name:'Load more intelligence'})).toHaveCount(0)
  await panel.getByRole('status').filter({hasText:'You’re all caught up.'}).scrollIntoViewIfNeeded()
  await diagnosticScreenshot(page,{path:`${output}/infinite-end-390x844.png`})
  await page.setViewportSize({width:1440,height:900})
  await expect(page.getByTestId('command-orb')).toHaveCount(0)
  expect(await page.evaluate(()=>document.body.style.position)).toBe('')
  await diagnosticScreenshot(page,{path:`${output}/infinite-desktop-1440x900.png`})
})
