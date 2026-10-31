import { openNavigation } from './fixtures/navigation'
import { test, expect } from './fixtures/test'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { installGameFixture, binding, id, body } from './fixtures/game'

test('High Scores keeps one snapshot through search and paging, finds me, and opens accessible details', async ({ page }) => {
  await installGameFixture(page, { protocol: 4 })
  const players = Array.from({ length: 123 }, (_, i) => ({
    player: i === 80 ? binding.player : id(1000 + i),
    username: i === 80 ? 'My Commander' : i === 0 ? 'A very long commander name across the distant stars' : `Pilot ${i}`,
    points: i < 2 ? '9223372036' : `${1000 - i}`, rank: i < 2 ? 1 : i + 1,
  }))
  let requests = 0, failed = false
  await page.route('**/rankings', route => {
    requests++
    if (failed) return route.fulfill({ status: 503, json: { code: 'Unavailable' } })
    const context = route.request().postDataJSON()
    return route.fulfill({ json: { binding, request_id: context.request_id, sampled_at: 1792843200000, processing_pending: false, players } })
  })
  await page.route('**/player-profiles', route => {
    const { context, source } = route.request().postDataJSON()
    const now = Math.floor(Date.now() / 1000)
    const visible = new Set(source.players ?? [binding.player])
    return route.fulfill({ json: { binding, request_id: context.request_id, players: players.filter(p => visible.has(p.player)).map(p => ({ player: p.player, username: p.username, ...(p === players[0] ? { supporter_tier: 2 } : {}), observed_at: now, expires_at: now + 300 })) } })
  })
  await page.goto(`/u/andromeda/high-scores?body=${body.id}`)
  await expect(page.getByRole('heading', { name: 'High Scores', exact: true })).toBeVisible()
  const table = page.getByRole('table', { name: 'Universe total-score rankings' })
  await expect(table.getByRole('row')).toHaveCount(51)
  await expect(table.getByRole('row').nth(1).getByRole('cell').first()).toHaveText('1—')
  await expect(table.getByRole('row').nth(2).getByRole('cell').first()).toHaveText('1—')
  for (const width of [1440, 768, 390, 360, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await diagnosticScreenshot(page, { path: `test-results/high-scores-${width}.png` })
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await table.getByRole('button', { name: /A very long commander.*profile details/ }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await diagnosticScreenshot(page, {path: `test-results/profile-high-scores-${width}x1000.png`})
    await page.keyboard.press('Escape')
  }
  const leader = table.getByRole('button', { name: /Score details for A very long commander/ })
  await leader.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('9,223,372,036')
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(leader).toBeFocused()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(table).toBeFocused()
  await expect(table.getByRole('row').nth(1)).toBeInViewport()
  await expect(table).toContainText('Pilot 50')
  await expect(table).not.toContainText('Pilot 49')
  await page.getByRole('searchbox', { name: 'Find a player' }).fill('pILot 122')
  await expect(table.getByRole('row')).toHaveCount(2)
  await expect(table.getByRole('row').nth(1).getByRole('cell').first()).toHaveText('123—')
  await page.getByRole('button', { name: 'Around me', exact: true }).click()
  await expect(page.getByRole('searchbox', { name: 'Find a player' })).toHaveValue('')
  await expect(table.locator('tr[data-self]')).toContainText('My Commander')
  await expect(table.getByRole('row').nth(1)).toContainText('Pilot 55')
  await expect(table.locator('tr[data-self]').getByRole('button', { name: /profile details/ })).toBeFocused()
  await expect(table.locator('tr[data-self]')).toBeInViewport()
  expect(requests).toBe(1)
  failed = true
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Showing the previous snapshot')
  await expect(table.locator('tr[data-self]')).toContainText('My Commander')
  failed = false
  players[80].points = '777'
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(table.locator('tr[data-self]')).toContainText('777')
  await page.getByRole('searchbox', { name: 'Find a player' }).fill('does not exist')
  await expect(page.getByRole('status').filter({ hasText: 'No players match' })).toBeVisible()
  await page.getByRole('button', { name: 'Clear search' }).click()
  await expect(page.getByRole('searchbox', { name: 'Find a player' })).toBeFocused()
  await expect(page.getByRole('searchbox', { name: 'Find a player' })).toHaveValue('')
  await expect(table.getByRole('row')).toHaveCount(51)
  await expect(page.getByRole('button', { name: 'Clear search' })).toHaveCount(0)
})

test('High Scores has a retryable initial error and honest empty result', async ({ page }) => {
  await installGameFixture(page, { protocol: 4 })
  let failed = true
  await page.route('**/rankings', route => failed
    ? route.fulfill({ status: 503, json: { code: 'Unavailable' } })
    : route.fulfill({ json: { binding, request_id: route.request().postDataJSON().request_id, sampled_at: 1000, processing_pending: false, players: [] } }))
  await page.goto('/u/andromeda/high-scores')
  await expect(page.getByRole('alert')).toContainText('could not be refreshed')
  failed = false
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByText('No players are ranked yet.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Around me' })).toBeDisabled()
})

test('a refresh removing the selected player closes details, restores useful focus, and does not reopen them later', async ({ page }) => {
  await installGameFixture(page, { protocol: 4 })
  const players = [{ player: binding.player, username: 'Selected Commander', points: '12', rank: 1 }]
  let visible = true, requests = 0
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route('**/rankings', async route => {
    requests++
    if (requests === 2) await pending
    await route.fulfill({ json: { binding, request_id: route.request().postDataJSON().request_id, sampled_at: 1000 + requests, processing_pending: false, players: visible ? players : [] } })
  })
  await page.goto('/u/andromeda/high-scores')
  const table = page.getByRole('table', { name: 'Universe total-score rankings' })
  const player = table.getByRole('button', { name: 'Score details for Selected Commander' })
  await expect(player).toBeVisible()
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await player.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  visible = false
  release()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(table).toBeFocused()
  visible = true
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(player).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('browser navigation away from player details leaves the destination usable', async ({ page }) => {
  await installGameFixture(page, { protocol: 4 })
  await page.route('**/rankings', route => route.fulfill({ json: { binding, request_id: route.request().postDataJSON().request_id, sampled_at: 1000, processing_pending: false, players: [{ player: binding.player, username: 'Selected Commander', points: '12', rank: 1 }] } }))
  await page.goto(`/u/andromeda/overview?body=${body.id}`)
  await openNavigation(page)
  await page.getByRole('link', { name: 'High Scores', exact: true }).click()
  await page.getByRole('table').getByRole('button', { name: 'Score details for Selected Commander' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Empire', exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await openNavigation(page)
  await expect(page.getByRole('link', { name: 'High Scores', exact: true })).toBeVisible()
})

test('rank movement is accessible, stable through filters and paging, and refreshes with its baseline', async ({ page }) => {
  await installGameFixture(page, { protocol: 4 })
  let baseline: number | null = 1792800000000
  const players = Array.from({ length: 55 }, (_, i) => ({
    player: i === 54 ? binding.player : id(5000 + i), username: `Mover ${i}`, points: `${100 - i}`, rank: i + 1,
    previous_rank: i === 0 ? 3 : i === 1 ? 1 : i === 2 ? null : i + 1,
  }))
  await page.route('**/rankings', route => route.fulfill({ json: { binding, request_id: route.request().postDataJSON().request_id, sampled_at: 1792886400000, baseline_at: baseline, processing_pending: false, players } }))
  await page.goto('/u/andromeda/high-scores')
  const table = page.getByRole('table')
  await expect(page.getByText('Rank change since yesterday’s first snapshot', { exact: false })).toBeVisible()
  await expect(table.getByLabel('Up 2 places since the baseline')).toHaveText('+2')
  await expect(table.getByLabel('Down 1 place since the baseline')).toHaveText('−1')
  await expect(table.getByLabel('New to the rankings since the baseline')).toHaveText('New')
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await diagnosticScreenshot(page, { path: `test-results/rank-movement-${width}.png` })
  }
  await page.getByRole('searchbox').fill('Mover 0')
  await expect(table.getByLabel('Up 2 places since the baseline')).toHaveText('+2')
  await table.getByRole('button', { name: 'Score details for Mover 0', exact: true }).click()
  await expect(page.getByRole('dialog').getByLabel('Up 2 places since the baseline')).toHaveText('+2')
  await page.keyboard.press('Escape')
  await expect(table.getByRole('button', { name: 'Score details for Mover 0', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Top players' }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(table.getByLabel('Rank unchanged since the baseline')).toHaveCount(5)
  await page.getByRole('button', { name: 'Around me' }).click()
  await expect(table.locator('tr[data-self]').getByLabel('Rank unchanged since the baseline')).toHaveText('0')
  players[54].rank = 50
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(table.locator('tr[data-self]').getByLabel('Up 5 places since the baseline')).toHaveText('+5')
  baseline = null
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(table.locator('tr[data-self]').getByLabel('Rank change unavailable: no snapshot from yesterday')).toHaveText('—')
  await expect(page.getByText('Rank changes unavailable:', { exact: false })).toBeVisible()
})


test('alliance standings share one snapshot, search names and tags, and navigate around my alliance', async ({ page }) => {
  await installGameFixture(page, { protocol: 4 })
  const alliances = Array.from({ length: 123 }, (_, i) => ({
    alliance: { id: id(6000 + i), universe: binding.universe, name: i === 80 ? 'Étoile alliance with a very long recruitment name' : `Alliance ${i}`, tag: `TAG${i}` },
    member_count: 2, points: i === 0 ? '18446744073' : `${1000 - i}`, average_points: i === 0 ? '9223372036' : '450', rank: i < 2 ? 1 : i + 1, previous_rank: i === 2 ? null : i + 3,
  }))
  let baseline: number | null = 1792800000000
  let ownAlliance = true
  let requests = 0
  await page.route('**/rankings', route => {
    requests++
    return route.fulfill({ json: {
      binding, request_id: route.request().postDataJSON().request_id, sampled_at: 1792886400000,
      processing_pending: false, baseline_at: 1792800000000, alliance_baseline_at: baseline, alliances,
      players: [{ player: binding.player, username: 'My Commander', points: '500', rank: 1, ...(ownAlliance ? { alliance: alliances[80].alliance } : {}) }],
    } })
  })
  await page.goto('/u/andromeda/high-scores')
  await page.getByRole('table').getByRole('button', { name: 'My Commander profile details' }).click()
  await expect(page.getByRole('dialog').getByRole('link', { name: /Alliance Étoile/ })).toHaveAttribute('href', `/alliances/${binding.universe}/${alliances[80].alliance.id}`)
  await page.getByRole('button', { name: 'Alliances', exact: true }).click()
  const table = page.getByRole('table', { name: 'Universe alliance total-score rankings' })
  await expect(page.getByRole('button', { name: 'Alliances', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(table.getByRole('row')).toHaveCount(51)
  await expect(table.getByRole('row').nth(1)).toContainText('18,446,744,073')
  await expect(table.getByRole('row').nth(1)).toContainText('9,223,372,036')
  await expect(table.getByLabel('New to the rankings since the baseline')).toHaveText('New')
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await diagnosticScreenshot(page, { path: `test-results/alliance-high-scores-${width}.png` })
  }
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(table).toBeFocused()
  await expect(table.getByRole('row').nth(1)).toContainText('Alliance 50')
  await page.getByRole('searchbox', { name: 'Find an alliance' }).fill('tag80')
  await expect(table.getByRole('row')).toHaveCount(2)
  await expect(table.locator('tr[data-self]')).toContainText('Étoile')
  await expect(table.locator('tr[data-self]').getByLabel('Up 2 places since the baseline')).toHaveText('+2')
  await page.getByRole('button', { name: 'Around my alliance' }).click()
  await expect(table.getByRole('row').nth(1)).toContainText('Alliance 55')
  await expect(table.locator('tr[data-self]').getByRole('link')).toBeFocused()
  await expect(page.getByRole('searchbox')).toHaveValue('')
  expect(requests).toBe(1)
  baseline = null
  ownAlliance = false
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Around my alliance' })).toBeDisabled()
  await expect(table.locator('tr[data-self]')).toHaveCount(0)
  await expect(table.getByLabel('Rank change unavailable: no snapshot from yesterday')).toHaveCount(50)
  await page.getByRole('searchbox').fill('no such alliance')
  await expect(page.getByText('No alliances match “no such alliance”.')).toBeVisible()
  await page.getByRole('button', { name: 'Clear search' }).click()
  await expect(page.getByRole('searchbox')).toBeFocused()
  await page.getByRole('button', { name: 'Players', exact: true }).click()
  await expect(page.getByRole('table', { name: 'Universe total-score rankings' })).toContainText('My Commander')
  await expect(page.getByRole('searchbox', { name: 'Find a player' })).toHaveValue('')
})

test('legacy rankings responses retain players and show an honest empty alliance view', async ({ page }) => {
  await installGameFixture(page, { protocol: 4 })
  await page.route('**/rankings', route => route.fulfill({ json: { binding, request_id: route.request().postDataJSON().request_id, sampled_at: 1000, processing_pending: false, players: [] } }))
  await page.goto('/u/andromeda/high-scores')
  await page.getByRole('button', { name: 'Alliances', exact: true }).click()
  await expect(page.getByText('No alliances are ranked yet.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Around my alliance' })).toBeDisabled()
  await expect(page.getByText('Rank changes unavailable:', { exact: false })).toBeVisible()
})
