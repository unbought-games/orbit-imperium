import { test, expect } from './fixtures/test'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { shellFixture, binding, id, body } from './fixtures/game'

test('High Scores keeps one snapshot through search and paging, finds me, and opens accessible details', async ({ page }) => {
  await shellFixture(page, { protocol: 4 })
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
  await expect(table.getByRole('row').nth(1).getByRole('cell').first()).toHaveText('1')
  await expect(table.getByRole('row').nth(2).getByRole('cell').first()).toHaveText('1')
  for (const width of [1440, 768, 390, 360, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await diagnosticScreenshot(page, { path: `test-results/high-scores-${width}.png` })
  }
  const leader = table.getByRole('button', { name: /A very long commander/ })
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
  await expect(table.getByRole('row').nth(1).getByRole('cell').first()).toHaveText('123')
  await page.getByRole('button', { name: 'Around me', exact: true }).click()
  await expect(page.getByRole('searchbox', { name: 'Find a player' })).toHaveValue('')
  await expect(table.locator('tr[data-self]')).toContainText('My Commander')
  await expect(table.getByRole('row').nth(1)).toContainText('Pilot 55')
  await expect(table.locator('tr[data-self]').getByRole('button')).toBeFocused()
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
})

test('High Scores has a retryable initial error and honest empty result', async ({ page }) => {
  await shellFixture(page, { protocol: 4 })
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
  await shellFixture(page, { protocol: 4 })
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
  const player = table.getByRole('button', { name: 'Selected Commander' })
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
  await shellFixture(page, { protocol: 4 })
  await page.route('**/rankings', route => route.fulfill({ json: { binding, request_id: route.request().postDataJSON().request_id, sampled_at: 1000, processing_pending: false, players: [{ player: binding.player, username: 'Selected Commander', points: '12', rank: 1 }] } }))
  await page.goto(`/u/andromeda/overview?body=${body.id}`)
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('link', { name: 'High Scores', exact: true }).click()
  await page.getByRole('table').getByRole('button', { name: 'Selected Commander' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Empire', exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await expect(page.getByRole('link', { name: 'High Scores', exact: true })).toBeVisible()
})
