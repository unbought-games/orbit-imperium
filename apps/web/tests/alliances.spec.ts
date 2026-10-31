import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect, type Page } from './fixtures/test'
import { installGameFixture, refreshGame, binding, id } from './fixtures/game'
import type { components } from '../src/contracts'
import { permissionLabels } from '../src/client-model/alliances'
type S = components['schemas']
const alliance = id(800), applicant = id(810), member = id(820)
const summary: S['AllianceSummary'] = { id: alliance, universe: binding.universe, name: 'Starlight Assembly', tag: 'STAR', recruitment: 'Application', member_count: 2, ranking: { rank: 3, points: '24000', average_points: '12000', previous_rank: 4, baseline_at: 1700000000000 } }
const baseRole: S['AllianceRole'] = { id: id(830), name: 'Member', is_default: true, permissions: ['ViewMembers', 'PublishPosts'], grantable_permissions: [] }
const permissions = Object.keys(permissionLabels) as S['AlliancePermission'][]
function own(): S['AllianceDetail'] { return { summary: { ...summary }, public_text: '**Together** among the stars.', revision: 1, leader: binding.player, permissions: [...permissions], grantable_permissions: [...permissions], roles: [{ ...baseRole }], members: [{ player: binding.player, username: 'Commander', joined_at: 1700000000000, roles: [baseRole.id], activity: 'Recent' }, { player: member, username: 'Nova', joined_at: 1700000000000, roles: [baseRole.id], activity: 'Away' }], applications: [{ id: applicant, alliance, alliance_tag: 'STAR', player: id(840), username: 'New Pilot', text: 'Ready to explore.', created_at: 1700000000000 }], posts: [{ id: id(850), author: member, author_name: 'Nova', title: 'Welcome aboard', body: 'Our **first** chapter.', created_at: 1700000000000, updated_at: 1700000000000, pinned: false }], next_post_before: null, audit: [{ id: id(860), actor: binding.player, actor_name: 'Commander', action: 'Created alliance', at: 1700000000000, target: null }] } }
async function fixture(page: Page, initial: S['AllianceDetail'] | null) {
  await installGameFixture(page, { protocol: 4 })
  let detail = initial
  let applications: S['AllianceApplication'][] = []
  const commands: S['AllianceCommandRequest'][] = []
  let rejectNext = false
  let denied = false
  await page.route('**/alliances/query', route => {
    if (denied) return route.fulfill({ status: 403, json: { code: 'Forbidden' } })
    const { context, query } = route.request().postDataJSON() as S['AllianceQueryRequest']
    const projected = detail && query.type === 'Detail' && query.post_before ? { ...detail, posts: [{ ...detail.posts![0], id: id(899), title: 'Older chapter' }], next_post_before: null } : detail ? { ...detail, posts: detail.posts?.slice(0, 20) } : null
    return route.fulfill({ json: { ...context, sampled_at: 1700000000000, directory: query.type === 'Directory' ? [summary] : [], directory_count: query.type === 'Directory' ? 1 : 0, alliance: query.type === 'Directory' ? null : projected, applications } })
  })
  await page.route(`**/alliances/${alliance}`, route => route.fulfill({ json: { summary, public_text: '**Recruiting** curious commanders.\n\n<script>window.evil=true</script>\n\n![blocked](https://example.com/image.png)' } }))
  await page.route('**/alliances/commands', route => {
    const request = route.request().postDataJSON() as S['AllianceCommandRequest']; commands.push(request)
    if (rejectNext) { rejectNext = false; return route.fulfill({ status: 409, json: { code: 'Conflict' } }) }
    const action = request.action
    switch (action.type) {
      case 'Apply': applications = [{ id: applicant, alliance, alliance_tag: 'STAR', player: binding.player, username: 'Commander', text: action.text, created_at: 1700000000000 }]; break
      case 'Withdraw': applications = []; break
      case 'Create': detail = { ...own(), summary: { ...summary, name: action.name, tag: action.tag } }; applications = []; break
      case 'Join': detail = own(); detail.leader = member; detail.permissions = baseRole.permissions; applications = []; break
      case 'Accept': detail!.applications = []; detail!.members!.push({ player: id(840), username: 'New Pilot', joined_at: 1700000000000, roles: [baseRole.id] }); break
      case 'Reject': detail!.applications = []; break
      case 'SaveRole': { const role = { id: action.role ?? id(870), name: action.name, permissions: action.permissions, grantable_permissions: action.grantable_permissions, is_default: false }; detail!.roles = [...detail!.roles!.filter(r => r.id !== role.id), role]; break }
      case 'AssignRoles': detail!.members!.find(m => m.player === action.player)!.roles = action.roles; break
      case 'CreatePost': detail!.posts = [{ id: id(880), author: binding.player, author_name: 'Commander', title: action.title, body: action.body, created_at: 1700000000001, updated_at: 1700000000001, pinned: false }, ...detail!.posts!].slice(0, 100); break
      case 'PinPost': detail!.posts!.find(p => p.id === action.post)!.pinned = action.pinned; break
      case 'EditPost': Object.assign(detail!.posts!.find(p => p.id === action.post)!, { title: action.title, body: action.body }); break
      case 'DeletePost': detail!.posts = detail!.posts!.filter(p => p.id !== action.post); break
      case 'Transfer': detail!.leader = action.player; detail!.permissions = baseRole.permissions; detail!.grantable_permissions = []; delete detail!.audit; delete detail!.applications; break
      case 'Leave': case 'Disband': detail = null; break
      case 'Update': Object.assign(detail!.summary, { name: action.name, tag: action.tag, recruitment: action.recruitment }); detail!.public_text = action.public_text; break
    }
    if (detail) detail.revision++
    return route.fulfill({ json: { command_id: request.command_id, alliance: detail?.summary.id ?? null, revision: detail?.revision ?? null } })
  })
  return { commands, rejectNext: () => { rejectNext = true }, detail: () => detail, denyReads: () => { denied = true } }
}

test('discovery applications preserve rejected drafts, withdraw and create an alliance', async ({ page }) => {
  const f = await fixture(page, null)
  await page.goto('/u/andromeda/alliance')
  await page.getByRole('button', { name: 'View STAR', exact: true }).click()
  await page.getByLabel('Application message').fill('I explore distant stars.')
  f.rejectNext()
  await page.getByRole('button', { name: 'Send application' }).click()
  await expect(page.getByRole('alert')).toContainText('Conflict')
  await expect(page.getByLabel('Application message')).toHaveValue('I explore distant stars.')
  await page.getByRole('button', { name: 'Refresh alliance' }).click()
  await expect(page.getByLabel('Application message')).toHaveValue('I explore distant stars.')
  await page.getByRole('button', { name: 'Send application' }).click()
  await expect(page.getByRole('heading', { name: 'Your applications (1/5)' })).toBeVisible()
  await page.getByRole('button', { name: 'Withdraw STAR', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm withdraw star' }).click()
  await expect(page.getByRole('heading', { name: 'Your applications (0/5)' })).toBeVisible()
  await page.getByText('Create an alliance', { exact: true }).click()
  await page.getByLabel('Alliance name', { exact: true }).fill('New Horizon')
  await page.getByLabel('Alliance tag', { exact: true }).fill('NEW')
  await page.getByRole('button', { name: 'Create alliance', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'New Horizon' })).toBeVisible()
  expect(f.commands.map(c => c.action.type)).toEqual(['Apply', 'Apply', 'Withdraw', 'Create'])
  expect(f.commands[0].command_id).not.toBe(f.commands[1].command_id)
})

test('leader accepts recruits, edits delegated roles, assigns multiple roles and transfers leadership', async ({ page }) => {
  const detail = own()
  detail.roles!.push({ id: id(871), name: 'Scout', is_default: false, permissions: ['ViewMembers'], grantable_permissions: [] })
  const f = await fixture(page, detail)
  await page.goto('/u/andromeda/alliance')
  await page.getByRole('button', { name: 'Applications', exact: true }).click()
  await page.getByRole('button', { name: 'Accept New Pilot', exact: true }).click()
  await expect(page.getByText('No pending applications.')).toBeVisible()
  await page.getByRole('button', { name: 'Roles', exact: true }).click()
  await page.getByText('Create a custom role', { exact: true }).click()
  await page.getByRole('textbox', { name: 'Role name', exact: true }).fill('Recruitment officer')
  for (const label of ['View applications', 'Accept and reject applications']) {
    await page.getByRole('checkbox', { name: `${label}: allow`, exact: true }).check()
    await page.getByRole('checkbox', { name: `${label}: delegate`, exact: true }).check()
  }
  await page.getByRole('button', { name: 'Create role', exact: true }).click()
  await expect(page.getByText('Recruitment officer', { exact: true })).toBeVisible()
  const saved = f.commands.find(c => c.action.type === 'SaveRole')!.action
  expect(saved).toMatchObject({ permissions: ['ViewApplications', 'ProcessApplications'], grantable_permissions: ['ViewApplications', 'ProcessApplications'] })
  await page.getByText('Recruitment officer', { exact: true }).click()
  await page.getByRole('textbox', { name: 'Role name', exact: true }).fill('Recruitment captain')
  await page.getByRole('button', { name: 'Save role', exact: true }).click()
  await expect(page.getByText('Recruitment captain', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Members', exact: true }).click()
  await page.getByRole('button', { name: 'Assign roles to Nova' }).click()
  await page.getByLabel('Recruitment captain', { exact: true }).check()
  await page.getByLabel('Scout', { exact: true }).check()
  await page.getByRole('button', { name: 'Save member roles' }).click()
  expect(f.commands.find(c => c.action.type === 'AssignRoles')!.action).toMatchObject({ player: member, roles: [id(871), id(870)] })
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Transfer to Nova', exact: true }).click()
  await expect(page.getByRole('group', { name: 'Review Transfer to Nova' })).toContainText('you become a Member')
  await page.getByRole('button', { name: 'Confirm transfer to nova' }).click()
  await expect(page.getByRole('button', { name: 'Roles', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Applications', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Disband alliance', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Leave alliance', exact: true })).toBeVisible()
})

test('noticeboard renders safely, creates, pins, edits and loads a stable older page with responsive layouts', async ({ page }) => {
  const detail = own(); detail.next_post_before = id(850)
  const f = await fixture(page, detail)
  await page.goto('/u/andromeda/alliance')
  await expect(page.getByRole('heading', { name: 'Welcome aboard' })).toBeVisible()
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await diagnosticScreenshot(page, { path: `test-results/alliance-${width}-${page.url().includes('/alliances/') ? 'public' : 'board'}.png`, fullPage: true })
  }
  await page.getByText('Write a notice', { exact: true }).click()
  await page.getByLabel('Notice title', { exact: true }).first().fill('Rally at dawn')
  await page.getByLabel('Notice body', { exact: true }).first().fill('**Meet** at dawn.\n\n<img src=x onerror=alert(1)>')
  await page.getByRole('button', { name: 'Preview notice', exact: true }).first().click()
  await expect(page.locator('strong').filter({ hasText: 'Meet' })).toBeVisible()
  await page.getByRole('button', { name: 'Publish notice', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Rally at dawn' })).toBeVisible()
  await page.getByRole('button', { name: 'Pin Rally at dawn', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Unpin Rally at dawn', exact: true })).toBeVisible()
  const article = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Rally at dawn' }) })
  await article.getByText('Edit notice', { exact: true }).click()
  await article.getByLabel('Notice title', { exact: true }).fill('Rally at noon')
  await article.getByRole('button', { name: 'Preview notice', exact: true }).click()
  await article.getByRole('textbox', { name: 'Notice body', exact: true }).fill('**Meet** at noon instead.')
  await article.getByRole('button', { name: 'Preview notice', exact: true }).click()
  await expect(article.getByText('Meet at noon instead.', { exact: true })).toHaveCount(1)
  await article.getByRole('button', { name: 'Save notice' }).click()
  await expect(page.getByRole('heading', { name: 'Rally at noon' })).toBeVisible()
  await expect(page.getByText('Meet at noon instead.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Older notices' }).click()
  await expect(page.getByRole('heading', { name: 'Older chapter' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Rally at noon' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Newest notices' }).click()
  await expect(page.getByRole('heading', { name: 'Rally at noon' })).toBeVisible()
  expect(f.commands.map(c => c.action.type)).toEqual(['CreatePost', 'PinPost', 'EditPost'])
})

test('public recruitment bypasses bootstrap, exposes only public data and opens the authenticated alliance route', async ({ page }) => {
  let bootstraps = 0
  await page.route('**/api/**', route => {
    if (route.request().url().includes('bootstrap')) bootstraps++
    return route.fulfill({ status: 500 })
  })
  await page.route(`**/alliances/${alliance}`, route => route.fulfill({ json: { summary, public_text: '**Explore** together.\n\n[Bad](javascript:alert(1)) ![image](https://example.com/a.png)\n\n<script>alert(1)</script>' } }))
  await page.goto(`/alliances/${binding.universe}/${alliance}`)
  await expect(page.getByRole('heading', { name: summary.name })).toBeVisible()
  await expect(page.getByText('24,000')).toBeVisible()
  expect(bootstraps).toBe(0)
  await expect(page.locator('main img, main iframe, main script')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Members', exact: true })).toHaveCount(0)
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await diagnosticScreenshot(page, { path: `test-results/alliance-${width}-${page.url().includes('/alliances/') ? 'public' : 'board'}.png`, fullPage: true })
  }
  await fixture(page, null)
  await page.getByRole('link', { name: 'Open alliance in game' }).click()
  await expect(page).toHaveURL(new RegExp(`/u/andromeda/alliance\\?.*alliance=${alliance}`))
  await expect(page.getByLabel('Application message')).toBeVisible()
})

test('open and closed recruitment and existing membership drive the available controls', async ({ page }) => {
  const f = await fixture(page, null)
  await page.route(`**/alliances/${alliance}`, route => route.fulfill({ json: { summary: { ...summary, recruitment: 'Closed' }, public_text: 'Private explorers.' } }))
  await page.goto(`/u/andromeda/alliance?alliance=${alliance}`)
  await expect(page.getByText('This alliance is not recruiting.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send application' })).toHaveCount(0)
  await page.route(`**/alliances/${alliance}`, route => route.fulfill({ json: { summary: { ...summary, recruitment: 'Open' }, public_text: 'Welcome explorers.' } }))
  await page.reload()
  await page.getByRole('button', { name: 'Join STAR', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm join star' }).click()
  await expect(page.getByRole('heading', { name: 'Welcome aboard' })).toBeVisible()
  await page.getByRole('button', { name: 'Discover alliances' }).click()
  await expect(page.getByText('Create an alliance', { exact: true })).toHaveCount(0)
  expect(f.commands.map(c => c.action.type)).toEqual(['Join'])
})

test('lost membership clears private board, roster and administration immediately on refresh', async ({ page }) => {
  const f = await fixture(page, own())
  await page.goto('/u/andromeda/alliance')
  await page.getByRole('button', { name: 'Members', exact: true }).click()
  const roster = page.getByRole('region', { name: 'Alliance roster' })
  await expect(roster.getByRole('button', { name: /profile details/ }).getByText('[STAR]', {exact: true})).toHaveCount(2)
  f.denyReads()
  await page.getByRole('button', { name: 'Refresh alliance' }).click()
  await expect(page.getByRole('alert')).toContainText('Forbidden')
  await expect(page.getByRole('region', { name: 'Alliance roster' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Roles', exact: true })).toHaveCount(0)
  await expect(page.getByText('Nova', { exact: true })).toHaveCount(0)
})

test('notice rolloff comes from refreshed server pages and retains pinned notices', async ({ page }) => {
  const detail = own()
  detail.posts = Array.from({ length: 100 }, (_, index) => ({ id: id(900 + index), author: member, author_name: 'Nova', title: `Notice ${100 - index}`, body: 'A chapter in our history.', created_at: 1700000000100 - index, updated_at: 1700000000100 - index, pinned: index === 0 }))
  const f = await fixture(page, detail)
  await page.goto('/u/andromeda/alliance')
  await expect(page.getByRole('article')).toHaveCount(20)
  await page.getByText('Write a notice', { exact: true }).click()
  await page.getByLabel('Notice title', { exact: true }).first().fill('Next chapter')
  await page.getByLabel('Notice body', { exact: true }).first().fill('Tomorrow begins.')
  await page.getByRole('button', { name: 'Publish notice', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Next chapter' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Notice 100', exact: true })).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(20)
  expect(f.detail()?.posts).toHaveLength(100)
  expect(f.detail()?.posts?.some(post => post.title === 'Notice 1')).toBe(false)
  expect(f.commands.map(command => command.action.type)).toEqual(['CreatePost'])
})

test('uncertain command retry reuses identity and does not send an edited duplicate', async ({ page }) => {
  await fixture(page, null)
  const requests: S['AllianceCommandRequest'][] = []
  await page.route('**/alliances/commands', route => {
    requests.push(route.request().postDataJSON())
    if (requests.length === 1) return route.fulfill({ status: 503, json: { code: 'Unavailable' } })
    return route.fulfill({ json: { command_id: requests[0].command_id, alliance, revision: 1 } })
  })
  await page.goto(`/u/andromeda/alliance?alliance=${alliance}`)
  await page.getByLabel('Application message').fill('My original application')
  await page.getByRole('button', { name: 'Send application' }).click()
  await expect(page.getByRole('button', { name: 'Send application' })).toBeDisabled()
  await expect(page.getByLabel('Application message')).toHaveValue('My original application')
  await page.getByRole('button', { name: 'Retry last command' }).click()
  await expect(page.getByText('Alliance updated.', { exact: true })).toBeVisible()
  expect(requests).toHaveLength(2)
  expect(requests[1].command_id).toBe(requests[0].command_id)
  expect(requests[1].action).toEqual(requests[0].action)
})

test('departed notice authors use authorized current profile tags while roster membership overrides stale tags', async ({ page }) => {
  const detail = own(), departed = id(888)
  detail.posts![0].author = departed
  detail.posts![0].author_name = 'Departed Pilot'
  await fixture(page, detail)
  await page.route('**/player-profiles', route => {
    const { context, source } = route.request().postDataJSON()
    const now = Math.floor(Date.now() / 1000)
    return route.fulfill({ json: { ...context, players: (source.players ?? []).map((player: string) => ({ player, username: player === departed ? 'Departed Pilot' : player === member ? 'Nova' : 'Commander', observed_at: now, expires_at: now + 300, alliance: { id: id(889), universe: binding.universe, name: 'Other Alliance', tag: 'AWAY' } })) } })
  })
  await page.goto('/u/andromeda/alliance')
  const article = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Welcome aboard' }) })
  await article.getByRole('button', { name: 'Departed Pilot profile details' }).click()
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Alliance Other Alliance [AWAY]', exact: true })).toBeVisible()
  for (const width of [1440, 390]) {
    await page.setViewportSize({width, height: 1000})
    await diagnosticScreenshot(page, {path: `test-results/profile-alliance-board-${width}x1000.png`})
  }
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Members', exact: true }).click()
  const roster = page.getByRole('region', { name: 'Alliance roster' })
  await expect(roster.getByRole('button', { name: /profile details/ }).getByText('[STAR]', {exact: true})).toHaveCount(2)
  await expect(roster.getByText('[AWAY]', {exact: true})).toHaveCount(0)
  for (const width of [1440, 390]) {
    await page.setViewportSize({width, height: 1000})
    await roster.getByRole('button', {name: 'Nova profile details'}).click()
    await expect(page.getByRole('dialog', {name: 'Nova profile'})).toBeVisible()
    await diagnosticScreenshot(page, {path: `test-results/profile-alliance-members-${width}x1000.png`})
    await page.keyboard.press('Escape')
  }
})

test('a delegated manager can dismiss a locked member role editor without submitting', async ({ page }) => {
  const detail = own()
  const leader = id(899)
  detail.leader = leader
  detail.permissions = ['ViewMembers', 'AssignRoles']
  detail.grantable_permissions = ['ViewMembers']
  detail.members!.push({ player: leader, username: 'Leader', joined_at: 1700000000000, roles: [baseRole.id] })
  detail.roles!.push({ id: id(872), name: 'Intelligence', is_default: false, permissions: ['ViewMembers', 'ViewActivity'], grantable_permissions: [] })
  detail.members!.find(m => m.player === member)!.roles.push(id(872))
  const f = await fixture(page, detail)
  await page.goto('/u/andromeda/alliance')
  await page.getByRole('button', { name: 'Members', exact: true }).click()
  await page.getByRole('button', { name: 'Assign roles to Nova', exact: true }).click()
  await expect(page.getByText('This member holds a role above your delegated authority.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save member roles', exact: true })).toBeDisabled()
  const cancel = page.getByRole('button', { name: 'Cancel role changes', exact: true })
  await expect(cancel).toBeEnabled()
  await cancel.click()
  await expect(page.getByRole('button', { name: 'Assign roles to Nova', exact: true })).toBeVisible()
  expect(f.commands).toEqual([])
})

test('expired noticeboard cursors recover to fresh notices and Refresh remains usable', async ({ page }) => {
  const detail = own(); detail.next_post_before = id(851)
  await fixture(page, detail)
  const queries: S['AllianceQuery'][] = []
  await page.route('**/alliances/query', route => {
    const { context, query } = route.request().postDataJSON() as S['AllianceQueryRequest']
    queries.push(query)
    if (query.type === 'Detail' && query.post_before) {
      detail.revision++
      detail.posts![0].title = 'Fresh standing orders'
      detail.next_post_before = null
      return route.fulfill({ status:409, json:{code:'Conflict'} })
    }
    return route.fulfill({json:{...context,sampled_at:1700000000000,directory:[],directory_count:0,alliance:detail,applications:[]}})
  })
  await page.goto('/u/andromeda/alliance')
  await page.getByRole('button', { name:'Older notices', exact:true }).click()
  await expect(page.getByRole('heading',{name:'Fresh standing orders',exact:true})).toBeVisible()
  await expect(page.getByRole('status').filter({hasText:'Showing the newest notices'})).toBeVisible()
  await page.getByRole('button',{name:'Refresh alliance',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Fresh standing orders',exact:true})).toBeVisible()
  await expect(page.getByRole('status').filter({hasText:'Showing the newest notices'})).toHaveCount(0)
  expect(queries.filter(q=>q.type==='Detail' && q.post_before)).toHaveLength(1)
  expect(queries.at(-1)).toEqual({type:'Detail',alliance,post_before:null})
})

test('saving an unrelated role retains an edited notice draft', async ({page})=>{
  await fixture(page,own())
  await page.goto('/u/andromeda/alliance')
  await page.getByText('Write a notice',{exact:true}).click()
  await page.getByRole('textbox',{name:'Notice title',exact:true}).fill('Unpublished orders')
  await page.getByRole('textbox',{name:'Notice body',exact:true}).fill('Keep this draft while assigning duties.')
  await page.getByRole('button',{name:'Roles',exact:true}).click()
  await page.getByText('Create a custom role',{exact:true}).click()
  await page.getByRole('textbox',{name:'Role name',exact:true}).fill('Observer')
  await page.getByRole('button',{name:'Create role',exact:true}).click()
  await expect(page.getByText('Observer',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Board',exact:true}).click()
  await page.getByText('Write a notice',{exact:true}).click()
  await expect(page.getByRole('textbox',{name:'Notice title',exact:true})).toHaveValue('Unpublished orders')
  await expect(page.getByRole('textbox',{name:'Notice body',exact:true})).toHaveValue('Keep this draft while assigning duties.')
})

for (const viewport of [{ width: 390, height: 740 }, { width: 1440, height: 900 }]) {
  test.describe(`alliance reading at ${viewport.width}px`, () => {
    test.use({ viewport, isMobile: viewport.width < 768, hasTouch: viewport.width < 768 })

    test('long pinned notices preserve reading, selection and focus through live updates', async ({ page }) => {
      const now = new Date('2026-10-26T12:00:00Z')
      await page.clock.install({ time: now })
      await page.clock.pauseAt(now)
      const detail = own()
      detail.posts![0].pinned = true
      // A tall preformatted notice mirrors the ASCII art in the iPhone report.
      detail.posts![0].body = '```\n' + Array.from({ length: 60 }, (_, index) => `| Standing order ${index + 1} |`).join('\n') + '\n```\n\nRead these standing orders together.\n\n[Read recruitment](/alliances/' + binding.universe + '/' + alliance + ')'
      await fixture(page, detail)
      await page.goto('/u/andromeda/alliance')
      const article = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Welcome aboard' }) })
      await expect(article).toBeVisible()
      await page.clock.runFor(500)
      await page.evaluate(() => document.fonts.ready)
      const passage = article.getByText('Read these standing orders together.', { exact: true })
      await passage.scrollIntoViewIfNeeded()
      await passage.evaluate(node => {
        const range = document.createRange()
        range.selectNodeContents(node)
        const selection = window.getSelection()!
        selection.removeAllRanges()
        selection.addRange(range)
      })
      const before = await page.evaluate(() => scrollY)
      await page.clock.runFor(1000)
      expect(await page.evaluate(() => scrollY)).toBeCloseTo(before, 0)
      expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('Read these standing orders together.')

      const link = article.getByRole('link', { name: 'Read recruitment', exact: true })
      await link.focus()
      const focusedPosition = await page.evaluate(() => scrollY)
      const refreshed = page.waitForResponse(response => response.url().endsWith('/overview'))
      await refreshGame(page)
      await page.clock.runFor(1000)
      await refreshed
      await expect(link).toBeFocused()
      expect(await page.evaluate(() => scrollY)).toBeCloseTo(focusedPosition, 0)

      // Mobile browser chrome changes the viewport height while reading.
      await page.setViewportSize({ ...viewport, height: viewport.height + 90 })
      const pages = page.getByRole('navigation', { name: 'Notice pages' })
      await pages.scrollIntoViewIfNeeded()
      await page.clock.runFor(1000)
      await expect(pages.getByRole('button', { name: 'Newest notices' })).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await diagnosticScreenshot(page, { path: `test-results/alliance-reading-${viewport.width}.png` })
      await link.click()
      await expect(page).toHaveURL(new RegExp(`/alliances/${binding.universe}/${alliance}$`))
      await expect(page.getByRole('heading', { name: summary.name })).toBeVisible()
    })
  })
}
