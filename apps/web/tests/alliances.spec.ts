import { recruitmentFixture, alliance as recruitmentAlliance } from './fixtures/recruitment'
import { withFixtureResponse } from './fixtures/responses'
import { focusPlayerDetails } from './fixtures/profile-navigation'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect, type Page } from './fixtures/test'
import { installGameFixture, refreshGame, binding, id, body } from './fixtures/game'
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
      case 'CreatePost': detail!.posts = [{ id: id(880), author: binding.player, author_name: 'Commander', title: action.title ?? '', body: action.body ?? '', created_at: 1700000000001, updated_at: 1700000000001, pinned: false }, ...detail!.posts!].slice(0, 100); break
      case 'PinPost': detail!.posts!.find(p => p.id === action.post)!.pinned = action.pinned; break
      case 'EditPost': Object.assign(detail!.posts!.find(p => p.id === action.post)!, { title: action.title ?? '', body: action.body ?? '' }); break
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

// Both membership and public profile are prerequisites for recruitment controls.
function withAllianceProfile(page: Page, navigate: () => Promise<unknown>) {
  return withFixtureResponse(page, response => response.url().endsWith('/alliances/query') && response.request().postDataJSON().query.type === 'Mine', () =>
    withFixtureResponse(page, response => response.url().endsWith(`/alliances/${alliance}`), navigate),
  )
}

test('discovery applications preserve rejected drafts, withdraw and create an alliance', async ({ page }) => {
  const f = await fixture(page, null)
  await withFixtureResponse(page, response => response.url().endsWith('/alliances/query') && response.request().postDataJSON().query.type === 'Mine', () => page.goto('/u/andromeda/alliance'))
  await expect(page.getByRole('heading', { name: 'You’re not in an alliance yet.' })).toBeVisible()
  await expect(page.getByRole('searchbox')).toHaveCount(0)
  await withFixtureResponse(page, response => response.url().endsWith('/alliances/query') && response.request().postDataJSON().query.type === 'Directory', () => page.getByRole('link', { name: 'Discover alliances', exact: true }).click())
  await expect(page).toHaveURL(/\/alliance\/discover$/)
  await expect(page.getByRole('button', { name: 'View STAR', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'My alliance', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Discover alliances', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Refresh alliance', exact: true })).toHaveCount(0)
  await page.getByRole('searchbox', { name: 'Search alliances', exact: true }).fill('STAR')
  await withFixtureResponse(page, response => response.url().endsWith('/alliances/query') && response.request().postDataJSON().query.type === 'Directory', () => page.getByRole('button', { name: 'Search alliances', exact: true }).click())
  await withFixtureResponse(page, response => response.url().endsWith(`/alliances/${alliance}`), () => page.getByRole('button', { name: 'View STAR', exact: true }).click())
  await expect(page).toHaveURL(new RegExp(`/alliance/discover\\?alliance=${alliance}$`))
  await withAllianceProfile(page, () => page.reload())
  // Mobile header wiring: Back and Create must not crush the destination title.
  await page.setViewportSize({ width: 390, height: 844 })
  const discoveryHeading = page.getByRole('heading', { name: 'Discover alliances', exact: true, level: 2 })
  expect((await discoveryHeading.boundingBox())!.height).toBeLessThan(60)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByLabel('Application message').fill('I explore distant stars.')
  f.rejectNext()
  await page.getByRole('button', { name: 'Send application' }).click()
  await expect(page.getByRole('alert')).toContainText('Conflict')
  await expect(page.getByLabel('Application message')).toHaveValue('I explore distant stars.')
  await page.getByRole('button', { name: 'Send application' }).click()
  await expect(page.getByRole('heading', { name: 'Your applications (1/5)' })).toBeVisible()
  await page.getByRole('button', { name: 'Withdraw STAR', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm withdraw star' }).click()
  await expect(page.getByRole('heading', { name: 'You’re not in an alliance yet.' })).toBeVisible()
  await withFixtureResponse(page, response => response.url().endsWith('/alliances/query') && response.request().postDataJSON().query.type === 'Mine', () => page.getByRole('link', { name: 'Create Alliance', exact: true }).click())
  await expect(page).toHaveURL(/\/alliance\/create$/)
  await withFixtureResponse(page, response => response.url().endsWith('/alliances/query'), () => page.reload())
  await expect(page.getByRole('searchbox')).toHaveCount(0)
  await page.getByLabel('Alliance name', { exact: true }).fill('New Horizon')
  await page.getByLabel('Alliance tag', { exact: true }).fill('NEW')
  await page.getByRole('button', { name: 'Create Alliance', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'New Horizon' })).toBeVisible()
  await expect(page).toHaveURL(/\/alliance$/)
  await expect(page.getByRole('heading', { name: 'My alliance', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Discover alliances', exact: true })).toBeVisible()
  expect(f.commands.map(c => c.action.type)).toEqual(['Apply', 'Apply', 'Withdraw', 'Create'])
  expect(f.commands[0].command_id).not.toBe(f.commands[1].command_id)
})

test('open and closed recruitment and existing membership drive the available controls', async ({ page }) => {
  const f = await fixture(page, null)
  await page.route(`**/alliances/${alliance}`, route => route.fulfill({ json: { summary: { ...summary, recruitment: 'Closed' }, public_text: 'Private explorers.' } }))
  await withAllianceProfile(page, () => page.goto(`/u/andromeda/alliance?alliance=${alliance}`))
  await expect(page.getByRole('heading', { name: summary.name, exact: true })).toBeVisible()
  await expect(page.getByText('This alliance is not recruiting.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send application' })).toHaveCount(0)
  await page.route(`**/alliances/${alliance}`, route => route.fulfill({ json: { summary: { ...summary, recruitment: 'Open' }, public_text: 'Welcome explorers.' } }))
  await withAllianceProfile(page, () => page.reload())
  await page.getByRole('button', { name: 'Join STAR', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm join star' }).click()
  await expect(page.getByRole('heading', { name: 'Welcome aboard' })).toBeVisible()
  await withFixtureResponse(page, response => response.url().endsWith('/alliances/query') && response.request().postDataJSON().query.type === 'Directory', () => page.getByRole('link', { name: 'Discover alliances' }).click())
  await expect(page.getByRole('link', { name: 'Create Alliance', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'View STAR', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome aboard' })).toBeVisible()
  expect(f.commands.map(c => c.action.type)).toEqual(['Join'])
})

test('lost membership clears private board, roster and administration after an access-denied reload', async ({ page }) => {
  const f = await fixture(page, own())
  await withFixtureResponse(page, (response) => response.url().endsWith('/alliances/query') && response.request().postDataJSON().query.type === 'Mine', () => page.goto('/u/andromeda/alliance'))
  await page.getByRole('link', { name: 'Members', exact: true }).click()
  const roster = page.getByRole('region', { name: 'Alliance roster' })
  await expect(roster.getByRole('link', { name: /profile details/ }).getByText('[STAR]', {exact: true})).toHaveCount(2)
  f.denyReads()
  const denied = page.waitForResponse(response => response.url().endsWith('/alliances/query') && response.status() === 403)
  await page.reload()
  expect((await denied).status()).toBe(403)
  await expect(page.getByRole('alert')).toContainText('Forbidden')
  await expect(page.getByRole('region', { name: 'Alliance roster' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Roles', exact: true })).toHaveCount(0)
  await expect(page.getByText('Nova', { exact: true })).toHaveCount(0)
})

test('uncertain command retry reuses identity and does not send an edited duplicate', async ({ page }) => {
  await fixture(page, null)
  const requests: S['AllianceCommandRequest'][] = []
  await page.route('**/alliances/commands', route => {
    requests.push(route.request().postDataJSON())
    if (requests.length === 1) return route.fulfill({ status: 503, json: { code: 'Unavailable' } })
    return route.fulfill({ json: { command_id: requests[0].command_id, alliance, revision: 1 } })
  })
  await withAllianceProfile(page, () => page.goto(`/u/andromeda/alliance?alliance=${alliance}`))
  await page.getByLabel('Application message').fill('My original application')
  await page.getByRole('button', { name: 'Send application' }).click()
  await expect(page.getByRole('button', { name: 'Send application' })).toBeDisabled()
  await expect(page.getByLabel('Application message')).toHaveValue('My original application')
  await withFixtureResponse(page, response => response.url().endsWith('/alliances/query') && response.request().postDataJSON().query.type === 'Mine', () => page.getByRole('button', { name: 'Retry last command' }).click())
  await expect(page).toHaveURL(/\/alliance$/)
  await expect(page.getByRole('heading', { name: 'My alliance', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry last command' })).toHaveCount(0)
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
  await withFixtureResponse(page, (response) => response.url().endsWith('/alliances/query') && response.request().postDataJSON().query.type === 'Mine', () => page.goto('/u/andromeda/alliance'))
  const article = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Welcome aboard' }) })
  await focusPlayerDetails(page, article.getByRole('link', { name: 'Departed Pilot profile details' }))
  await expect(page.getByRole('tooltip').getByRole('link', { name: 'Alliance Other Alliance [AWAY]', exact: true })).toBeVisible()
  for (const width of [1440, 390]) {
    await page.setViewportSize({width, height: 1000})
    await diagnosticScreenshot(page, {path: `test-results/profile-alliance-board-${width}x1000.png`})
  }
  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: 'Members', exact: true }).click()
  const roster = page.getByRole('region', { name: 'Alliance roster' })
  await expect(roster.getByRole('link', { name: /profile details/ }).getByText('[STAR]', {exact: true})).toHaveCount(2)
  await expect(roster.getByText('[AWAY]', {exact: true})).toHaveCount(0)
  for (const width of [1440, 390]) {
    await page.setViewportSize({width, height: 1000})
    await focusPlayerDetails(page, roster.getByRole('link', {name: 'Nova profile details'}))
    await expect(page.getByRole('tooltip', {name: 'Nova profile'})).toBeVisible()
    await diagnosticScreenshot(page, {path: `test-results/profile-alliance-members-${width}x1000.png`})
    await page.keyboard.press('Escape')
  }
})

// Desktop geometry is isolated; retain mobile overview refresh and public-link navigation.
for (const viewport of [{ width: 390, height: 740 }]) {
  test.describe(`alliance reading at ${viewport.width}px`, () => {
    test.use({ viewport, isMobile: viewport.width < 768, hasTouch: viewport.width < 768 })

    test('long pinned notices preserve reading, selection and focus through live updates', async ({ page }) => {
      const now = new Date('2026-10-26T12:00:00Z')
      await page.clock.install({ time: now })
      await page.clock.pauseAt(now)
      const detail = own()
      detail.posts![0].pinned = true
      detail.next_post_before = id(851)
      // A tall preformatted notice mirrors the ASCII art in the iPhone report.
      detail.posts![0].body = '```\n' + Array.from({ length: 60 }, (_, index) => `| Standing order ${index + 1} |`).join('\n') + '\n```\n\nRead these standing orders together.\n\n[Read recruitment](/alliances/' + binding.universe + '/' + alliance + ')'
      await fixture(page, detail)
      await withFixtureResponse(page, (response) => response.url().endsWith('/alliances/query') && response.request().postDataJSON().query.type === 'Mine', () => page.goto('/u/andromeda/alliance'))
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
      await expect(pages.getByRole('button', { name: 'Load older notices' })).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await diagnosticScreenshot(page, { path: `test-results/alliance-reading-${viewport.width}.png` })
      await link.click()
      await expect(page).toHaveURL(new RegExp(`/alliances/${binding.universe}/${alliance}$`))
      await expect(page.getByRole('heading', { name: summary.name })).toBeVisible()
    })
  })
}

// Mobile variant removed after its second failure; see alliance-discovery verification notes.
for (const width of [1440]) {
  test(`alliance search combines language and recruiting filters and keeps compact controls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({width, height: 900})
    await fixture(page, null)
    const rows = Array.from({length: 23}, (_, index) => ({...summary, id: id(1100 + index), name: `Alliance ${String(index).padStart(2, '0')}`, tag: `A${index}`, recruitment: index === 0 ? 'Closed' : 'Application', recruitment_profile: {listed:false, languages:[index === 22 ? 'fr' : 'en'], beginners:'Welcome', activity:'Weekly'}}))
    await page.route('**/alliances/query', route => {
      const {context, query} = route.request().postDataJSON()
      const matches = query.type === 'Directory' ? rows.filter(row => (!query.search || row.name.toLowerCase().includes(query.search.toLowerCase())) && (!query.language || row.recruitment_profile.languages.includes(query.language)) && (!query.recruiting_only || row.recruitment !== 'Closed')) : []
      return route.fulfill({json:{...context, sampled_at:1700000000000, directory:matches.slice(query.offset ?? 0, (query.offset ?? 0) + 20), directory_count:matches.length, alliance:null, applications:[]}})
    })
    const directoryResponse = (response: import('@playwright/test').Response) => response.url().endsWith('/alliances/query') && response.request().postDataJSON().query.type === 'Directory'
    await withFixtureResponse(page, directoryResponse, () => page.goto('/u/andromeda/alliance/discover'))
    const recruiting = page.getByRole('checkbox', {name:'Only show recruiting'})
    await expect(recruiting).toHaveCount(0)
    await expect(page.getByText('Recruitment closed', {exact:true})).toBeVisible()
    const list = page.getByRole('list', {name:'Alliances', exact:true})
    await expect(list.locator(':scope > li')).toHaveCount(20)
    const pagination = page.getByRole('navigation', {name:'Alliance directory pages'})
    await withFixtureResponse(page, directoryResponse, () => pagination.getByRole('button', {name:'Next', exact:true}).click())
    await expect(list.locator(':scope > li')).toHaveCount(3)
    await page.getByRole('button', {name:'Filters', exact:true}).click()
    await expect(recruiting).not.toBeChecked()
    await withFixtureResponse(page, directoryResponse, () => page.getByLabel('Language', {exact:true}).selectOption('en'))
    await page.keyboard.press('Escape')
    await expect(page.getByText('22 alliances', {exact:true})).toBeVisible()
    await expect(page.getByText('Recruitment closed', {exact:true})).toBeVisible()
    await expect(pagination.getByRole('button', {name:'Previous', exact:true})).toBeDisabled()
    await page.getByRole('button', {name:'Filters (1)', exact:true}).click()
    await withFixtureResponse(page, directoryResponse, () => recruiting.check())
    await expect(recruiting).toBeChecked()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', {name:'Filters (2)', exact:true})).toBeVisible()
    await expect(page.getByText('21 alliances', {exact:true})).toBeVisible()
    await expect(page.getByText('Recruitment closed', {exact:true})).toHaveCount(0)
    const search = page.getByRole('searchbox', {name:'Search alliances'})
    const submit = page.getByRole('button', {name:'Search alliances', exact:true})
    await search.fill('missing')
    await withFixtureResponse(page, directoryResponse, () => submit.click())
    await expect(page.getByRole('heading', {name:'No alliances match your search.'})).toBeVisible()
    await expect(pagination).toHaveCount(0)
    await expect(search).toHaveValue('missing')
    await withFixtureResponse(page, directoryResponse, () => page.getByRole('button', {name:'Clear filters', exact:true}).click())
    await page.getByRole('button', {name:'Filters', exact:true}).click()
    await expect(recruiting).not.toBeChecked()
    await page.keyboard.press('Escape')
    await expect(page.getByText('23 alliances', {exact:true})).toBeVisible()
    await search.focus()
    await expect(search).toBeFocused()
    await expect(search.locator('..')).toHaveCSS('outline-style', 'solid')
    const inputBox = (await search.boundingBox())!, buttonBox = (await submit.boundingBox())!
    expect(inputBox.height).toBeLessThanOrEqual(46)
    expect(buttonBox.height).toBeLessThanOrEqual(46)
    expect(buttonBox.x).toBeGreaterThanOrEqual(inputBox.x + inputBox.width)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

for (const action of ['Join', 'Apply'] as const) {
  test(`welcome ${action} retry returns to alliance home with the original command`, async ({ page }) => {
    await fixture(page, null)
    await page.route(`**/alliances/${alliance}`, route => route.fulfill({ json: {
      summary: { ...summary, recruitment: action === 'Join' ? 'Open' : 'Application' },
      public_text: 'Welcome explorers.',
    } }))
    const requests: S['AllianceCommandRequest'][] = []
    await page.route('**/alliances/commands', route => {
      requests.push(route.request().postDataJSON())
      if (requests.length === 1) return route.fulfill({ status: 503, json: { code: 'Unavailable' } })
      return route.fallback()
    })
    await withAllianceProfile(page, () => page.goto(`/u/andromeda/alliance/discover?alliance=${alliance}&welcome=1`))
    const unavailable = page.waitForResponse(response => response.url().endsWith('/alliances/commands') && response.status() === 503)
    if (action === 'Join') {
      await page.getByRole('button', { name: 'Join STAR', exact: true }).click()
      await page.getByRole('button', { name: 'Confirm join star' }).click()
    } else {
      await page.getByLabel('Application message').fill('Ready to explore together.')
      await page.getByRole('button', { name: 'Send application' }).click()
    }
    expect(await (await unavailable).finished()).toBeNull()
    await expect(page.getByRole('button', { name: 'Retry last command' })).toBeVisible()
    await withFixtureResponse(page, response => response.url().endsWith('/alliances/query') && response.request().postDataJSON().query.type === 'Mine', () => page.getByRole('button', { name: 'Retry last command' }).click())
    await expect(page).toHaveURL(/\/alliance$/)
    await expect(page.getByRole('heading', { name: action === 'Join' ? 'Welcome aboard' : 'Your applications (1/5)' })).toBeVisible()
    expect(requests).toHaveLength(2)
    expect(requests[1].command_id).toBe(requests[0].command_id)
    expect(requests[1].action).toEqual(requests[0].action)
  })
}

// Application gate: a submitted membership mutation changes the destination route.
// Isolated components own role, draft, notice-editing and recruitment-form interactions.
test('creates an alliance from its route and returns to membership home', { tag: '@journey' }, async ({ page }) => {
  const f = await fixture(page, null)
  const membership = (response: import('@playwright/test').Response) => response.url().endsWith('/alliances/query') && response.request().postDataJSON().query.type === 'Mine'
  await withFixtureResponse(page, membership, () => page.goto('/u/andromeda/alliance/create'))
  await page.getByLabel('Alliance name', { exact: true }).fill('New Horizon')
  await page.getByLabel('Alliance tag', { exact: true }).fill('NEW')
  await withFixtureResponse(page, membership, () => page.getByRole('button', { name: 'Create Alliance', exact: true }).click())
  await expect(page).toHaveURL(/\/alliance$/)
  await expect(page.getByRole('heading', { name: 'New Horizon', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'My alliance', exact: true })).toBeVisible()
  expect(f.commands.map(command => command.action.type)).toEqual(['Create'])
})

// Restored: controller state cannot prove the screen recovery live region.
test('expired noticeboard cursors recover to fresh notices', { tag: '@journey' }, async ({ page }) => {
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
  await withFixtureResponse(page, (response) => response.url().endsWith('/alliances/query') && response.request().postDataJSON().query.type === 'Mine', () => page.goto('/u/andromeda/alliance'))
  await page.getByRole('button', { name:'Load older notices', exact:true }).click()
  await expect(page.getByRole('heading',{name:'Fresh standing orders',exact:true})).toBeVisible()
  await expect(page.getByRole('region', { name: 'Alliance noticeboard' }).getByRole('status').filter({hasText:'Showing the newest notices'})).toBeVisible()
  expect(queries.filter(q=>q.type==='Detail' && q.post_before)).toHaveLength(1)
  expect(queries.at(-1)).toEqual({type:'Detail',alliance,post_before:null})
})


// One application journey owns editor -> command -> refreshed public projection wiring.
test('alliance presentation previews unsaved edits and publishes them through the real editor', async ({
  page,
}) => {
  const fixture = await recruitmentFixture(page, {
    manager: true,
    customization: true,
  })
  const mine = (response: import('@playwright/test').Response) =>
    response.url().endsWith('/alliances/query') &&
    response.request().postDataJSON().query.type === 'Mine'
  await withFixtureResponse(page, mine, () =>
    page.goto('/u/andromeda/alliance'),
  )
  await withFixtureResponse(
    page,
    (r) => {
      const url = new URL(r.url())
      return (
        url.pathname === '/api/alliance-presentation/catalog' &&
        url.searchParams.get('alliance') === recruitmentAlliance
      )
    },
    () =>
      page
        .getByRole('navigation', { name: 'Alliance sections' })
        .getByRole('link', { name: 'Settings', exact: true })
        .click(),
  )
  await page
    .getByRole('textbox', { name: 'Motto', exact: true })
    .fill('Good company. Uncharted space.')
  await page.getByRole('link', { name: 'Discover alliances', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Leave without saving?' })).toBeVisible()
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Motto', exact: true })).toHaveValue('Good company. Uncharted space.')
  await page
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('link', { name: 'Public page', exact: true })
    .click()
  await page
    .getByRole('textbox', { name: 'Hero introduction', exact: true })
    .fill('Build something worth coming home to.')
  await page
    .getByRole('button', { name: 'Preview public page', exact: true })
    .click()
  const preview = page.getByRole('dialog', {
    name: 'Preview · unsaved changes',
    exact: true,
  })
  await expect(
    preview.getByText('Build something worth coming home to.', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Close preview', exact: true }).click()
  await withFixtureResponse(page, mine, () =>
    page
      .getByRole('button', { name: 'Save presentation', exact: true })
      .click(),
  )
  await expect(
    page.getByText('Alliance presentation saved.', { exact: true }),
  ).toBeVisible()
  const command = fixture.commands.find(
    (c) => c.action.type === 'SavePresentation',
  )!
  expect(command.expected_revision).toBe(1)
  expect(
    command.action.type === 'SavePresentation' &&
      command.action.edits.map((e) => e.type),
  ).toEqual(['SetIdentity', 'SetTemplateDocument'])
  await withFixtureResponse(
    page,
    (r) => r.url().endsWith(`/alliances/${recruitmentAlliance}`),
    () => page.goto(`/alliances/${binding.universe}/${recruitmentAlliance}`),
  )
  await expect(
    page.getByText('Good company. Uncharted space.', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Build something worth coming home to.', { exact: true }),
  ).toBeVisible()
})

// Route history/reload and the persistent workspace require the actual application router.
test('alliance deep links restore settings and history preserves authored drafts', { tag: '@journey' }, async ({ page }) => {
  await fixture(page, own())
  const root = `/u/andromeda/b/${body.id}/alliance`
  const membership = (response: import('@playwright/test').Response) => response.url().endsWith('/alliances/query') && response.request().postDataJSON().query.type === 'Mine'
  await withFixtureResponse(page, membership, () => page.goto(`${root}/settings/recruitment`))
  const settings = page.getByRole('navigation', { name: 'Settings sections' })
  const sections = page.getByRole('navigation', { name: 'Alliance sections' })
  await expect(settings.getByRole('link', { name: 'Recruitment', exact: true })).toHaveAttribute('aria-current', 'page')
  await withFixtureResponse(page, membership, () => page.reload())
  await expect(settings.getByRole('link', { name: 'Recruitment', exact: true })).toHaveAttribute('aria-current', 'page')
  await settings.getByRole('link', { name: 'Identity', exact: true }).click()
  await page.getByLabel('Alliance name', { exact: true }).fill('Unfinished constellation')
  await sections.getByRole('link', { name: 'Members', exact: true }).click()
  await expect(page).toHaveURL(`${root}/members`)
  await expect(page.getByRole('region', { name: 'Alliance roster' })).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(`${root}/settings/identity`)
  await expect(page.getByLabel('Alliance name', { exact: true })).toHaveValue('Unfinished constellation')
  await page.goForward()
  await expect(page.getByRole('region', { name: 'Alliance roster' })).toBeVisible()
  await withFixtureResponse(page, membership, () => page.goto(`${root}/audit`))
  await expect(sections.getByRole('link', { name: 'Audit', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByText('Created alliance', { exact: true })).toBeVisible()
  // Planetless entry points must preserve the subsection when adding the owned body.
  await withFixtureResponse(page, membership, () => page.goto('/u/andromeda/alliance/settings/invitations'))
  await expect(page).toHaveURL(`${root}/settings/invitations`)
  await expect(settings.getByRole('link', { name: 'Invitations', exact: true })).toHaveAttribute('aria-current', 'page')
})
