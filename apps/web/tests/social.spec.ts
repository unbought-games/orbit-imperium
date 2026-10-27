import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect, type Page } from './fixtures/test'
import { installGameFixture, binding, id } from './fixtures/game'
import type { components } from '../src/contracts'
type S=components['schemas']
const peer=id(800), alliance=id(900)
const contact=():S['SocialContact']=>({player:peer,username:'Nova',blocked:false,request:null,requested_by:null,accepted:false})
const message=(n:number):S['SocialMessage']=>({id:id(1000+n),sequence:String(n),sender:peer,body:`Message ${n}`,sent_at:1700000000000+n})
async function fixture(page:Page){
 await installGameFixture(page,{protocol:4})
 let c=contact(), messages=Array.from({length:65},(_,i)=>message(i+1)), hidden=false, read=0, failNext=false
 const requests:S['SocialQuery'][]=[], commands:S['SocialCommandRequest'][]=[]
 let circulars:S['SocialCircular'][]=[]
 await page.route('**/alliances/query',route=>{const {context}=route.request().postDataJSON();return route.fulfill({json:{...context,sampled_at:1700000000000,directory:[],directory_count:0,applications:[],alliance:{summary:{id:alliance,universe:binding.universe,name:'Starlight',tag:'STAR',member_count:2,recruitment:'Open'},public_text:'',revision:1,leader:binding.player,permissions:['SendCircular'],grantable_permissions:[]}}})})
 await page.route('**/social/query',route=>{
  const {context,query:q}=route.request().postDataJSON() as S['SocialQueryRequest'];requests.push(q)
  const result:S['SocialView']={...context,conversations:[],messages:[],circulars:[],contacts:[],contact:null,next_cursor:null}
  if(q.type==='Messages'){
   result.contact={...c};const index=q.before?messages.findIndex(m=>m.id===q.before):q.after?messages.findIndex(m=>m.id===q.after):-1
   const filtered=q.before?messages.slice(0,index):q.after?messages.slice(index+1):messages
   result.messages=q.after?filtered.slice(0,q.limit):filtered.slice(-q.limit)
   if(filtered.length>q.limit) result.next_cursor=q.after?result.messages.at(-1)!.id:result.messages[0].id
  }
  if(q.type==='Conversations'&&!hidden)result.conversations=[{contact:{...c},latest:messages.at(-1)!,unread:messages.some(m=>m.sender!==binding.player&&Number(m.sequence)>read)}]
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
 return {requests,commands,failSend:()=>{failNext=true},incoming:()=>{messages.push(message(messages.length+1));hidden=false},invite:()=>{c={...c,request:id(3001),requested_by:peer}}}
}

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
 const link=page.getByRole('region',{name:'Galaxy positions'}).getByRole('link',{name:/^Message /})
 await expect(link).toHaveAttribute('href',new RegExp(`player=${peer}`))
 await link.click()
 await expect(page.getByLabel('Message',{exact:true})).toBeVisible()
 expect(f.requests.some(q=>q.type==='Messages'&&q.player===peer)).toBe(true)
 await expect(page).toHaveURL(new RegExp(`player=${peer}`))
})
