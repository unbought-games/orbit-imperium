import { routeProgressionOptions } from './fixtures/progression-options'
import { expect, test, type Page } from './fixtures/test'
import { fixtureApiPath, refuseFixtureReads, installGameFixture, binding, body, id, refreshGame } from './fixtures/game'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import observation from '../../../contracts/fixtures/espionage-expanded.json' with { type: 'json' }
import type { components } from '../src/contracts'
import { withBootstrapResponse, withFixtureResponse, withFixtureResponseStatus, withReportListResponse, withReportResponse } from './fixtures/responses'
type S = components['schemas']
const output = 'test-results/live-hud'
const baseTime = 1793120000000
const emptyMissions = ():S['MissionView4'] => ({fleets:[],incoming:[],fleet_slots:'8',score_value_micro:'0'})

test('desktop orb anchors its panel across shell widths and preserves its open report on mobile', async ({ page }) => {
  const sizes = [[768, 600], [1024, 768], [1440, 900], [2560, 1440], [3440, 1440]]
  await page.setViewportSize({width: 768, height: 600})
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const f = await intelligenceFixture(page)
  f.headers.push({ id: id(850), kind: 'Espionage', observed_at: baseTime, read: false, hidden: false })
  await withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/overview`))
  const orb = page.getByTestId('command-orb')
  await expect(orb).toHaveAttribute('data-tone', 'champagne')
  await expect(orb).toHaveAttribute('aria-haspopup', 'dialog')
  await expect(orb).toHaveAttribute('aria-expanded', 'false')
  const panel = page.getByRole('dialog', { name: 'Command uplink', exact: true })
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height })
    const bounds = (await orb.boundingBox())!
    const content = (await page.getByRole('main').boundingBox())!
    const shell = (await page.locator('[data-has-command-hud]').boundingBox())!
    const orbRight = bounds.x + bounds.width
    expect(bounds.width).toBe(92)
    expect(orbRight).toBeLessThanOrEqual(shell.x + shell.width - 28)
    expect(orbRight).toBeGreaterThan(shell.x + shell.width - 52)
    if (width >= 1440) expect(bounds.x).toBeGreaterThan(content.x + content.width + 16)
    expect(bounds.y + bounds.height).toBeLessThan(height - 28)
    await orb.focus()
    await page.keyboard.press('Enter')
    await expect(panel.getByRole('heading', {name: 'Command uplink'})).toBeFocused()
    await expect(orb).toHaveAttribute('aria-expanded', 'true')
    const panelBox = (await panel.boundingBox())!
    expect(panelBox.x + panelBox.width - orbRight).toBeGreaterThanOrEqual(0)
    expect(panelBox.x + panelBox.width - orbRight).toBeLessThan(4)
    expect(panelBox.y).toBeGreaterThanOrEqual(0)
    expect(panelBox.y + panelBox.height).toBeLessThan(bounds.y)
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await expect(orb).toBeFocused()
  }
  const instance = await orb.elementHandle()
  await orb.click()
  await panel.getByRole('button', {name: /Espionage report/}).click()
  const detail = page.getByRole('dialog', {name: 'Espionage report', exact: true})
  await expect(detail.getByRole('group', {name:'Resource amounts'})).toBeVisible()
  for (const [width, height] of sizes) {
    await page.setViewportSize({width:390,height:844})
    await expect(detail).toBeVisible()
    expect(await instance!.evaluate(el => el.isConnected)).toBe(true)
    expect(await page.evaluate(() => document.body.style.position)).toBe('fixed')
    await page.setViewportSize({width, height})
    await expect(detail).toBeVisible()
  }
  await page.keyboard.press('Escape')
  await expect(detail).toHaveCount(0)
  await expect(orb).toBeFocused()
  await expect(orb).toHaveAttribute('aria-expanded', 'false')
  expect(await page.evaluate(() => document.body.style.position)).toBe('')
  await expect(orb).toHaveAttribute('data-tone','ice')
  await instance!.dispose()
})

async function intelligenceFixture(page: Page, bodies: S['BodyV3'][] = [body], destinations: S['Destination'][] = [], playerNames?: S['PublicPlayerNames4']) {
  let revision = 1
  const missions = emptyMissions()
  const headers:S['ReportHeader4'][]=[]
  const conversations:S['SocialConversation'][]=[]
  const circulars:S['SocialCircular'][]=[]
  const reads:string[]=[]
  await installGameFixture(page,{protocol:4,bodies,destinations,playerNames,missions,sampledAt:baseTime,viewerRevision:()=>String(revision),hasUnreadReports:()=>headers.some(h=>!h.read&&!h.hidden),extraCapabilities:['Reports','Espionage','Attack']})
  await page.route('**/api/**/reports',route=>{
    const {context,cursor,filter,kind}=route.request().postDataJSON()
    const rows=headers.filter(h=>(!filter||h.hidden===filter.hidden)&&(!filter?.unread_only||!h.read)&&(!filter?.starred_only||h.starred)&&(!kind||h.kind===kind))
    const start=cursor?rows.findIndex(h=>h.id===cursor)+1:0
    const hasMore=start+50<rows.length
    return route.fulfill({json:{protocol:4,...context,viewer_revision:String(revision),sampled_at:baseTime,as_of_ms:baseTime,data:{items:rows.slice(start,start+50),unread_count:Math.min(99,headers.filter(h=>!h.hidden&&!h.read).length),has_more:hasMore,next_cursor:hasMore?rows[start+49].id:null,as_of_ms:baseTime}}})
  })
  await page.route('**/api/**/reports/*',route=>{
    const context=route.request().postDataJSON()
    const report=route.request().url().split('/').at(-1)!
    const header=headers.find(h=>h.id===report)
    return route.fulfill({json:{protocol:4,...context,viewer_revision:String(revision),sampled_at:baseTime,as_of_ms:baseTime,data:{header,payload:observation}}})
  })
  await page.route('**/social/query',route=>{
    const {context,query}=route.request().postDataJSON()
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
  return { missions, headers, conversations, circulars, reads, refresh:async()=>{revision++;await refreshGame(page)} }
}
test('live mobile HUD receives reports, messages and threats across navigation and preserves server truth',async({page})=>{
  await page.setViewportSize({width:390,height:844})
  await page.emulateMedia({reducedMotion:'reduce'})
  const f=await intelligenceFixture(page)
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message))
  await withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/overview`))
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
  if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
    await page.setViewportSize({width:1440,height:900})
    await diagnosticScreenshot(page,{path:`${output}/report-toast-1440x900.png`})
    await page.setViewportSize({width:390,height:844})
  }
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
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Open conversation', exact: true })).toHaveAttribute('href', `/u/andromeda/b/${body.id}/messages?player=${id(99)}`)
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

test('real quick-build only acknowledges committed orders and leaves rejection visible', { tag: '@journey' },async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'})
  let reject=false
  await installGameFixture(page,{protocol:4,missions:emptyMissions(),catalog:[{key:{kind:'Building',id:'MetalMine'},enabled:true,mobile:false,body_kinds:['Planet'],requirements:[]}]})
  await routeProgressionOptions(page,route=>{
    const {context,request}=route.request().postDataJSON()
    return route.fulfill({json:{protocol:4,...context,viewer_revision:'1',sampled_at:Date.now(),as_of_ms:Date.now(),request,terms_hash:'b'.repeat(64),blockers:[],estimates:null,terms:{type:'Building',profile_hash:'a'.repeat(64),body:body.id,building:'MetalMine',action:'Upgrade',source_level:1,target_level:2,paid:{metal:'1000000',crystal:'1000000',deuterium:'0'},duration_ms:60000,formula:'BuildingRedesign2011',facilities:[],required_energy:'0',reserve_fields:1}}})
  })
  await page.route('**/commands',route=>{
    const {gameplay}=route.request().postDataJSON();if(gameplay.command.type!=='StartUpgrade')return route.fallback()
    return route.fulfill({json:{protocol:4,binding,command_id:gameplay.command_id,admitted_at:Date.now(),executed_at:Date.now(),...(reject?{status:'Rejected',code:'InsufficientResources'}:{status:'Committed',result_ids:[id(900)],minimum_viewer_revision:'1'})}})
  })
  await withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/resources`))
  const quick=page.getByRole('button',{name:/Upgrade Metal Mine|Build Metal Mine/}).first()
  await expect(quick).toBeEnabled();await quick.click()
  const toast=page.getByLabel('Recent game events').getByRole('button',{name:/Construction started/})
  await expect(toast).toBeVisible();await expect(toast).toContainText('level 2')
  await expect(page.getByTestId('command-orb')).toHaveAttribute('data-tone','green')
  await diagnosticScreenshot(page,{path:`${output}/building-390x844.png`})
  // Reload intentionally removes ephemeral acknowledgments and restored success history is silent.
  reject=true;await withBootstrapResponse(page, () => page.reload());await expect(page.getByTestId('command-orb')).toHaveAttribute('data-tone','ice')
  await quick.click();await expect(page.getByLabel('Action needs attention')).toContainText('rejected')
  await expect(page.getByLabel('Recent game events').getByRole('button')).toHaveCount(0)
})

test.describe('HUD touch scroll ownership', () => {
  test.use({hasTouch:true,isMobile:true})
  test('report and long message capture gestures; backdrop and boundaries cannot move the game', async ({page}) => {
    await page.setViewportSize({width:390,height:844})
    await page.emulateMedia({reducedMotion:'reduce'})
    const f = await intelligenceFixture(page)
    f.headers.push({id:id(850),kind:'Espionage',observed_at:baseTime,read:false,hidden:false})
    f.conversations.push({contact:{player:id(99),username:'Nova',blocked:false,request:null,requested_by:null,accepted:false},latest:{id:id(851),sequence:'1',sender:id(99),body:Array.from({length:30},(_,i)=>`Field update ${i+1}: Scouts are ready.`).join('\n\n'),sent_at:baseTime},unread:true})
    await withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/overview`))
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
    // Touch end and wheel delivery do not mean compositor scrolling has ended.
    // Register the completion boundary before each gesture or programmatic move.
    async function scrollGesture(action:()=>Promise<unknown>) {
      await panel.evaluate(el=>{
        el.setAttribute('data-test-scroll-pending','')
        el.addEventListener('scrollend',()=>el.removeAttribute('data-test-scroll-pending'),{once:true})
      })
      await action()
      await expect(panel).not.toHaveAttribute('data-test-scroll-pending','')
    }
    async function setScroll(edge:'start'|'end') {
      await panel.evaluate(async (el,edge)=>{
        const top=edge==='start'?0:el.scrollHeight-el.clientHeight
        if(Math.abs(el.scrollTop-top)<1)return
        await new Promise<void>(resolve=>{
          el.addEventListener('scrollend',()=>resolve(),{once:true})
          el.scrollTop=top
        })
      },edge)
    }
    await setScroll('start')
    await page.mouse.move(190,400)
    await scrollGesture(()=>page.mouse.wheel(0,300))
    await expect.poll(()=>panel.evaluate(el=>el.scrollTop)).toBeGreaterThan(0)
    await setScroll('start')
    await scrollGesture(()=>swipe(190,620,300))
    await expect.poll(()=>panel.evaluate(el=>el.scrollTop)).toBeGreaterThan(0)
    await diagnosticScreenshot(page,{path:`${output}/report-scrolled-390x844.png`})
    await setScroll('end')
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
    await setScroll('start')
    await scrollGesture(()=>swipe(190,620,300))
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

test('HUD espionage attack action prepares the observed target and opens Dispatch', async ({page}) => {
    await page.setViewportSize({width:390,height:844})
    await page.emulateMedia({reducedMotion:'reduce'})
    const f = await intelligenceFixture(page)
    f.headers.push({id:id(850),kind:'Espionage',observed_at:baseTime,read:false,hidden:false})
    await withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/overview`))
    await page.getByTestId('command-orb').click()
    await page.getByRole('dialog').getByRole('button',{name:/Espionage report/}).click()
    const panel = page.getByRole('dialog',{name:'Espionage report',exact:true})
    await expect(panel.getByRole('group',{name:'Resource amounts'})).toBeVisible()
    const attack = panel.getByRole('button',{name:'Attack',exact:true})
    await expect(attack).toBeVisible()
    const attackBox = (await attack.boundingBox())!
    expect(attackBox.y).toBeLessThan((await panel.getByRole('heading',{name:'Resources',exact:true}).boundingBox())!.y)
    expect(attackBox.y+attackBox.height).toBeLessThan(844)
    await diagnosticScreenshot(page,{path:`${output}/report-attack-390x844.png`})
    await page.setViewportSize({width:320,height:740})
    expect(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true)
    await expect(attack).toBeVisible()
    await diagnosticScreenshot(page,{path:`${output}/report-attack-320x740.png`})
    // Dispatch opens from the historical observation even if a fresh system read is unavailable.
    refuseFixtureReads(page, { world: ['Galaxy'] })
    await withFixtureResponseStatus(page, response => {
      const request = response.request()
      if (request.method() !== 'POST' || new URL(response.url()).pathname !== fixtureApiPath(page, 'world')) return false
      const query = request.postDataJSON()
      return query.type === 'Galaxy' && query.galaxy === 1 && query.system === 1
    }, () => attack.click(), 404)
    await expect(page).toHaveURL(new RegExp(`/b/${body.id}/dispatch\\?`))
    const url = new URL(page.url())
    expect(Object.fromEntries(url.searchParams)).toMatchObject({mission:'Attack',galaxy:'1',system:'1',position:'9',target:'planet'})
    expect(await page.evaluate(()=>history.state.dispatchObservation)).toMatchObject({target:{type:'Body',id:observation.target.body,expected_owner:observation.target.owner,expected_kind:observation.target.kind},observedAt:baseTime})
    await expect(panel).not.toBeVisible()
    expect(await page.evaluate(()=>document.body.style.position)).toBe('')
    await expect(page.getByRole('radio', { checked: true })).toHaveValue('Attack')
    // The same action remains in the full report at desktop sizes.
    await page.setViewportSize({width:1440,height:900})
    await withReportResponse(page, id(850), () => page.goto(`/u/andromeda/b/${body.id}/reports/${id(850)}`))
    await expect(page.getByRole('button',{name:'Attack',exact:true})).toBeVisible()
    await diagnosticScreenshot(page,{path:`${output}/report-attack-desktop-1440x900.png`})
})

test('HUD details return to the list without closing, even after scrolling a report', async ({page}) => {
  await page.setViewportSize({width:390,height:844})
  await page.emulateMedia({reducedMotion:'reduce'})
  const f = await intelligenceFixture(page)
  f.headers.push({id:id(850),kind:'Espionage',observed_at:baseTime,read:false,hidden:false})
  f.conversations.push({contact:{player:id(99),username:'Nova',blocked:false,request:null,requested_by:null,accepted:false},latest:{id:id(851),sequence:'1',sender:id(99),body:'Scouts are ready.',sent_at:baseTime},unread:true})
  await withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/overview`))
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

test('orb captions retain their education and humor history across client navigation', async ({page}) => {
  refuseFixtureReads(page, { progression: ['Upgrade'] })
  await page.setViewportSize({width:390,height:844})
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.clock.install()
  await page.addInitScript(()=>{Math.random=()=>0})
  const f=await intelligenceFixture(page)
  await withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/overview`))
  const caption=page.getByTestId('orb-caption')
  const orb=page.getByTestId('command-orb')
  await expect(caption).toHaveText('Welcome, Commander.')
  await page.clock.fastForward(6000)
  await expect(caption).toHaveCount(0)
  f.conversations.push({contact:{player:id(99),username:'Nova',blocked:false,request:null,requested_by:null,accepted:false},latest:{id:id(851),sequence:'1',sender:id(99),body:'Scouts are ready.',sent_at:baseTime},unread:true})
  await f.refresh()
  await expect(caption).toHaveText('Champagne means unread.')
  await diagnosticScreenshot(page,{path:`${output}/caption-education-390x844.png`})
  if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
    await page.setViewportSize({width:1440,height:900})
    await diagnosticScreenshot(page,{path:`${output}/caption-education-1440x900.png`})
    await page.setViewportSize({width:390,height:844})
  }
  await page.clock.fastForward(6000)
  await expect(caption).toHaveCount(0)
  await expect(orb).toHaveAttribute('data-tone','champagne')
  const loss=(n:number):S['ReportHeader4']=>({id:id(n),kind:'Combat',observed_at:baseTime+n,read:false,hidden:false,preview:{kind:'Combat',mission:'Espionage',outcome:'DefenderVictory',participants:[{owner:binding.player,side:'Attacker'}]}})
  f.headers.unshift(loss(861))
  await f.refresh()
  await expect(page.getByLabel('Recent game events').getByRole('button',{name:/Combat report/})).toBeVisible()
  await page.clock.fastForward(8000)
  await expect(caption).toHaveText('Whoops.')
  await expect(caption).toHaveAttribute('data-category','personality')
  await diagnosticScreenshot(page,{path:`${output}/caption-whoops-390x844.png`})
  await page.clock.fastForward(6000)
  await expect(caption).toHaveCount(0)
  // Client navigation keeps the humor budget. No old report replays on refresh.
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Develop',exact:true}).click()
  await expect(page).toHaveURL(/resources$/)
  f.headers.unshift(loss(862))
  await f.refresh()
  await expect(page.getByTestId('unread-count')).toHaveText('3')
  await page.clock.fastForward(8000)
  await expect(caption).toHaveCount(0)
  await expect(orb).toHaveAttribute('data-tone','champagne')
})

test('fleet accordion shows empire-wide flight paths, live timing, massive manifests and compact navigation', async ({page}) => {
  await page.setViewportSize({width:390,height:844})
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.clock.install({time:baseTime})
  await page.clock.pauseAt(baseTime)
  const f = await intelligenceFixture(page, [{...body,name:'Aster Prime'},{...body,id:id(6),name:'Vesper',coordinates:{galaxy:1,system:370,position:4}}], [{id:id(47),name:'Nova Bastion',kind:'Planet',coordinates:{galaxy:1,system:372,position:3}}])
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
  await withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/overview`))
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
  await expect(list.getByRole('link',{name:'Attack fleet details'})).toBeVisible()
  await list.getByRole('img', { name: /^Outbound:/ }).click()
  await expect(page).toHaveURL(new RegExp(`/b/${id(6)}/fleets/${id(912)}$`))
  await expect(panel).not.toBeVisible()
  f.missions.fleets.length=0
  await withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/overview`))
  await page.getByTestId('command-orb').click()
  await toggle.click()
  await expect(panel.getByText('No active fleets. All fleet slots are available.')).toBeVisible()
  await expect(toggle).toContainText('0 / 8 slots')
  await diagnosticScreenshot(page,{path:`${output}/fleets-empty-320x740.png`})
  await panel.getByRole('link',{name:'All fleets',exact:true}).click()
  await expect(page).toHaveURL(new RegExp(`/b/${body.id}/fleets$`))
  await expect(panel).not.toBeVisible()
  await page.setViewportSize({width:1440,height:900})
  await withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/overview`))
  await expect(page.locator('main h1')).toContainText('Empire —')
  await expect(page.getByTestId('command-orb')).toBeVisible()
  await diagnosticScreenshot(page,{path:`${output}/fleets-desktop-1440x900.png`})
})

async function setAppHidden(page: Page, hidden: boolean) {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'hidden', { configurable: true, value })
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: value ? 'hidden' : 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  }, hidden)
}

test('return refresh animation preview at mobile and desktop sizes', async ({page}) => {
  await page.setViewportSize({width:390,height:844})
  await page.emulateMedia({reducedMotion:'no-preference'})
  await page.addInitScript(()=>{Math.random=()=>0.45})
  await page.clock.install()
  await intelligenceFixture(page)
  await withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/overview`))
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
  await withFixtureResponse(page, response => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/overview'), () => setAppHidden(page, false))
  await expect(page.getByTestId('orb-caption')).toHaveText('Welcome back, Commander.')
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
      if(frame===15) await diagnosticScreenshot(page,{path:`${output}/welcome-back-390x844.png`})
    }
    await animations.evaluate(items=>items.forEach(({animation,start})=>{animation.currentTime=start+1500}))
    await animations.dispose()
  }
  await page.setViewportSize({width:320,height:740})
  const bounds=(await page.getByTestId('orb-caption').boundingBox())!
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  await diagnosticScreenshot(page,{path:`${output}/welcome-back-320x740.png`})
  await page.setViewportSize({width:1440,height:900})
  await expect(page.getByTestId('command-orb')).toBeVisible()
  await diagnosticScreenshot(page,{path:`${output}/welcome-back-1440x900.png`})
})

test('shared inbox removes reports deleted elsewhere from the Reports route, badge and open panel', async ({ page }) => {
    const width = 390, height = 844
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const f = await intelligenceFixture(page)
    f.headers.push(
      ...Array.from({ length: 3 }, (_, i) => ({ id: id(4000 + i), kind: 'Espionage', observed_at: baseTime - i, read: false, hidden: false })),
      { id: id(4003), kind: 'SpyContact', observed_at: baseTime - 3, read: true, hidden: false },
    )
    await withReportListResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/reports`))
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
