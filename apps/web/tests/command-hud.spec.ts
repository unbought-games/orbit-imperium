import { expect, test, type Page } from './fixtures/test'
import { installGameFixture, binding, body, id, refreshGame } from './fixtures/game'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import observation from '../../../contracts/fixtures/espionage-expanded.json' with { type: 'json' }
import type { components } from '../src/contracts'
type S = components['schemas']
const output = 'test-results/live-hud'
const baseTime = 1793120000000
const emptyMissions = ():S['MissionView4'] => ({fleets:[],incoming:[],fleet_slots:'8',score_value_micro:'0'})

for (const [width, height] of [[768, 600], [1024, 768], [1440, 900], [2560, 1440], [3440, 1440]]) {
  test(`desktop orb anchors its panel, preserves details across resize and restores focus at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const f = await intelligenceFixture(page)
    f.headers.push({ id: id(850), kind: 'Espionage', observed_at: baseTime, read: false, hidden: false })
    await page.goto(`/u/andromeda/b/${body.id}/overview`)
    const orb = page.getByTestId('command-orb')
    await expect(orb).toHaveAttribute('data-tone', 'champagne')
    await expect(orb).toHaveAttribute('aria-haspopup', 'dialog')
    await expect(orb).toHaveAttribute('aria-expanded', 'false')
    const bounds = (await orb.boundingBox())!
    const content = (await page.getByRole('main').boundingBox())!
    const shell = (await page.locator('[data-has-command-hud]').boundingBox())!
    const orbRight = bounds.x + bounds.width
    expect(bounds.width).toBe(92)
    expect(orbRight).toBeLessThanOrEqual(shell.x + shell.width - 28)
    expect(orbRight).toBeGreaterThan(shell.x + shell.width - 52)
    if (width >= 1440) expect(bounds.x).toBeGreaterThan(content.x + content.width + 16)
    expect(bounds.y + bounds.height).toBeLessThan(height - 28)
    await orb.evaluate(el => el.setAttribute('data-instance', 'same-orb'))
    await diagnosticScreenshot(page, { path: `${output}/desktop-orb-${width}x${height}.png` })
    await orb.focus()
    await page.keyboard.press('Enter')
    const panel = page.getByRole('dialog', { name: 'Command uplink', exact: true })
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('heading', { name: 'Command uplink' })).toBeFocused()
    await expect(orb).toHaveAttribute('aria-expanded', 'true')
    const panelBox = (await panel.boundingBox())!
    expect(panelBox.x + panelBox.width - orbRight).toBeGreaterThanOrEqual(0)
    expect(panelBox.x + panelBox.width - orbRight).toBeLessThan(4)
    expect(panelBox.y).toBeGreaterThanOrEqual(0)
    expect(panelBox.y + panelBox.height).toBeLessThan(bounds.y)
    await panel.getByRole('button', { name: /Espionage report/ }).click()
    const detail = page.getByRole('dialog', { name: 'Espionage report', exact: true })
    await expect(detail.getByRole('group', { name: 'Resource amounts' })).toBeVisible()
    await diagnosticScreenshot(page, { path: `${output}/desktop-report-${width}x${height}.png` })
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(detail).toBeVisible()
    await expect(orb).toHaveAttribute('data-instance', 'same-orb')
    expect(await page.evaluate(() => document.body.style.position)).toBe('fixed')
    await page.setViewportSize({ width, height })
    await expect(detail).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(detail).toHaveCount(0)
    await expect(orb).toBeFocused()
    await expect(orb).toHaveAttribute('aria-expanded', 'false')
    expect(await page.evaluate(() => document.body.style.position)).toBe('')
    await expect(orb).toHaveAttribute('data-tone', 'ice')
  })
}

async function intelligenceFixture(page: Page, attack = true, bodies: S['BodyV3'][] = [body], destinations: S['Destination'][] = [], playerNames?: S['PublicPlayerNames4']) {
  let revision = 1
  const missions = emptyMissions()
  const headers:S['ReportHeader4'][]=[]
  const conversations:S['SocialConversation'][]=[]
  const circulars:S['SocialCircular'][]=[]
  let failMailbox = false
  const reads:string[]=[]
  const reportQueries:Array<string|null>=[]
  await installGameFixture(page,{protocol:4,bodies,destinations,playerNames,missions,sampledAt:baseTime,viewerRevision:()=>String(revision),hasUnreadReports:()=>headers.some(h=>!h.read&&!h.hidden),extraCapabilities:['Reports','Espionage',...(attack ? ['Attack' as const] : [])]})
  await page.route('**/api/**/reports',route=>{
    const {context,cursor}=route.request().postDataJSON()
    reportQueries.push(cursor)
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
  return { missions, headers, conversations, circulars, reads, reportQueries, fail:()=>{failMailbox=true}, restore:()=>{failMailbox=false}, refresh:async()=>{revision++;await refreshGame(page)} }
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
  await page.getByRole('dialog').getByRole('link',{name:'All fleets',exact:true}).click()
  await expect(page).toHaveURL(/\/fleets\/?$/)
  await expect(orb).toHaveAttribute('data-tone','red')
  f.missions.incoming.length=0;await f.refresh()
  await expect(orb).toHaveAttribute('data-tone','ice')
  expect(errors).toEqual([])
})

test('initial unread persists and mailbox failures remain recoverable; desktop retains the HUD',async({page})=>{
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
  await expect(orb).toBeVisible()
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
    const midpoint = Number(getComputedStyle(el).opacity)
    animation.currentTime = 1400
    return {start, midpoint, end:{opacity:getComputedStyle(el).opacity, transform:getComputedStyle(el).transform}, origin:getComputedStyle(el).transformOrigin}
  })
  expect(frames.start.opacity).toBe('0')
  expect(frames.start.transform).toBe('matrix(0.15, 0, 0, 0.15, 0, 0)')
  expect(frames.midpoint).toBeCloseTo(0.5, 2)
  expect(frames.end.opacity).toBe('1')
  await orb.evaluate(el=>{el.getAnimations()[0].currentTime=700})
  await diagnosticScreenshot(page,{path:`${output}/startup-midpoint-390x844.png`})
  await orb.evaluate(el=>{el.getAnimations()[0].currentTime=1400})
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
  await page.setViewportSize({width:1440,height:900})
  await expect(orb).toBeVisible()
  await diagnosticScreenshot(page,{path:`${output}/startup-desktop-1440x900.png`})
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
    // Resizing preserves the open detail and its scroll lock until dismissed.
    await page.setViewportSize({width:1440,height:900})
    await expect(panel).toBeVisible()
    await expect(panel).toContainText('Field update 30')
    await page.keyboard.press('Escape')
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
    await expect(page.getByRole('radio', { checked: true })).toHaveValue('Attack')
    // The same action remains in the full report at desktop sizes.
    await page.setViewportSize({width:1440,height:900})
    await page.goto(`/u/andromeda/b/${body.id}/reports/${id(850)}`)
    await expect(page.getByRole('button',{name:'Attack',exact:true})).toBeVisible()
    await diagnosticScreenshot(page,{path:`${output}/report-attack-desktop-1440x900.png`})
  })
}

for (const [width, height] of [[390, 844], [1440, 900]]) {
  test(`HUD back button is a ghost with hover, focus and pressed states at ${width}x${height}`, async ({page}) => {
    await page.setViewportSize({width,height})
    await page.emulateMedia({reducedMotion:'reduce'})
    const f=await intelligenceFixture(page)
    f.headers.push({id:id(850),kind:'Espionage',observed_at:baseTime,read:false,hidden:false})
    await page.goto(`/u/andromeda/b/${body.id}/overview`)
    await page.getByTestId('command-orb').click()
    const panel=page.getByRole('dialog')
    await panel.getByRole('button',{name:/Espionage report/}).click()
    await expect(panel.getByRole('button',{name:'Attack',exact:true})).toBeVisible()
    const back=panel.getByRole('button',{name:'Back to list',exact:true})
    async function expectCompactHeaderControl() {
      const buttonBounds=(await back.boundingBox())!
      const headerBounds=(await back.locator('..').boundingBox())!
      expect(buttonBounds.height).toBeLessThanOrEqual(28)
      expect(buttonBounds.y).toBeGreaterThanOrEqual(headerBounds.y+4)
      expect(buttonBounds.y+buttonBounds.height).toBeLessThanOrEqual(headerBounds.y+headerBounds.height-4)
    }
    await page.mouse.move(0,0)
    await expect(back).toHaveAttribute('data-button-variant','ghost')
    await expect(back).toHaveCSS('background-color','rgba(0, 0, 0, 0)')
    await expectCompactHeaderControl()
    await diagnosticScreenshot(page,{path:`${output}/back-ghost-idle-${width}x${height}.png`})

    await back.hover()
    await expect(back).toHaveCSS('background-color','rgba(255, 255, 255, 0.08)')
    await expectCompactHeaderControl()
    await diagnosticScreenshot(page,{path:`${output}/back-ghost-hover-${width}x${height}.png`})
    await page.mouse.move(0,0)
    await panel.getByRole('heading',{name:'Espionage report',exact:true}).focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Shift+Tab')
    await expect(back).toBeFocused()
    await expect(back).toHaveCSS('background-color','rgba(255, 255, 255, 0.08)')
    await expect(back).toHaveCSS('outline-style','solid')
    await expectCompactHeaderControl()
    const focusOutset=await back.evaluate(el=>{
      const style=getComputedStyle(el)
      return parseFloat(style.outlineOffset)+parseFloat(style.outlineWidth)
    })
    expect(focusOutset).toBeLessThanOrEqual(0)
    await diagnosticScreenshot(page,{path:`${output}/back-ghost-focus-${width}x${height}.png`})
    await panel.evaluate(el=>{el.scrollTop=el.scrollHeight})
    await expectCompactHeaderControl()
    await diagnosticScreenshot(page,{path:`${output}/back-ghost-scrolled-focus-${width}x${height}.png`})
    await panel.evaluate(el=>{el.scrollTop=0})

    await back.hover()
    await page.mouse.down()
    await expect(back).toHaveCSS('background-color','rgba(255, 255, 255, 0.14)')
    await expectCompactHeaderControl()
    await diagnosticScreenshot(page,{path:`${output}/back-ghost-pressed-${width}x${height}.png`})
    await page.mouse.up()
    await expect(panel).toHaveAccessibleName('Command uplink')
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
  await expect(page.getByTestId('command-orb')).toBeVisible()
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
      if (!release) await new Promise<void>(resolve=>{release=resolve})
    }
    return route.fallback()
  })
  await page.goto(`/u/andromeda/b/${body.id}/overview`)
  await expect(page.getByTestId('unread-count')).toHaveText('99')
  await expect(page.getByRole('heading', { level: 1, name: /Empire/ })).toBeVisible()
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
  // Two retry gestures before React commits the loading state must join one
  // request and reveal only the next batch, including observer callbacks.
  await panel.getByRole('button',{name:'Retry loading'}).evaluate(button => {
    (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click()
  })
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
  await expect(page.getByTestId('command-orb')).toBeVisible()
  await expect(panel).toBeVisible()
  await diagnosticScreenshot(page,{path:`${output}/infinite-end-1440x900.png`})
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  expect(await page.evaluate(()=>document.body.style.position)).toBe('')
  await diagnosticScreenshot(page,{path:`${output}/infinite-desktop-1440x900.png`})
})

test('stale HUD intersection callbacks cannot consume a later pagination batch', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    const host = window as typeof window & { replayStaleHudIntersection?: () => void }
    const NativeObserver = window.IntersectionObserver
    window.IntersectionObserver = class extends NativeObserver {
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        super(callback, options)
        if (options?.root instanceof HTMLDialogElement && !host.replayStaleHudIntersection) {
          host.replayStaleHudIntersection = () => callback([{ isIntersecting: true } as IntersectionObserverEntry], this)
        }
      }
    }
  })
  const f = await intelligenceFixture(page)
  f.headers.push(...Array.from({ length: 130 }, (_, i) => ({ id: id(4000 + i), kind: 'Espionage', observed_at: baseTime - i, read: false, hidden: false })))
  await page.goto(`/u/andromeda/b/${body.id}/overview`)
  await expect(page.getByTestId('unread-count')).toHaveText('99')
  await page.getByTestId('command-orb').click()
  const panel = page.getByRole('dialog', { name: 'Command uplink', exact: true })
  const entries = panel.getByLabel('Intelligence list').getByRole('button')
  await expect(entries).toHaveCount(20)
  await expect.poll(() => page.evaluate(() => typeof (window as typeof window & { replayStaleHudIntersection?: () => void }).replayStaleHudIntersection)).toBe('function')
  for (const count of [40, 60]) {
    // Click without scrolling the sentinel into view, then deliver the callback
    // queued by the first observer after a newer batch has already committed.
    await panel.getByRole('button', { name: 'Load more intelligence', exact: true }).evaluate(button => (button as HTMLButtonElement).click())
    await expect(entries).toHaveCount(count)
    await page.evaluate(async () => {
      (window as typeof window & { replayStaleHudIntersection?: () => void }).replayStaleHudIntersection!()
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    })
    await expect(entries).toHaveCount(count)
  }
})

test('captions explain once, joke only on confirmed new losses, and keep humor separate from regular feedback', async ({page}) => {
  await page.setViewportSize({width:390,height:844})
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.clock.install()
  await page.addInitScript(()=>{Math.random=()=>0})
  const f=await intelligenceFixture(page)
  await page.goto(`/u/andromeda/b/${body.id}/overview`)
  const caption=page.getByTestId('orb-caption')
  const orb=page.getByTestId('command-orb')
  await expect(caption).toHaveText('Systems Online')
  await page.clock.fastForward(6000)
  await expect(caption).toHaveCount(0)
  f.conversations.push({contact:{player:id(99),username:'Nova',blocked:false,request:null,requested_by:null,accepted:false},latest:{id:id(851),sequence:'1',sender:id(99),body:'Scouts are ready.',sent_at:baseTime},unread:true})
  await f.refresh()
  await expect(caption).toHaveText('Champagne means unread.')
  await diagnosticScreenshot(page,{path:`${output}/caption-education-390x844.png`})
  await page.clock.fastForward(6000)
  await expect(caption).toHaveCount(0)
  await expect(orb).toHaveAttribute('data-tone','champagne')
  await f.refresh()
  await expect(caption).toHaveCount(0)
  // A detected probe is not necessarily a destroyed probe.
  f.headers.unshift({id:id(860),kind:'Espionage',observed_at:baseTime,read:false,hidden:false,preview:{kind:'Espionage',counterespionage:{detected:true,probability_ppm:1000000}}})
  await f.refresh()
  await expect(page.getByLabel('Recent game events').getByRole('button',{name:/Espionage report/})).toBeVisible()
  await page.clock.fastForward(8000)
  await expect(caption).toHaveCount(0)
  const loss=(n:number):S['ReportHeader4']=>({id:id(n),kind:'Combat',observed_at:baseTime+n,read:false,hidden:false,preview:{kind:'Combat',mission:'Espionage',outcome:'DefenderVictory',participants:[{owner:binding.player,side:'Attacker'}]}})
  f.headers.unshift(loss(861))
  await f.refresh()
  await expect(page.getByLabel('Recent game events').getByRole('button',{name:/Combat report/})).toBeVisible()
  await page.clock.fastForward(8000)
  await expect(caption).toHaveText('Whoops.')
  await expect(caption).toHaveAttribute('data-category','personality')
  await diagnosticScreenshot(page,{path:`${output}/caption-whoops-390x844.png`})
  // An urgent regular card still appears and interrupts the joke during cooldown.
  f.missions.incoming.push({sender:id(99),origin:{galaxy:1,system:372,position:3},target:body.id,mission:'Attack',arrival_at:baseTime+180000,ships:{visibility:'Unknown'}})
  await f.refresh()
  await expect(orb).toHaveAttribute('data-tone','red')
  await expect(page.getByLabel('Recent game events').getByRole('button',{name:/Hostile fleet inbound/})).toBeVisible()
  await expect(caption).toHaveCount(0)
  await diagnosticScreenshot(page,{path:`${output}/caption-urgent-card-390x844.png`})
  f.missions.incoming.length=0
  await f.refresh()
  await page.clock.fastForward(8000)
  f.headers.unshift(loss(862))
  await f.refresh()
  await expect(page.getByLabel('Recent game events').getByRole('button',{name:/Combat report/})).toBeVisible()
  await page.clock.fastForward(8000)
  await expect(caption).toHaveCount(0)
  // Client navigation keeps the humor budget. No old report replays on refresh.
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Develop',exact:true}).click()
  await expect(page).toHaveURL(/resources$/)
  await page.clock.fastForward(8000)
  await expect(caption).toHaveCount(0)
  await page.clock.fastForward(90000)
  await expect(page.getByTestId('unread-count')).toHaveText('4')
  f.headers.unshift(loss(863))
  await f.refresh()
  await expect(page.getByLabel('Recent game events').getByRole('button',{name:/Combat report/})).toBeVisible()
  await page.clock.fastForward(8000)
  await expect(caption).toHaveText('Good thing we sent the bad one.')
  await expect(caption.locator('span')).toHaveCSS('animation-name','none')
  await page.setViewportSize({width:320,height:740})
  const bounds=(await caption.boundingBox())!
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.x+bounds.width).toBeLessThanOrEqual(320)
  expect(await caption.locator('span').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true)
  await diagnosticScreenshot(page,{path:`${output}/caption-long-320x740.png`})
  await page.clock.fastForward(6000)
  await expect(caption).toHaveCount(0)
  await expect(orb).toHaveAttribute('data-tone','champagne')
  await diagnosticScreenshot(page,{path:`${output}/caption-expired-320x740.png`})
  await page.setViewportSize({width:1440,height:900})
  await expect(orb).toBeVisible()
  await diagnosticScreenshot(page,{path:`${output}/caption-desktop-1440x900.png`})
})

test('every orb surface blends through the shared palette, including rapid retargets and reduced motion', async ({page}) => {
  await page.setViewportSize({width:390,height:844})
  const f=await intelligenceFixture(page)
  f.headers.push({id:id(850),kind:'Espionage',observed_at:baseTime,read:false,hidden:false})
  await page.goto(`/u/andromeda/b/${body.id}/overview`)
  const orb=page.getByTestId('command-orb')
  await expect(orb).toHaveAttribute('data-tone','champagne')
  await expect(page.getByTestId('unread-count')).toHaveText('1')
  // Finish only the entrance so color captures show the fully formed orb.
  await orb.evaluate(el=>{for(const a of el.getAnimations())if(a.effect?.getTiming().iterations===1)a.finish()})
  const palette={ice:[164,219,239],champagne:[236,211,159],green:[135,242,187],red:[255,125,131]}
  for(const tone of ['red','green','ice','champagne'] as const){
    const frames=await orb.evaluate(async (el,tone)=>{
      const dock=el.parentElement!
      const outer=el.children[0], inner=el.children[1], core=el.children[2]
      const shimmer=core.children[0], icon=core.querySelector('svg')!
      const badge=el.querySelector('[data-testid="unread-count"]')!
      const slots=el.nextElementSibling!
      const style=(node:Element,pseudo?:string)=>getComputedStyle(node,pseudo)
      const sample=()=>({
        channels:['red','green','blue'].map(channel=>Number(style(dock).getPropertyValue(`--command-orb-${channel}`))),
        parts:{
          orb:style(el).color,
          caption:style(dock.querySelector('[data-testid="orb-caption"]')!).color,
          outer:style(outer).borderTopColor, inner:style(inner).borderTopColor,
          core:style(core).backgroundImage, coreShadow:style(core).boxShadow, coreBorder:style(core).borderColor,
          shimmer:style(shimmer).backgroundImage, icon:style(icon).color, iconGlow:style(icon).filter,
          aura:style(el,'::before').backgroundImage, ripple:style(el,'::after').borderColor,
          spark:style(outer,'::after').backgroundColor, sparkGlow:style(outer,'::after').boxShadow,
          badge:style(badge).backgroundColor, badgeBorder:style(badge).borderColor, badgeGlow:style(badge).boxShadow,
          slots:style(slots).color, slotsBorder:style(slots).borderColor, slotsBackground:style(slots).backgroundColor,
        }
      })
      const before=sample()
      dock.dataset.tone=tone;el.setAttribute('data-tone',tone)
      // Force the style change, then sample the actual CSS transitions at known times.
      style(dock).getPropertyValue('--command-orb-red')
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()))
      const transitions=dock.getAnimations().filter(a=>a instanceof CSSTransition)
      for(const animation of transitions){animation.pause();animation.currentTime=0}
      const start=sample()
      for(const animation of transitions)animation.currentTime=350
      const middle=sample()
      for(const animation of transitions)animation.currentTime=700
      const end=sample()
      for(const animation of transitions)animation.finish()
      return {before,start,middle,end,count:transitions.length}
    },tone)
    expect(frames.count).toBe(3)
    expect(frames.start.channels).toEqual(frames.before.channels)
    expect(frames.end.channels).toEqual(palette[tone])
    for(let i=0;i<3;i++)expect(frames.middle.channels[i]).toBeCloseTo((frames.before.channels[i]+palette[tone][i])/2,0)
    for(const part of Object.keys(frames.end.parts) as (keyof typeof frames.end.parts)[]){
      expect(frames.middle.parts[part],`${tone}: ${part} must leave its old color`).not.toBe(frames.before.parts[part])
      expect(frames.middle.parts[part],`${tone}: ${part} must not snap to its new color`).not.toBe(frames.end.parts[part])
    }
    await diagnosticScreenshot(page,{path:`${output}/orb-palette-${tone}-390x844.png`})
  }
  const interrupted=await orb.evaluate(async el=>{
    const dock=el.parentElement!
    const channels=()=>['red','green','blue'].map(c=>Number(getComputedStyle(dock).getPropertyValue(`--command-orb-${c}`)))
    dock.dataset.tone='red';el.setAttribute('data-tone','red')
    channels()
    await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()))
    for(const animation of dock.getAnimations()){animation.pause();animation.currentTime=350}
    const before=channels()
    dock.dataset.tone='ice';el.setAttribute('data-tone','ice')
    const after=channels()
    return {before,after}
  })
  for(let i=0;i<3;i++)expect(interrupted.after[i]).toBeCloseTo(interrupted.before[i],0)
  await page.emulateMedia({reducedMotion:'reduce'})
  await orb.evaluate(el=>{el.parentElement!.dataset.tone='green';el.setAttribute('data-tone','green')})
  expect(await orb.evaluate(el=>getComputedStyle(el).color)).toBe('rgb(135, 242, 187)')
  expect(await orb.evaluate(el=>getComputedStyle(el.parentElement!).transitionProperty)).toBe('none')
  await page.setViewportSize({width:1440,height:900})
  await expect(orb).toBeVisible()
  await diagnosticScreenshot(page,{path:`${output}/orb-palette-desktop-1440x900.png`})
})

test('orb symbols overlap in a holographic dissolve, settle after rapid changes, and switch immediately with reduced motion', async ({page}) => {
  await page.setViewportSize({width:390,height:844})
  const f=await intelligenceFixture(page)
  f.headers.push({id:id(850),kind:'Espionage',observed_at:baseTime,read:false,hidden:false})
  await page.goto(`/u/andromeda/b/${body.id}/overview`)
  const orb=page.getByTestId('command-orb')
  const symbols=orb.locator('[data-orb-symbol]')
  await expect(symbols).toHaveCount(1)
  await expect(symbols).toHaveAttribute('data-orb-symbol','message')
  await orb.evaluate(el=>{for(const a of el.getAnimations())if(a.effect?.getTiming().iterations===1)a.finish()})
  // Capture a complete overlap frame inside the browser. evaluateAll first
  // resolves element handles and then samples them in a separate task; an
  // outgoing symbol can be detached between those tasks on a busy CI runner.
  type SymbolFrame = { opacity:number; filter:string; transform:string; hidden:string|null; pointerEvents:string }
  await orb.evaluate(el=>{
    const target=el as Element & {symbolOverlap?:SymbolFrame[]}
    const sample=()=>{
      const frame=Array.from(el.querySelectorAll('[data-orb-symbol]'),node=>{
        const style=getComputedStyle(node)
        return {opacity:Number(style.opacity),filter:style.filter,transform:style.transform,hidden:node.getAttribute('aria-hidden'),pointerEvents:style.pointerEvents}
      })
      if(frame.length===2 && frame.every(part=>part.opacity>0 && part.opacity<1 && part.filter!=='blur(0px)' && part.filter!=='none' && part.transform!=='none')){
        target.symbolOverlap=frame
        return
      }
      if(el.isConnected)requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
  const incoming={sender:id(99),origin:{galaxy:1,system:372,position:3},target:body.id,mission:'Attack' as const,arrival_at:baseTime+180000,ships:{visibility:'Unknown' as const}}
  f.missions.incoming.push(incoming)
  await f.refresh()
  await expect(orb).toHaveAttribute('data-tone','red')
  let overlap:SymbolFrame[]=[]
  await expect.poll(async()=>{
    overlap=await orb.evaluate(el=>(el as Element & {symbolOverlap?:SymbolFrame[]}).symbolOverlap ?? [])
    return overlap.length
  },{intervals:[10,20,30]}).toBe(2)
  expect(overlap.map(({hidden,pointerEvents})=>({hidden,pointerEvents}))).toEqual([
    {hidden:'true',pointerEvents:'none'},
    {hidden:'true',pointerEvents:'none'},
  ])
  await diagnosticScreenshot(page,{path:`${output}/icon-dissolve-overlap-390x844.png`})
  await expect(symbols).toHaveCount(1)
  await expect(symbols).toHaveAttribute('data-orb-symbol','attack')
  await expect(symbols).toHaveCSS('opacity','1')
  await expect(symbols).toHaveCSS('filter','blur(0px)')
  await diagnosticScreenshot(page,{path:`${output}/icon-dissolve-attack-390x844.png`})
  f.missions.incoming.length=0
  await f.refresh()
  await expect(orb).toHaveAttribute('data-tone','champagne')
  await expect(symbols).toHaveCount(2)
  f.missions.incoming.push(incoming)
  await f.refresh()
  await expect(orb).toHaveAttribute('data-tone','red')
  // Wait for the requested state, then sample its settled layers atomically.
  // Separate count/attribute reads can straddle the start of a retargeted dissolve.
  await expect.poll(()=>symbols.evaluateAll(nodes=>nodes.map(node=>({
    kind:node.getAttribute('data-orb-symbol'),opacity:getComputedStyle(node).opacity,
  })))).toEqual([{kind:'attack',opacity:'1'}])
  // Refreshing the same icon must not create a second layer or replay the entrance.
  await f.refresh()
  await expect(symbols).toHaveCount(1)
  await expect(symbols).toHaveCSS('opacity','1')
  await diagnosticScreenshot(page,{path:`${output}/icon-dissolve-retarget-390x844.png`})
  await page.emulateMedia({reducedMotion:'reduce'})
  f.missions.incoming.length=0
  await f.refresh()
  await expect(orb).toHaveAttribute('data-tone','champagne')
  await expect(symbols).toHaveCount(1)
  await expect(symbols).toHaveAttribute('data-orb-symbol','message')
  await expect(symbols).toHaveCSS('opacity','1')
  await expect(symbols).toHaveCSS('transform','none')
  await expect(symbols).toHaveCSS('filter','none')
  await orb.click()
  await expect(page.getByRole('dialog',{name:'Command uplink'})).toBeVisible()
  await page.getByRole('button',{name:'Close command HUD'}).click()
  await page.setViewportSize({width:1440,height:900})
  await expect(orb).toBeVisible()
  await diagnosticScreenshot(page,{path:`${output}/icon-dissolve-desktop-1440x900.png`})
})

test('orb hover charges every layer, preserves its hit area and palette, and supports keyboard and reduced motion', async ({page}) => {
  await page.setViewportSize({width:390,height:844})
  const f=await intelligenceFixture(page)
  await page.goto(`/u/andromeda/b/${body.id}/overview`)
  const orb=page.getByTestId('command-orb')
  await expect(orb).toBeVisible()
  await orb.evaluate(el=>{for(const a of el.getAnimations())if(a.effect?.getTiming().iterations===1)a.finish()})
  const bounds=await orb.boundingBox()
  const channel=(name:string)=>orb.evaluate((el,name)=>Number(getComputedStyle(el.parentElement!).getPropertyValue(`--command-orb-${name}`)),name)
  await expect.poll(()=>channel('charge')).toBe(0)
  const idleAura=await orb.evaluate(el=>getComputedStyle(el,'::before').backgroundImage)
  await diagnosticScreenshot(page,{path:`${output}/hover-idle-390x844.png`})
  await orb.hover()
  await expect.poll(()=>channel('charge')).toBe(1)
  await expect(page.getByTestId('orb-charge')).toHaveCSS('opacity','1')
  expect(await orb.boundingBox()).toEqual(bounds)
  expect(await orb.evaluate(el=>Number(getComputedStyle(el.children[0]).scale))).toBeGreaterThan(1)
  expect(await orb.evaluate(el=>Number(getComputedStyle(el.children[2]).scale))).toBeGreaterThan(1)
  expect(await orb.evaluate(el=>getComputedStyle(el,'::before').backgroundImage)).not.toBe(idleAura)
  await diagnosticScreenshot(page,{path:`${output}/hover-charged-390x844.png`})
  f.missions.incoming.push({sender:id(99),origin:{galaxy:1,system:372,position:3},target:body.id,mission:'Attack',arrival_at:baseTime+180000,ships:{visibility:'Unknown'}})
  await f.refresh()
  await expect(orb).toHaveAttribute('data-tone','red')
  await expect(orb).toHaveCSS('color','rgb(255, 125, 131)')
  await expect.poll(()=>channel('charge')).toBe(1)
  await diagnosticScreenshot(page,{path:`${output}/hover-red-390x844.png`})
  await page.mouse.down()
  await expect.poll(()=>channel('press')).toBe(1)
  expect(await orb.evaluate(el=>Number(getComputedStyle(el.children[2]).scale))).toBeLessThan(1)
  expect(await orb.boundingBox()).toEqual(bounds)
  await diagnosticScreenshot(page,{path:`${output}/hover-pressed-390x844.png`})
  await page.mouse.up()
  await expect(page.getByRole('dialog',{name:'Command uplink'})).toBeVisible()
  await page.getByRole('button',{name:'Close command HUD'}).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.mouse.move(5,5)
  await expect.poll(()=>channel('charge')).toBe(0)
  await expect.poll(()=>channel('press')).toBe(0)
  await page.keyboard.press('Tab')
  await orb.focus()
  expect(await orb.evaluate(el=>el.matches(':focus-visible'))).toBe(true)
  await expect.poll(()=>channel('charge')).toBe(1)
  await diagnosticScreenshot(page,{path:`${output}/hover-keyboard-390x844.png`})
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog',{name:'Command uplink'})).toBeVisible()
  await page.getByRole('button',{name:'Close command HUD'}).click()
  await page.emulateMedia({reducedMotion:'reduce'})
  await orb.hover()
  await expect.poll(()=>channel('charge')).toBe(1)
  expect(await orb.evaluate(el=>getComputedStyle(el.children[2]).scale)).toBe('1')
  expect(await orb.evaluate(el=>getComputedStyle(el.children[2]).translate)).toBe('none')
  expect(await orb.evaluate(el=>getComputedStyle(el.parentElement!).transitionProperty)).toBe('none')
  await expect(page.getByTestId('orb-charge')).toHaveCSS('animation-name','none')
  await page.setViewportSize({width:1440,height:900})
  await expect(orb).toBeVisible()
  await diagnosticScreenshot(page,{path:`${output}/hover-desktop-1440x900.png`})
})

test.describe('orb touch feedback',()=>{
  test.use({hasTouch:true,isMobile:true})
  test('touch press compresses then releases without sticky hover or lost taps',async({page})=>{
    await page.setViewportSize({width:390,height:844})
    await intelligenceFixture(page)
    await page.goto(`/u/andromeda/b/${body.id}/overview`)
    const orb=page.getByTestId('command-orb')
    await expect(orb).toBeVisible()
    expect(await page.evaluate(()=>matchMedia('(hover: hover) and (pointer: fine)').matches)).toBe(false)
    await orb.evaluate(el=>{for(const a of el.getAnimations())if(a.effect?.getTiming().iterations===1)a.finish()})
    const channel=(name:string)=>orb.evaluate((el,name)=>Number(getComputedStyle(el.parentElement!).getPropertyValue(`--command-orb-${name}`)),name)
    const bounds=(await orb.boundingBox())!
    const cdp=await page.context().newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2}]})
    await expect.poll(()=>channel('press')).toBe(1)
    expect(await orb.evaluate(el=>Number(getComputedStyle(el.children[2]).scale))).toBeLessThan(1)
    await diagnosticScreenshot(page,{path:`${output}/hover-touch-390x844.png`})
    await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]})
    await expect.poll(()=>channel('press')).toBe(0)
    await expect.poll(()=>channel('charge')).toBe(0)
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2}]})
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
    await expect(page.getByRole('dialog',{name:'Command uplink'})).toBeVisible()
    await page.getByRole('button',{name:'Close command HUD'}).tap()
    await expect.poll(()=>channel('press')).toBe(0)
    await expect.poll(()=>channel('charge')).toBe(0)
    await expect(page.getByTestId('orb-charge')).toHaveCSS('opacity','0')
    await cdp.detach()
  })
})

test('a missing report cursor offers retry without an observer render loop', async ({page}) => {
  await page.setViewportSize({width:390,height:844})
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.clock.install()
  await intelligenceFixture(page)
  let requests=0
  await page.route('**/api/**/reports',route=>{
    requests++
    const {context}=route.request().postDataJSON()
    return route.fulfill({json:{protocol:4,...context,viewer_revision:'1',sampled_at:baseTime,as_of_ms:baseTime,data:{items:[],has_more:true,next_cursor:null,as_of_ms:baseTime}}})
  })
  await page.goto(`/u/andromeda/b/${body.id}/overview`)
  await page.getByTestId('command-orb').click()
  const panel=page.getByRole('dialog')
  await expect(panel.getByRole('button',{name:'Retry intelligence'})).toBeVisible()
  await expect(panel.getByRole('button',{name:'Load more intelligence'})).toHaveCount(0)
  await expect(panel.getByText('No new intelligence. All channels clear.')).toHaveCount(0)
  await expect(panel.getByText('Loading intelligence…')).toHaveCount(0)
  const before=requests
  await page.clock.runFor(1000)
  expect(requests).toBe(before)
  await panel.getByRole('button',{name:'Retry intelligence'}).click()
  await expect.poll(()=>requests).toBeGreaterThan(before)
  await expect(panel.getByRole('button',{name:'Retry intelligence'})).toBeVisible()
})


test('spy contacts are regular unread notifications and only active attacks make the orb red', async ({page}) => {
  await page.setViewportSize({width:390,height:844})
  await page.emulateMedia({reducedMotion:'reduce'})
  const f = await intelligenceFixture(page)
  f.headers.push({id:id(870),kind:'SpyContact',observed_at:baseTime-86400000,read:false,hidden:false})
  await page.goto(`/u/andromeda/b/${body.id}/overview`)
  const orb = page.getByTestId('command-orb')
  await expect(orb).toHaveAttribute('data-tone','champagne')
  await expect(orb).toHaveAccessibleName('1 unread items. Open command HUD')
  await expect(orb).toHaveCSS('color','rgb(236, 211, 159)')
  await expect(page.getByLabel('Recent game events').getByRole('button')).toHaveCount(0)
  await diagnosticScreenshot(page,{path:`${output}/spy-unread-login-390x844.png`})
  await orb.click()
  await expect(page.getByRole('dialog').getByRole('button',{name:/Spy Contact report/})).toHaveAttribute('data-tone','champagne')
  await diagnosticScreenshot(page,{path:`${output}/spy-unread-inbox-390x844.png`})
  await page.getByRole('button',{name:'Close command HUD'}).click()
  f.headers.unshift({id:id(871),kind:'SpyContact',observed_at:baseTime,read:false,hidden:false})
  await f.refresh()
  const report = page.getByLabel('Recent game events').getByRole('button',{name:/Spy Contact report/})
  await expect(report).toHaveAttribute('data-tone','champagne')
  await expect(orb).toHaveAttribute('data-tone','champagne')
  await diagnosticScreenshot(page,{path:`${output}/spy-contact-toast-390x844.png`})
  const probe = {sender:id(99),origin:{galaxy:1,system:372,position:3},target:body.id,mission:'Espionage' as const,arrival_at:baseTime+180000,ships:{visibility:'Unknown' as const}}
  f.missions.incoming.push(probe)
  await f.refresh()
  await expect(page.getByLabel('Recent game events').getByRole('button',{name:/Enemy probes detected/})).toHaveAttribute('data-tone','champagne')
  await expect(orb).toHaveAttribute('data-tone','champagne')
  await diagnosticScreenshot(page,{path:`${output}/spy-incoming-390x844.png`})
  f.missions.incoming.unshift({...probe,mission:'Attack'})
  await f.refresh()
  await expect(orb).toHaveAttribute('data-tone','red')
  await expect(orb.locator('[data-orb-symbol]')).toHaveAttribute('data-orb-symbol','attack')
  await diagnosticScreenshot(page,{path:`${output}/spy-with-active-attack-390x844.png`})
  f.missions.incoming.shift()
  await f.refresh()
  await expect(orb).toHaveAttribute('data-tone','champagne')
  await page.setViewportSize({width:1440,height:900})
  await expect(orb).toBeVisible()
  await diagnosticScreenshot(page,{path:`${output}/spy-unread-desktop-1440x900.png`})
})

test('fleet accordion shows empire-wide flight paths, live timing, massive manifests and compact navigation', async ({page}) => {
  await page.setViewportSize({width:390,height:844})
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.clock.install({time:baseTime})
  await page.clock.pauseAt(baseTime)
  const f = await intelligenceFixture(page, true, [{...body,name:'Aster Prime'},{...body,id:id(6),name:'Vesper',coordinates:{galaxy:1,system:370,position:4}}], [{id:id(47),name:'Nova Bastion',kind:'Planet',coordinates:{galaxy:1,system:372,position:3}}])
  const massive: S['PublicShip4'][] = [
    {ship_type:'LightFighter',count:'120000'}, {ship_type:'HeavyFighter',count:'60000'},
    {ship_type:'Cruiser',count:'30000'}, {ship_type:'Battleship',count:'20000'},
    {ship_type:'Battlecruiser',count:'10000'}, {ship_type:'Bomber',count:'5000'},
    {ship_type:'Destroyer',count:'4000'}, {ship_type:'Dreadnought',count:'1000'},
  ]
  const makeFleet = (n:number, mission:S['Mission4'], leg:S['OwnMission4']['leg'], due:number):S['OwnMission4'] => {
    const ships = n===912 ? massive : [{ship_type:'SmallCargo' as const,count:'3'}]
    const duration = n===912 ? 7200000 : 300000
    return {
      id:id(n), intent:{origin:n===910?body.id:id(6),destination:{type:'Body',id:id(47),expected_owner:id(99),expected_kind:'Planet'},mission,ships:ships.map(ship=>({...ship,owner:binding.player})),cargo:{metal:'0',crystal:'0',deuterium:'0'},speed_percent:100},
      origin:n===910?body.coordinates:{galaxy:1,system:370,position:4}, destination:{galaxy:1,system:372,position:3}, leg, ships,
      cargo:{metal:'0',crystal:'0',deuterium:'0'},due_at:baseTime+due,launched_at:baseTime+due-(leg==='Returning'?2:1)*duration,duration_ms:duration,paid_fuel:'1000000',can_recall:leg==='Outbound',
    }
  }
  f.missions.fleets.push(makeFleet(910,'Transport','Outbound',185000),makeFleet(911,'Harvest','Returning',65000),makeFleet(912,'Attack','Outbound',3725000))
  await page.goto(`/u/andromeda/b/${body.id}/overview`)
  await expect(page.getByTestId('command-orb')).toBeVisible()
  await page.getByTestId('command-orb').click()
  const panel = page.getByRole('dialog',{name:'Command uplink'})
  const toggle = panel.getByRole('button',{name:/Fleets/})
  const list = panel.getByRole('list',{name:'Empire fleets',exact:true})
  await expect(toggle).toHaveAttribute('aria-expanded','false')
  await expect(toggle).toContainText('3 / 8 slots')
  await expect(list).toBeHidden()
  const allFleets = panel.getByRole('link',{name:'All fleets',exact:true})
  await expect(allFleets).toHaveCount(1)
  await expect(allFleets).toHaveText('')
  await expect(allFleets).toHaveAttribute('title','All fleets')
  await diagnosticScreenshot(page,{path:`${output}/fleets-collapsed-390x844.png`})
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded','true')
  const rows = list.getByRole('article')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0)).toContainText('Harvest')
  await expect(rows.nth(0)).toContainText('Returning')
  await expect(rows.nth(0).getByRole('img',{name:'Returning: Vesper [1:370:4] ← Nova Bastion [1:372:3]',exact:true})).toBeVisible()
  await expect(rows.nth(1).getByRole('img',{name:'Outbound: Aster Prime [1:371:12] → Nova Bastion [1:372:3]',exact:true})).toBeVisible()
  await expect(rows.nth(2)).toContainText('250,000 ships')
  await expect(rows.nth(2).getByRole('timer')).toHaveText('Arrives in 1h 2m 5s')
  await expect(rows.nth(0).getByRole('timer')).toHaveText('Home in 1m 5s')
  await expect(panel.locator('time')).toHaveCount(0)
  await expect(rows.getByRole('timer')).toHaveCount(3)
  await diagnosticScreenshot(page,{path:`${output}/fleets-expanded-390x844.png`})
  await page.clock.runFor(5000)
  await expect(rows.nth(2).getByRole('timer')).toHaveText('Arrives in 1h 2m 0s')
  await page.setViewportSize({width:320,height:740})
  expect(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true)
  expect(await list.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true)
  await diagnosticScreenshot(page,{path:`${output}/fleets-expanded-320x740.png`})
  await toggle.focus();await page.keyboard.press('Enter')
  await expect(list).toBeHidden()
  await page.keyboard.press('Space')
  await expect(list).toBeVisible()
  f.missions.fleets.splice(0,2)
  await f.refresh()
  await page.clock.runFor(1)
  await expect(rows).toHaveCount(1)
  await expect(toggle).toContainText('1 / 8 slots')
  await page.setViewportSize({width:390,height:844})
  await toggle.blur()
  await diagnosticScreenshot(page,{path:`${output}/fleets-massive-390x844.png`})
  const manifest = rows.getByRole('button',{name:'Attack ship composition: 250,000 ships',exact:true})
  await expect(manifest).toHaveAttribute('aria-expanded','false')
  await manifest.click()
  const ships = rows.getByRole('list',{name:'Ship composition'})
  await expect(ships.getByRole('listitem')).toHaveCount(8)
  await expect(ships.getByRole('listitem').first()).toContainText('Light Fighter 120,000')
  await expect(ships.getByRole('listitem').last()).toContainText('Dreadnought 1,000')
  await diagnosticScreenshot(page,{path:`${output}/fleets-manifest-390x844.png`})
  await page.setViewportSize({width:320,height:740})
  expect(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true)
  await diagnosticScreenshot(page,{path:`${output}/fleets-manifest-320x740.png`})
  await manifest.click()
  await expect(ships).toBeHidden()
  await list.getByRole('link',{name:'Attack fleet details'}).click()
  await expect(page).toHaveURL(new RegExp(`/b/${id(6)}/fleets/${id(912)}$`))
  await expect(panel).not.toBeVisible()
  f.missions.fleets.length=0
  await page.goto(`/u/andromeda/b/${body.id}/overview`)
  await page.getByTestId('command-orb').click()
  await toggle.click()
  await expect(panel.getByText('No active fleets. All fleet slots are available.')).toBeVisible()
  await expect(toggle).toContainText('0 / 8 slots')
  await diagnosticScreenshot(page,{path:`${output}/fleets-empty-320x740.png`})
  await panel.getByRole('link',{name:'All fleets',exact:true}).click()
  await expect(page).toHaveURL(new RegExp(`/b/${body.id}/fleets$`))
  await expect(panel).not.toBeVisible()
  await page.setViewportSize({width:1440,height:900})
  await page.goto(`/u/andromeda/b/${body.id}/overview`)
  await expect(page.locator('main h1')).toContainText('Empire —')
  await expect(page.getByTestId('command-orb')).toBeVisible()
  await diagnosticScreenshot(page,{path:`${output}/fleets-desktop-1440x900.png`})
})


for (const [width, height] of [[390, 844], [1440, 900]]) {
  test(`enemy attacks appear only for incoming attacks at ${width}x${height}`, async ({page}) => {
    await page.setViewportSize({width,height})
    await page.emulateMedia({reducedMotion:'reduce'})
    await page.clock.install({time:baseTime})
    await page.clock.pauseAt(baseTime)
    const f=await intelligenceFixture(page)
    await page.goto(`/u/andromeda/b/${body.id}/overview`)
    await page.getByTestId('command-orb').click()
    const panel=page.getByRole('dialog',{name:'Command uplink'})
    const enemies=panel.getByRole('region',{name:'Enemy attacks',exact:true})
    await expect(panel).toBeVisible()
    await expect(enemies).toHaveCount(0)
    await expect(panel.getByRole('button',{name:/^Fleets/})).toBeVisible()

    const incoming:S['IncomingMission4']={sender:id(99),origin:{galaxy:1,system:372,position:3},target:body.id,mission:'Transport',arrival_at:baseTime+180000,ships:{visibility:'Unknown'}}
    f.missions.incoming.push(incoming)
    await f.refresh();await page.clock.runFor(1)
    await expect(enemies).toHaveCount(0)
    await diagnosticScreenshot(page,{path:`${output}/no-enemy-attacks-${width}x${height}.png`})

    f.missions.incoming.push({...incoming,mission:'Attack'})
    await f.refresh();await page.clock.runFor(1)
    await expect(enemies).toBeVisible()
    await expect(enemies.getByRole('button',{name:'Enemy attacks 1',exact:true})).toHaveAttribute('aria-expanded','true')
    await expect(enemies.getByRole('article')).toHaveCount(1)
    await diagnosticScreenshot(page,{path:`${output}/incoming-enemy-attack-${width}x${height}.png`})

    f.missions.incoming.pop()
    await f.refresh();await page.clock.runFor(1)
    await expect(enemies).toHaveCount(0)
    await expect(panel.getByRole('button',{name:/^Enemy attacks/})).toHaveCount(0)
    await diagnosticScreenshot(page,{path:`${output}/enemy-attacks-cleared-${width}x${height}.png`})
  })
}

test('enemy attacks open above fleets, use red, keep hidden intelligence hidden, and collapse independently', async ({page}) => {
  await page.setViewportSize({width:390,height:844})
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.clock.install({time:baseTime})
  await page.clock.pauseAt(baseTime)
  const f=await intelligenceFixture(page,true,[{...body,name:'Aster Prime'}],[{id:id(47),kind:'Planet',name:'Nova Bastion',coordinates:{galaxy:1,system:372,position:3}}],{[id(99)]:'Nova',[id(98)]:'Rook'})
  const ships:S['PublicShip4'][]=[{ship_type:'Cruiser',count:'1200'},{ship_type:'Battleship',count:'300'}]
  const own=(n:number,mission:S['Mission4'],leg:S['OwnMission4']['leg']):S['OwnMission4']=>({
    id:id(n),intent:{origin:body.id,destination:{type:'Body',id:id(47),expected_owner:id(99),expected_kind:'Planet'},mission,ships:ships.map(ship=>({...ship,owner:binding.player})),cargo:{metal:'0',crystal:'0',deuterium:'0'},speed_percent:100},
    origin:body.coordinates,destination:{galaxy:1,system:372,position:3},leg,ships,cargo:{metal:'0',crystal:'0',deuterium:'0'},due_at:baseTime+10000,launched_at:baseTime-10000,duration_ms:20000,paid_fuel:'0',can_recall:leg==='Outbound',
  })
  f.missions.fleets.push(own(930,'Attack','Outbound'),own(931,'Transport','Returning'))
  const attack:S['IncomingMission4']={sender:id(99),origin:{galaxy:1,system:372,position:3},target:body.id,mission:'Attack',arrival_at:baseTime+180000,ships:{visibility:'Unknown'}}
  f.missions.incoming.push(attack,{...attack,sender:id(98),arrival_at:baseTime+300000,ships:{visibility:'Exact',total:'1500',ships}},{...attack,mission:'Transport'})
  await page.goto(`/u/andromeda/b/${body.id}/overview`)
  await expect(page.getByTestId('command-orb')).toBeVisible()
  await page.getByTestId('command-orb').click()
  const panel=page.getByRole('dialog',{name:'Command uplink'})
  const enemyToggle=panel.getByRole('button',{name:'Enemy attacks 2',exact:true})
  const ownToggle=panel.getByRole('button',{name:/^Fleets/})
  const enemies=panel.getByRole('list',{name:'Enemy attacks',exact:true})
  const fleets=panel.getByRole('list',{name:'Empire fleets',exact:true})
  await expect(enemyToggle).toHaveAttribute('aria-expanded','true')
  await expect(enemies.getByRole('article')).toHaveCount(2)
  await expect(enemies.getByRole('article').first()).toContainText('Ships unknown')
  await expect(enemies.getByRole('article').first()).toContainText('Nova')
  await expect(enemies.getByRole('timer').first()).toHaveText('Arrives in 3m 0s')
  await expect(panel.getByLabel('Intelligence list').getByRole('button')).toHaveCount(0)
  expect((await enemyToggle.boundingBox())!.y).toBeLessThan((await ownToggle.boundingBox())!.y)
  await diagnosticScreenshot(page,{path:`${output}/enemy-attacks-390x844.png`})
  await ownToggle.click()
  await expect(fleets.locator('img')).toHaveCount(4)
  await expect.poll(()=>fleets.locator('img').evaluateAll(images=>images.every(image=>(image as HTMLImageElement).complete&&(image as HTMLImageElement).naturalWidth>0))).toBe(true)
  const colors=await panel.getByRole('article').evaluateAll(rows=>rows.map(row=>getComputedStyle(row).getPropertyValue('--flight').trim()))
  expect(colors).toEqual(['#ff7d83','#ff7d83','#ecd39f','#a4dbef'])
  await diagnosticScreenshot(page,{path:`${output}/enemy-and-own-fleets-390x844.png`})
  await page.setViewportSize({width:320,height:740})
  expect(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true)
  await diagnosticScreenshot(page,{path:`${output}/enemy-and-own-fleets-320x740.png`})
  await enemies.getByRole('button',{name:'Enemy ship composition: 1,500 ships'}).click()
  await expect(enemies.getByRole('list',{name:'Ship composition'})).toContainText('Cruiser 1,200')
  await diagnosticScreenshot(page,{path:`${output}/enemy-manifest-320x740.png`})
  await enemyToggle.click()
  await expect(enemies).toBeHidden()
  await expect(fleets).toBeVisible()
  await diagnosticScreenshot(page,{path:`${output}/enemy-attacks-collapsed-320x740.png`})
  const marker=fleets.getByRole('article').first().locator('.lucide-rocket').locator('..')
  const start=await marker.evaluate(el=>(el as HTMLElement).style.left)
  await page.emulateMedia({reducedMotion:'no-preference'})
  await page.clock.runFor(250)
  expect(await marker.evaluate(el=>(el as HTMLElement).style.left)).not.toBe(start)
  const animation=await marker.evaluate(el=>({transition:getComputedStyle(el).transitionProperty,duration:getComputedStyle(el).transitionDuration,active:el.getAnimations().map(animation=>animation.constructor.name)}))
  expect(animation.transition).toBe('left')
  expect(animation.duration).toBe('0.25s')
  expect(animation.active).toContain('CSSTransition')
  await page.emulateMedia({reducedMotion:'reduce'})
  expect(await marker.evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s')
  await enemyToggle.click()
  await enemies.getByRole('button',{name:'Attack',exact:true}).first().click()
  await expect(panel).toHaveCount(0)
  await expect(page.getByRole('dialog',{name:'Hostile fleet inbound'})).toBeVisible()
  await page.getByRole('button',{name:'Back to list'}).click()
  f.missions.incoming.length=0
  await f.refresh();await page.clock.runFor(1)
  await expect(panel.getByRole('region',{name:'Enemy attacks',exact:true})).toHaveCount(0)
  await expect(panel.getByRole('button',{name:/^Enemy attacks/})).toHaveCount(0)
  await diagnosticScreenshot(page,{path:`${output}/enemy-attacks-cleared-320x740.png`})
})


test('orb popup animates out on close, Escape and backdrop dismissal before releasing the modal', async ({page}) => {
  await page.setViewportSize({width:390,height:844})
  await page.emulateMedia({reducedMotion:'no-preference'})
  await intelligenceFixture(page)
  await page.goto(`/u/andromeda/b/${body.id}/overview`)
  const orb=page.getByTestId('command-orb')
  const panel=page.getByRole('dialog',{name:'Command uplink',exact:true})
  await expect(orb).toBeVisible()
  await page.evaluate(()=>window.scrollTo(0,150))
  const originalY=await page.evaluate(()=>scrollY)
  for(const dismissal of ['button','escape','backdrop'] as const){
    await orb.click()
    await expect(panel).toBeVisible()
    await expect.poll(()=>panel.evaluate(el=>getComputedStyle(el).opacity)).toBe('1')
    await expect(panel).toContainText('No new intelligence. All channels clear.')
    if(dismissal==='button')await diagnosticScreenshot(page,{path:`${output}/popup-open-390x844.png`})
    const samples=await panel.evaluate(async (el,dismissal)=>{
      const dialog=el as HTMLDialogElement
      if(dismissal==='button')dialog.querySelector<HTMLButtonElement>('[aria-label="Close command HUD"]')!.click()
      else if(dismissal==='escape')dialog.dispatchEvent(new Event('cancel',{cancelable:true}))
      else dialog.click()
      const samples=[]
      while(dialog.isConnected){
        samples.push({
          opacity:Number(getComputedStyle(dialog).opacity),
          transform:getComputedStyle(dialog).transform,
          backdropOpacity:Number(getComputedStyle(dialog,'::backdrop').opacity),
          modal:dialog.matches(':modal'),
          locked:document.body.style.position==='fixed',
          content:dialog.textContent,
          closing:dialog.hasAttribute('data-closing'),
          inert:dialog.firstElementChild!.hasAttribute('inert'),
        })
        await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()))
      }
      return samples
    },dismissal)
    const fading=samples.filter(s=>s.closing&&s.opacity>0&&s.opacity<0.95)
    expect(fading.length,`${dismissal} must visibly fade before unmounting`).toBeGreaterThan(0)
    for(const sample of fading){
      expect(sample.modal).toBe(true)
      expect(sample.locked).toBe(true)
      expect(sample.inert).toBe(true)
      expect(sample.content).toContain('No new intelligence. All channels clear.')
      expect(sample.transform).not.toBe('none')
    }
    expect(samples.some(s=>s.backdropOpacity>0&&s.backdropOpacity<0.95)).toBe(true)
    await expect(panel).toHaveCount(0)
    await expect(orb).toBeFocused()
    expect(await page.evaluate(()=>document.body.style.position)).toBe('')
    expect(await page.evaluate(()=>scrollY)).toBe(originalY)
  }
  await diagnosticScreenshot(page,{path:`${output}/popup-closed-390x844.png`})
  if(process.env.ORBIT_TEST_SCREENSHOTS==='1'){
    await orb.click()
    await expect.poll(()=>panel.evaluate(el=>getComputedStyle(el).opacity)).toBe('1')
    await panel.evaluate(async el=>{
      el.querySelector<HTMLButtonElement>('[aria-label="Close command HUD"]')!.click()
      await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())))
      for(const animation of el.getAnimations()){
        animation.pause()
        animation.currentTime=Number(animation.effect!.getTiming().duration)/2
      }
    })
    await diagnosticScreenshot(page,{path:`${output}/popup-closing-390x844.png`})
    await panel.evaluate(el=>{for(const animation of el.getAnimations())animation.play()})
    await expect(panel).toHaveCount(0)
  }
  // Native Escape must be prevented while the exit plays, then return focus.
  await orb.click()
  await expect(panel).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(orb).toBeFocused()
  await page.emulateMedia({reducedMotion:'reduce'})
  await orb.click()
  expect(await panel.evaluate(el=>getComputedStyle(el).opacity)).toBe('1')
  expect(await panel.evaluate(el=>getComputedStyle(el,'::backdrop').animationName)).toBe('none')
  await page.getByRole('button',{name:'Close command HUD'}).click()
  await expect(panel).toHaveCount(0)
  await orb.click()
  await expect(panel).toBeVisible()
  await page.setViewportSize({width:1440,height:900})
  await expect(orb).toBeVisible()
  await expect(panel).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(orb).toBeFocused()
  expect(await page.evaluate(()=>document.body.style.position)).toBe('')
  await diagnosticScreenshot(page,{path:`${output}/popup-desktop-1440x900.png`})
})

async function setAppHidden(page: Page, hidden: boolean) {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'hidden', { configurable: true, value })
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: value ? 'hidden' : 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  }, hidden)
}

test('return refresh waits for success after five minutes and plays once with accessible reduced motion', async ({page}) => {
  await page.setViewportSize({width:390,height:844})
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.clock.install()
  await page.addInitScript(()=>{Math.random=()=>0})
  await intelligenceFixture(page)
  await page.goto(`/u/andromeda/b/${body.id}/overview`)
  const caption = page.getByTestId('orb-caption')
  await expect(caption).toHaveText('Systems Online')
  await page.clock.fastForward(6000)
  const initial = await page.evaluate(()=>Date.now())
  await setAppHidden(page, true)
  await page.clock.setSystemTime(initial + 4*60*1000)
  await setAppHidden(page, false)
  await page.clock.runFor(300)
  await expect(page.getByTestId('orb-refresh-pulse')).toHaveCount(0)

  let failed = 0
  await page.route('**/api/**/overview', async route => {
    failed++
    await route.fulfill({status:503,json:{code:'Unavailable'}})
  })
  await setAppHidden(page, true)
  await page.clock.setSystemTime((await page.evaluate(()=>Date.now())) + 5*60*1000)
  await setAppHidden(page, false)
  await page.clock.runFor(300)
  await expect.poll(()=>failed).toBeGreaterThan(0)
  await expect(caption).toHaveText('Connection lost.')
  await expect(page.getByTestId('orb-refresh-pulse')).toHaveCount(0)
  await page.unroute('**/api/**/overview')
  await page.clock.fastForward(6000)
  await refreshGame(page)
  await page.clock.runFor(300)
  await expect(caption).toHaveText('Updated')
  await expect(page.getByRole('status').filter({hasText:'Updated'})).toBeVisible()
  await expect(page.getByTestId('orb-refresh-pulse').locator('span').first()).toHaveCSS('animation-name','none')
  await diagnosticScreenshot(page,{path:`${output}/updated-reduced-motion-390x844.png`})
  await page.clock.fastForward(6000)
  await refreshGame(page)
  await page.clock.runFor(300)
  await expect(page.getByTestId('orb-refresh-pulse')).toHaveCount(0)
  await expect(caption).toHaveCount(0)
})

test('return refresh animation preview at mobile and desktop sizes', async ({page}) => {
  await page.setViewportSize({width:390,height:844})
  await page.emulateMedia({reducedMotion:'no-preference'})
  await page.addInitScript(()=>{Math.random=()=>0})
  await page.clock.install()
  await intelligenceFixture(page)
  await page.goto(`/u/andromeda/b/${body.id}/overview`)
  await expect(page.getByTestId('command-orb')).toBeVisible()
  // Playwright's clock advances JS timers, not the CSS animation timeline.
  // Wait for the real entrance to finish so this replay shows only refresh.
  await page.getByTestId('command-orb').evaluate(async orb => {
    await Promise.all(orb.getAnimations()
      .filter(animation => animation instanceof CSSAnimation && animation.animationName.includes('orbIn'))
      .map(animation => animation.finished))
  })
  await expect(page.getByTestId('command-orb')).toHaveCSS('transform','matrix(1, 0, 0, 1, 0, 0)')
  await expect(page.getByTestId('command-orb')).toHaveCSS('opacity','1')
  await page.clock.fastForward(6000)
  await expect(page.getByTestId('orb-caption')).toHaveCount(0)
  if(process.env.ORBIT_TEST_SCREENSHOTS === '1') {
    await diagnosticScreenshot(page,{path:`${output}/refresh-idle-390x844.png`})
    for(let frame=0;frame<10;frame++)
      await diagnosticScreenshot(page,{path:`${output}/refresh-review-frames/frame-${String(frame).padStart(2,'0')}.png`})
  }
  await setAppHidden(page, true)
  await page.clock.setSystemTime((await page.evaluate(()=>Date.now())) + 25*60*1000)
  await setAppHidden(page, false)
  await expect(page.getByTestId('orb-caption')).toHaveText('Updated')
  const pulse=page.getByTestId('orb-refresh-pulse')
  expect(await pulse.locator('span').first().evaluate(el=>getComputedStyle(el).animationName)).toContain('refreshWave')
  if(process.env.ORBIT_TEST_SCREENSHOTS === '1') {
    // Sample the actual CSS animations deterministically for a reviewable replay.
    await page.clock.pauseAt(await page.evaluate(()=>Date.now()))
    const animations = await page.evaluateHandle(() => document.getAnimations().map(animation => {
      animation.pause()
      return {animation, start: Number(animation.currentTime ?? 0)}
    }))
    for(let frame=0;frame<40;frame++) {
      await animations.evaluate((items,time)=>items.forEach(({animation,start})=>{animation.currentTime=start+time}),frame*100)
      await diagnosticScreenshot(page,{path:`${output}/refresh-review-frames/frame-${String(frame+10).padStart(2,'0')}.png`})
      if(frame===7) await diagnosticScreenshot(page,{path:`${output}/updated-390x844.png`})
    }
    await animations.evaluate(items=>items.forEach(({animation,start})=>{animation.currentTime=start+700}))
    await animations.dispose()
  }
  await page.setViewportSize({width:320,height:740})
  const bounds=(await page.getByTestId('orb-caption').boundingBox())!
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  await diagnosticScreenshot(page,{path:`${output}/updated-320x740.png`})
  await page.setViewportSize({width:1440,height:900})
  await expect(page.getByTestId('command-orb')).toBeVisible()
  await diagnosticScreenshot(page,{path:`${output}/updated-desktop-1440x900.png`})
})

for (const [width, height] of [[390, 844], [1440, 900]]) {
  test(`shared inbox removes reports deleted elsewhere from the badge and panel at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const f = await intelligenceFixture(page)
    f.headers.push(
      ...Array.from({ length: 3 }, (_, i) => ({ id: id(4000 + i), kind: 'Espionage', observed_at: baseTime - i, read: false, hidden: false })),
      { id: id(4003), kind: 'SpyContact', observed_at: baseTime - 3, read: true, hidden: false },
    )
    await page.goto(`/u/andromeda/b/${body.id}/reports`)
    await expect(page.getByRole('heading', { level: 1, name: 'Reports', exact: true })).toBeVisible()
    const orb = page.getByTestId('command-orb')
    const badge = page.getByTestId('unread-count')
    await expect(badge).toHaveText('3')
    await orb.click()
    const panel = page.getByRole('dialog', { name: 'Command uplink', exact: true })
    await expect(panel.getByLabel('Intelligence list').getByRole('button')).toHaveCount(3)
    await page.getByRole('button', { name: 'Close command HUD' }).click()

    // Another session deleted the unread reports: subsequent server pages omit
    // them, but their detail headers remain cached in this client.
    f.headers.splice(0, 3)
    await f.refresh()
    await expect(page.locator('main article')).toHaveCount(1)
    await expect(badge).toHaveCount(0)
    await expect(orb).toHaveAttribute('data-tone', 'ice')
    await diagnosticScreenshot(page, { path: `${output}/reconciled-reports-${width}x${height}.png` })
    await orb.click()
    await expect(panel.getByLabel('Intelligence list').getByRole('button')).toHaveCount(0)
    await expect(panel).toContainText('No new intelligence. All channels clear.')
    await diagnosticScreenshot(page, { path: `${output}/reconciled-empty-inbox-${width}x${height}.png` })

    f.headers.unshift({ id: id(4004), kind: 'Espionage', observed_at: baseTime + 1, read: false, hidden: false })
    await f.refresh()
    await expect(badge).toHaveText('1')
    await expect(panel.getByLabel('Intelligence list').getByRole('button')).toHaveCount(1)
    await expect(panel).not.toContainText('All channels clear.')
    await diagnosticScreenshot(page, { path: `${output}/reconciled-new-report-${width}x${height}.png` })
  })
}


for (const [width, height] of [[390, 844], [1440, 900]]) {
  test(`reports tab and orb share archive pages and read acknowledgements at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const f = await intelligenceFixture(page)
    f.headers.push(...Array.from({ length: 51 }, (_, i) => ({
      id: id(5000 + i), kind: 'Espionage', observed_at: baseTime - i, read: i < 50, hidden: false,
    })))
    await page.goto(`/u/andromeda/b/${body.id}/reports`)
    await expect(page.getByRole('heading', { level: 1, name: 'Reports', exact: true })).toBeVisible()
    const rows = page.locator('main article')
    await expect(rows).toHaveCount(51)
    await expect(rows.getByLabel('Unread', { exact: true })).toHaveCount(1)
    await expect(page.getByTestId('unread-count')).toHaveText('1')
    await expect(page.getByRole('button', { name: 'Load more reports' })).toHaveCount(0)
    // Both mounted consumers share one fetch for each page, including the unread
    // report beyond the first page; opening the panel never creates another list.
    expect(f.reportQueries).toEqual([null, id(5049)])
    await rows.last().scrollIntoViewIfNeeded()
    await diagnosticScreenshot(page, { path: `${output}/shared-archive-tab-${width}x${height}.png` })
    await page.getByTestId('command-orb').click()
    const panel = page.getByRole('dialog')
    await expect(panel.getByLabel('Intelligence list').getByRole('button')).toHaveCount(1)
    expect(f.reportQueries).toEqual([null, id(5049)])
    await diagnosticScreenshot(page, { path: `${output}/shared-archive-panel-${width}x${height}.png` })
    await panel.getByRole('button', { name: /Espionage report/ }).click()
    await expect(panel.getByRole('region', { name: 'Report observation' })).toBeVisible()
    await expect.poll(() => f.reads.filter(r => r === 'MarkReportRead').length).toBe(1)
    await expect(page.getByTestId('unread-count')).toHaveCount(0)
    await panel.getByRole('link', { name: 'Open full report' }).click()
    await expect(page.getByRole('region', { name: 'Report observation' })).toBeVisible()
    await page.getByRole('link', { name: 'Back to reports' }).click()
    await expect(rows).toHaveCount(51)
    await expect(rows.getByLabel('Unread', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('status', { name: 'Unread reports', exact: true })).toHaveCount(0)
    expect(f.reads.filter(r => r === 'MarkReportRead')).toHaveLength(1)
    await rows.last().scrollIntoViewIfNeeded()
    await diagnosticScreenshot(page, { path: `${output}/shared-archive-read-${width}x${height}.png` })
  })
}
