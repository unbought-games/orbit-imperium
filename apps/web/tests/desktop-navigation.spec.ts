import { expect, test } from './fixtures/test'
import { body, binding, id, playerProfilesFixture, shellFixture, refreshGame } from './fixtures/game'
import { selectBody } from './fixtures/body-selector'
import { signOut } from './fixtures/navigation'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'

for (const [width, height, textScale] of [[1024, 600, 1], [1440, 900, 1], [1440, 700, 2], [2560, 1100, 1]]) {
  test(`desktop navigation preserves context, scrolling and alerts at ${width}x${height}, ${textScale * 100}% text`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    let unread = false
    let revision = 1
    const bodies = Array.from({ length: 9 }, (_, index) => ({
      ...body,
      id: index === 0 ? body.id : id(index + 20),
      name: index === 0 ? 'Homeworld' : `Colony with a long name ${index}`,
      coordinates: { galaxy: 1, system: 371, position: index + 1 },
    }))
    const purchases = await shellFixture(page, {
      protocol: 4,
      bodies,
      extraCapabilities: ['Reports'],
      missions: { fleets: [], incoming: [], fleet_slots: '8', score_value_micro: '0' },
      hasUnreadReports: () => unread,
      viewerRevision: () => String(revision),
    })
    await page.addStyleTag({ content: `html { font-size: ${textScale * 100}% }` })
    const sidebar = page.getByRole('complementary', { name: 'Game navigation' })
    const main = page.getByRole('navigation', { name: 'Main navigation', exact: true })
    const develop = page.getByRole('navigation', { name: 'Develop navigation', exact: true })
    await expect(main).toHaveCount(1)
    await expect(sidebar).toBeVisible()
    await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeHidden()
    await expect(sidebar.getByText('Andromeda')).toHaveCount(0)
    await expect(sidebar.getByText('Resource settings', { exact: true })).toHaveCount(0)
    await expect(develop.getByRole('link')).toHaveText(['Resources', 'Facilities', 'Research', 'Shipyard', 'Defense'])
    const brand = sidebar.getByRole('link', { name: 'ORBIT IMPERIUM', exact: true })
    await expect(brand).toBeVisible()
    const bounds = (await sidebar.boundingBox())!
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.y).toBe(0)
    expect(bounds.height).toBe(height)
    const world = page.getByRole('group', { name: 'Planet and resources' })
    expect((await world.boundingBox())!.x).toBeGreaterThanOrEqual(bounds.x + bounds.width)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await main.getByRole('link', { name: 'Develop', exact: true }).click()
    await expect(page.locator('main h1')).toHaveText('Resources')
    await develop.getByRole('link', { name: 'Research', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('main h1')).toHaveText('Research')
    await expect(page.locator('main h1')).toBeFocused()
    await expect(develop.getByRole('link', { name: 'Research', exact: true })).toHaveAttribute('aria-current', 'page')
    await selectBody(page, bodies[8].id)
    await expect(page).toHaveURL(new RegExp(`/b/${bodies[8].id}/research$`))
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`/b/${body.id}/research$`))
    await page.reload()
    await page.addStyleTag({ content: `html { font-size: ${textScale * 100}% }` })
    await expect(develop.getByRole('link', { name: 'Research', exact: true })).toHaveAttribute('aria-current', 'page')
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    expect((await sidebar.boundingBox())!.y).toBe(0)
    expect((await world.boundingBox())!.y).toBe(0)
    const settings = sidebar.getByRole('link', { name: 'Settings', exact: true })
    await settings.scrollIntoViewIfNeeded()
    await expect(settings).toBeInViewport({ ratio: 1 })
    await settings.focus()
    await expect(settings).toBeFocused()
    unread = true
    revision++
    await refreshGame(page)
    const reports = sidebar.getByRole('link', { name: 'Reports — unread reports', exact: true })
    await reports.scrollIntoViewIfNeeded()
    await expect(reports.getByLabel('Unread reports', { exact: true })).toBeVisible()
    const badge = (await reports.getByLabel('Unread reports', { exact: true }).boundingBox())!
    const row = (await reports.boundingBox())!
    expect(badge.x + badge.width).toBeLessThanOrEqual(row.x + row.width)
    await reports.click()
    await expect(page.locator('main h1')).toHaveText('Reports')
    unread = false
    revision++
    await refreshGame(page)
    await expect(sidebar.getByRole('link', { name: 'Reports', exact: true }).getByLabel('Unread reports')).toHaveCount(0)
    expect(purchases()).toBe(0)
    await diagnosticScreenshot(page, { path: `test-results/desktop-navigation/reports-${width}x${height}-${textScale}.png` })
  })
}

test('sidebar account identity wraps without moving sign out outside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 600 })
  await shellFixture(page)
  await playerProfilesFixture(page, () => [{ player: binding.player, username: 'CommanderWithAnExceptionallyLongName', supporter_tier: 2 }])
  await page.reload()
  const sidebar = page.getByRole('complementary', { name: 'Game navigation' })
  const username = sidebar.getByLabel('Username', { exact: true })
  await expect(username).toContainText('CommanderWithAnExceptionallyLongName')
  await expect(username.getByRole('img', { name: /Supporter/ })).toBeVisible()
  const exit = sidebar.getByRole('button', { name: 'Sign out', exact: true })
  await exit.scrollIntoViewIfNeeded()
  await expect(exit).toBeInViewport({ ratio: 1 })
  const name = (await username.boundingBox())!, button = (await exit.boundingBox())!
  expect(name.x + name.width).toBeLessThanOrEqual(button.x)
  expect(await sidebar.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await signOut(page)
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
  await expect(sidebar).toHaveCount(0)
})

test('sidebar uses full touch targets on a large touch viewport', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 900 }, hasTouch: true })
  const page = await context.newPage()
  try {
    await shellFixture(page)
    const sidebar = page.getByRole('complementary', { name: 'Game navigation' })
    const small = await sidebar.locator('a, button').evaluateAll(nodes => nodes.filter(node => node.getBoundingClientRect().height < 44).map(node => node.textContent))
    expect(small).toEqual([])
    await sidebar.getByRole('link', { name: 'Facilities', exact: true }).tap()
    await expect(page.locator('main h1')).toHaveText('Facilities')
  } finally { await context.close() }
})

test('tablet brand keeps a full touch target without overlapping resource controls', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 768, height: 900 }, hasTouch: true })
  const page = await context.newPage()
  try {
    await shellFixture(page, {
      protocol: 4,
      hasUnreadReports: () => true,
      missions: { fleets: [], incoming: [], fleet_slots: '8', score_value_micro: '0' },
    })
    const brand = page.getByRole('link', { name: 'ORBIT IMPERIUM', exact: true })
    const bounds = (await brand.boundingBox())!
    expect(bounds.width).toBeGreaterThanOrEqual(44)
    expect(bounds.height).toBeGreaterThanOrEqual(44)
    const resources = page.getByLabel('Current resources')
    const controls = resources.getByRole('button').or(resources.getByRole('link'))
    const boxes = await controls.evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect()
      return { left: rect.left, right: rect.right }
    }))
    expect(boxes).toHaveLength(4)
    for (let i = 1; i < boxes.length; i++) expect(boxes[i].left).toBeGreaterThanOrEqual(boxes[i - 1].right)
    for (const control of await controls.all()) {
      expect(await control.evaluate(el => {
        const box = el.getBoundingClientRect()
        return [...el.querySelectorAll('svg, strong')].every(child => {
          const bounds = child.getBoundingClientRect()
          return bounds.left >= box.left && bounds.right <= box.right
        })
      })).toBe(true)
    }
    await expect(resources.getByRole('button')).toHaveCount(3)
    for (const button of await resources.getByRole('button').all()) {
      await button.tap()
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.keyboard.press('Escape')
    }
    await resources.getByRole('link', { name: 'Energy — resource settings', exact: true }).tap()
    await expect(page.locator('main h1')).toHaveText('Resource settings')
    await expect(page.getByRole('region', { name: 'Production controls' })).toBeVisible()
  } finally { await context.close() }
})
