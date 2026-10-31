import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect, type Page } from './fixtures/test'
import { installGameFixture, binding, id } from './fixtures/game'
import type { components } from '../src/contracts'
type S=components['schemas']
const peer=id(800), alliance=id(900)
const contact=():S['SocialContact']=>({player:peer,username:'Nova',blocked:false,request:null,requested_by:null,accepted:false})
const message=(n:number):S['SocialMessage']=>({id:id(1000+n),sequence:String(n),sender:peer,body:`Message ${n}`,sent_at:1700000000000+n})
async function fixture(page:Page, count=65){
 await installGameFixture(page,{protocol:4})
 let c=contact(), messages=Array.from({length:count},(_,i)=>message(i+1)), hidden=false, read=0, failNext=false
 const requests:S['SocialQuery'][]=[], commands:S['SocialCommandRequest'][]=[]
 let circulars:S['SocialCircular'][]=[]
 await page.route('**/alliances/query',route=>{const {context}=route.request().postDataJSON();return route.fulfill({json:{...context,sampled_at:1700000000000,directory:[],directory_count:0,applications:[],alliance:{summary:{id:alliance,universe:binding.universe,name:'Starlight',tag:'STAR',member_count:2,recruitment:'Open'},public_text:'',revision:1,leader:binding.player,permissions:['SendCircular'],grantable_permissions:[]}}})})
 let historyGate: Promise<void> | undefined, failHistory = false
 await page.route('**/social/query',async route=>{
  const {context,query:q}=route.request().postDataJSON() as S['SocialQueryRequest'];requests.push(q)
  const result:S['SocialView']={...context,conversations:[],messages:[],circulars:[],contacts:[],contact:null,next_cursor:null}
  if(q.type==='Messages'){
   const gate=historyGate;historyGate=undefined;await gate
   if(failHistory){failHistory=false;return route.fulfill({status:503,json:{code:'Unavailable'}})}
   result.contact={...c};const index=q.before?messages.findIndex(m=>m.id===q.before):q.after?messages.findIndex(m=>m.id===q.after):-1
   const filtered=q.before?messages.slice(0,index):q.after?messages.slice(index+1):messages
   result.messages=q.after?filtered.slice(0,q.limit):filtered.slice(-q.limit)
   if(filtered.length>q.limit) result.next_cursor=q.after?result.messages.at(-1)!.id:result.messages[0].id
  }
  if(q.type==='Conversations'&&!hidden&&messages.length)result.conversations=[{contact:{...c},latest:messages.at(-1)!,unread:messages.some(m=>m.sender!==binding.player&&Number(m.sequence)>read)}]
  if(q.type==='Contacts'&&(q.kind==='Blocks'?c.blocked:q.kind==='Friends'?c.accepted:!!c.request&&!c.accepted))result.contacts=[{...c}]
  if(q.type==='Circulars')result.circulars=circulars
  return route.fulfill({json:result})
 })
 await page.route('**/social/commands',route=>{
  const req=route.request().postDataJSON() as S['SocialCommandRequest'];commands.push(req);const a=req.action
  if(failNext&&a.type==='Send'){failNext=false;return route.fulfill({status:503,json:{code:'Unavailable'}})}
  let sent:string|null=null
  if(a.type==='Send'){const m={...message(messages.length+1),sender:binding.player,body:a.body};messages.push(m);sent=m.id;hidden=false}
  if(a.type==='Read')read=Number(messages.find(m=>m.id===a.message)!.sequence)
  if(a.type==='Hide')hidden=true
  if(a.type==='RequestFriend')c={...c,request:id(3000),requested_by:binding.player}
  if(a.type==='AcceptFriend')c={...c,accepted:true}
  if(a.type==='RemoveFriend')c={...c,request:null,requested_by:null,accepted:false}
  if(a.type==='Block')c={...c,blocked:true,request:null,requested_by:null,accepted:false}
  if(a.type==='Unblock')c={...c,blocked:false}
  if(a.type==='Circular'){sent=id(4000+circulars.length);circulars=[{id:sent,alliance,alliance_name:'Starlight',alliance_tag:'STAR',sender:binding.player,sender_name:'Commander',body:a.body,sent_at:1700000000000,read:true},...circulars]}
  if(a.type==='ReadCircular')circulars=circulars.map(m=>m.id===a.circular?{...m,read:true}:m)
  if(a.type==='HideCircular')circulars=circulars.filter(m=>m.id!==a.circular)
  return route.fulfill({json:{command_id:req.command_id,message:sent}})
 })
 return {requests,commands,
 holdHistory:()=>{let release!:()=>void;historyGate=new Promise<void>(resolve=>{release=resolve});return release},
 failHistory:()=>{failHistory=true},
 failSend:()=>{failNext=true},incoming:()=>{messages.push(message(messages.length+1));hidden=false},invite:()=>{c={...c,request:id(3001),requested_by:peer}}}
}

test('conversation action announces unread state and clears it after reading', async ({page}) => {
 await fixture(page)
 await page.goto('/u/andromeda/messages')
 const action = page.getByRole('button', {name: /^Open conversation with Nova/})
 await expect(action).toHaveAccessibleName('Open conversation with Nova · Unread')
 await action.click()
 await expect(page.getByLabel('Message history').getByText('Message 65', {exact:true})).toBeVisible()
 await page.getByRole('button', {name: 'Back to conversations', exact:true}).click()
 await expect(action).toHaveAccessibleName('Open conversation with Nova')
 await expect(action).not.toContainText('Unread')
})

test('conversation paging, safe Markdown, uncertain send retry and blocking',async({page})=>{
 const f=await fixture(page)
 await page.goto(`/u/andromeda/messages?player=${peer}`)
 const history=page.getByLabel('Message history')
 await expect(history.getByText('Message 65',{exact:true})).toBeVisible()
 await expect(history.getByText('Message 1',{exact:true})).toHaveCount(0)
 await page.getByRole('button',{name:'Load older messages'}).click()
 await expect(history.getByText('Message 1',{exact:true})).toBeVisible()
 expect(f.requests.filter(q=>q.type==='Messages').every(q=>q.limit===50)).toBe(true)
 await page.getByLabel('Message',{exact:true}).fill('**Bold hello**\n\n<script>window.evil=true</script>\n\n![image](https://example.com/x.png)')
 f.failSend()
 await page.getByRole('button',{name:'Send message',exact:true}).click()
 await expect(page.getByRole('button',{name:'Retry pending action'})).toBeVisible()
 await page.getByRole('button',{name:'Retry pending action'}).click()
 await expect(history.locator('strong',{hasText:'Bold hello'})).toBeVisible()
 await expect(history.locator('img,script')).toHaveCount(0)
 await expect(page.getByLabel('Message',{exact:true})).toHaveValue('')
 const sends=f.commands.filter(q=>q.action.type==='Send');expect(sends).toHaveLength(2);expect(sends[0].command_id).toBe(sends[1].command_id)
 await page.getByRole('button',{name:'Add friend',exact:true}).click()
 await expect(page.getByRole('button',{name:'Cancel request'})).toBeVisible()
 await page.getByRole('button',{name:'Block player',exact:true}).click()
 await expect(page.getByText('This player is blocked. Unblock them to send messages.')).toBeVisible()
 await expect(page.getByRole('button',{name:'Cancel request'})).toHaveCount(0)
 await page.getByRole('button',{name:'Unblock player',exact:true}).click()
 await expect(page.getByRole('button',{name:'Add friend',exact:true})).toBeVisible()
})

test('mobile friends and one-way circulars',async({page})=>{
 const f=await fixture(page);f.invite();await page.setViewportSize({width:390,height:844})
 await page.goto('/u/andromeda/messages')
 await page.getByRole('button',{name:'Requests',exact:true}).click()
 await page.getByRole('button',{name:'Accept friend',exact:true}).click()
 await page.getByRole('button',{name:'Friends',exact:true}).click()
 await expect(page.getByRole('button',{name:'Remove friend'})).toBeVisible()
 await page.getByRole('button',{name:'Message Nova',exact:true}).click()
 await expect(page.getByLabel('Message',{exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Circulars',exact:true}).click()
 await page.getByLabel('Alliance announcement').fill('**Meet at the outpost**')
 await page.getByRole('button',{name:'Send circular',exact:true}).click()
 await expect(page.locator('strong',{hasText:'Meet at the outpost'})).toBeVisible()
 await expect(page.getByRole('button',{name:/reply all/i})).toHaveCount(0)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
 await diagnosticScreenshot(page, {path:'test-results/social-mobile.png',fullPage:true})
})

test('new messages arrive incrementally and hiding preserves history',async({page})=>{
 const f=await fixture(page);await page.goto(`/u/andromeda/messages?player=${peer}`)
 await expect(page.getByLabel('Message history').getByText('Message 65',{exact:true})).toBeVisible()
 f.incoming()
 await expect(page.getByLabel('Message history').getByText('Message 66',{exact:true})).toBeVisible({timeout:15000})
 expect(f.requests.some(q=>q.type==='Messages'&&q.after===id(1065))).toBe(true)
 await page.getByRole('button',{name:'Hide conversation',exact:true}).click()
 await expect(page.getByText(/No conversations yet/)).toBeVisible()
 await page.goto(`/u/andromeda/messages?player=${peer}`)
 await expect(page.getByLabel('Message history').getByText('Message 66',{exact:true})).toBeVisible()
 await diagnosticScreenshot(page, {path:'test-results/social-desktop.png',fullPage:true})
})

test('Galaxy message shortcut preserves the selected player through route normalization',async({page})=>{
 const f=await fixture(page)
 await page.route('**/world',route=>{
  const q=route.request().postDataJSON()
  return route.fulfill({json:{protocol:4,binding,request_id:q.context.request_id,viewer_revision:'1',sampled_at:Date.now(),as_of_ms:Date.now(),data:{galaxy:q.galaxy,system:q.system,observed_at:Date.now(),player_names:{[peer]:'Nova'},positions:Array.from({length:15},(_,i)=>({coordinates:{galaxy:q.galaxy,system:q.system,position:i+1},body:i===0?{id:id(810),kind:'Planet',owner:peer,activity:{type:'None'},inactivity:'Active',vacation:false,espionage_eligible:true}:null,debris:null}))}}})
 })
 await page.goto('/u/andromeda/galaxy')
 await page.getByRole('region',{name:'Galaxy positions'}).getByRole('button',{name:'Nova profile details'}).click()
 const link=page.getByRole('dialog', {name:'Nova profile'}).getByRole('link',{name:/^Message /})
 await expect(link).toHaveAttribute('href',new RegExp(`player=${peer}`))
 await link.click()
 await expect(page.getByLabel('Message',{exact:true})).toBeVisible()
 expect(f.requests.some(q=>q.type==='Messages'&&q.player===peer)).toBe(true)
 await expect(page).toHaveURL(new RegExp(`player=${peer}`))
})

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`history polling preserves layout, scroll and composer at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.clock.install()
    await page.clock.pauseAt(new Date())
    const f = await fixture(page)
    const releaseInitial = f.holdHistory()
    await page.goto(`/u/andromeda/messages?player=${peer}`)
    const loading = page
      .getByRole('status')
      .filter({ hasText: 'Loading messages…' })
    await expect(loading).toBeVisible()
    await diagnosticScreenshot(page, {
      path: `test-results/messages-initial-${viewport.width}.png`,
      fullPage: true,
    })
    releaseInitial()
    const history = page.getByLabel('Message history')
    await expect(history.getByText('Message 65', { exact: true })).toBeVisible()
    const composer = page.getByLabel('Message', { exact: true })
    await composer.fill('An unfinished message')
    await composer.evaluate((el: HTMLTextAreaElement) =>
      el.setSelectionRange(3, 8),
    )
    await history.evaluate((el) => {
      el.scrollTop = 100
      el.dispatchEvent(new Event('scroll'))
    })
    const position = () =>
      page.evaluate(() => {
        const history = document.querySelector(
          '[aria-label="Message history"]',
        )!
        const composer = document.querySelector(
          'textarea',
        )! as HTMLTextAreaElement
        return {
          historyY: history.getBoundingClientRect().y,
          composerY: composer.getBoundingClientRect().y,
          pageY: window.scrollY,
          historyTop: history.scrollTop,
          selection: [composer.selectionStart, composer.selectionEnd],
        }
      })
    const before = await position()
    const releasePoll = f.holdHistory()
    const count = f.requests.filter((q) => q.type === 'Messages').length
    await page.clock.runFor(4999)
    expect(f.requests.filter((q) => q.type === 'Messages')).toHaveLength(count)
    await page.clock.runFor(1)
    await expect
      .poll(() => f.requests.filter((q) => q.type === 'Messages').length)
      .toBe(count + 1)
    await expect(loading).toHaveCount(0)
    expect(await position()).toEqual(before)
    await expect(composer).toBeFocused()
    await expect(composer).toBeEnabled()
    // Capture the conversation header and composer at their actual viewport positions.
    await page.evaluate(() => window.scrollTo(0, 0))
    await diagnosticScreenshot(page, {
      path: `test-results/messages-refresh-${viewport.width}.png`,
    })
    await page.evaluate((y) => window.scrollTo(0, y), before.pageY)
    await diagnosticScreenshot(page, {
      path: `test-results/messages-composer-${viewport.width}.png`,
    })
    releasePoll()
    // The disabled paging button tells us the unchanged response has settled.
    await expect(
      page.getByRole('button', { name: 'Load older messages' }),
    ).toBeEnabled()
    expect(await position()).toEqual(before)
    await expect(composer).toHaveValue('An unfinished message')
    await expect(composer).toBeFocused()

    f.incoming()
    await page.clock.runFor(5000)
    await expect(history.getByText('Message 66', { exact: true })).toHaveCount(
      1,
    )
    expect(await position()).toEqual(before)
    await expect(composer).toBeFocused()
    await expect(composer).toHaveValue('An unfinished message')
    // Reading at the bottom still follows newly received messages.
    await history.evaluate((el) => {
      el.scrollTop = el.scrollHeight
      el.dispatchEvent(new Event('scroll'))
    })
    f.incoming()
    await page.clock.runFor(5000)
    await expect(history.getByText('Message 67', { exact: true })).toBeVisible()
    await expect
      .poll(() =>
        history.evaluate(
          (el) => el.scrollHeight - el.scrollTop - el.clientHeight,
        ),
      )
      .toBeLessThan(2)

    // Prepending older history keeps the previously visible message anchored.
    await history.evaluate((el) => {
      el.scrollTop = 0
      el.dispatchEvent(new Event('scroll'))
    })
    const oldTop = await history
      .getByText('Message 16', { exact: true })
      .evaluate(
        (el) =>
          el.getBoundingClientRect().top -
          el.closest('[aria-label="Message history"]')!.getBoundingClientRect()
            .top,
      )
    const releaseOlder = f.holdHistory()
    await page.getByRole('button', { name: 'Load older messages' }).click()
    await expect(
      page.getByRole('button', { name: 'Load older messages' }),
    ).toBeDisabled()
    await expect(loading).toHaveCount(0)
    releaseOlder()
    await expect(history.getByText('Message 1', { exact: true })).toHaveCount(1)
    // scrollHeight rounds to whole CSS pixels while message boxes retain fractions.
    const anchoredTop = await history
      .getByText('Message 16', { exact: true })
      .evaluate(
        (el) =>
          el.getBoundingClientRect().top -
          el.closest('[aria-label="Message history"]')!.getBoundingClientRect()
            .top,
      )
    expect(Math.abs(anchoredTop - oldTop)).toBeLessThan(1)
    await expect(composer).toHaveValue('An unfinished message')
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
  })
}

test('empty history stays loaded during polling and displays the first incoming message', async ({
  page,
}) => {
  await page.clock.install()
  await page.clock.pauseAt(new Date())
  const f = await fixture(page, 0)
  await page.goto(`/u/andromeda/messages?player=${peer}`)
  await expect(page.getByText('Start your conversation.')).toBeVisible()
  const composer = page.getByLabel('Message', { exact: true })
  await composer.fill('First draft')
  const before = await composer.boundingBox()
  const release = f.holdHistory()
  await page.clock.runFor(5000)
  await expect
    .poll(() => f.requests.filter((q) => q.type === 'Messages').length)
    .toBe(2)
  await expect(page.getByText('Loading messages…')).toHaveCount(0)
  expect(await composer.boundingBox()).toEqual(before)
  release()
  await expect(page.getByText('Start your conversation.')).toBeVisible()
  f.incoming()
  await page.clock.runFor(5000)
  await expect(
    page.getByLabel('Message history').getByText('Message 1', { exact: true }),
  ).toBeVisible()
  await expect(composer).toHaveValue('First draft')
  await expect(composer).toBeFocused()
})

test('initial and background history errors remain visible and Refresh retries', async ({
  page,
}) => {
  await page.clock.install()
  await page.clock.pauseAt(new Date())
  const f = await fixture(page)
  f.failHistory()
  await page.goto(`/u/andromeda/messages?player=${peer}`)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByText('Loading messages…')).toHaveCount(0)
  const release = f.holdHistory()
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByText('Loading messages…')).toBeVisible()
  release()
  const history = page.getByLabel('Message history')
  await expect(history.getByText('Message 65', { exact: true })).toBeVisible()
  const composer = page.getByLabel('Message', { exact: true })
  await composer.fill('Keep this after a failed poll')
  f.failHistory()
  await page.clock.runFor(5000)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(history.getByText('Message 65', { exact: true })).toBeVisible()
  await expect(composer).toBeFocused()
  await expect(composer).toHaveValue('Keep this after a failed poll')
  await expect(composer).toBeEnabled()
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Load older messages' }),
  ).toBeEnabled()
  await expect(composer).toHaveValue('Keep this after a failed poll')
})
