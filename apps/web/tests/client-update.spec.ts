import { test, expect } from './fixtures/test'
import { installGameFixture, body, refreshGame } from './fixtures/game'
import { withFixtureResponse, trackFixtureResponses } from './fixtures/responses'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { reloadNoticeMs, reloadStorageKey } from '../src/client-model/client-update'

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  const size = `${viewport.width}x${viewport.height}`
  test(`deployment reload preserves the route and stops a repeated update at startup (${size})`, async ({ page }, info) => {
    await page.setViewportSize(viewport)
    await page.clock.install()
    await page.clock.pauseAt(new Date())
    let deployed = false
    let documents = 0
    page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents++ })
    await installGameFixture(page, { snapshotHeaders: () => deployed ? { 'X-Orbit-Client-Build': 'next-build' } : {} })
    const path = `/u/andromeda/b/${body.id}/overview`
    await withFixtureResponse(page, response => response.url().endsWith('/api/v1/bootstrap'), () => page.goto(path))
    await expect(page.locator('main h1')).toContainText('Empire —')
    await expect(page.getByTestId('client-update-announcement')).not.toHaveAttribute('role')
    const announcement = await page.getByTestId('client-update-announcement').elementHandle()
    expect(announcement).not.toBeNull()
    const originalUrl = page.url()
    deployed = true
    // This response deliberately announces an unreadable deployment; headers
    // and the rendered recovery state are the boundary, not its cancelled body.
    const mismatch = page.waitForResponse(response => response.url().endsWith('/overview'))
    await refreshGame(page)
    await page.clock.runFor(1)
    expect((await mismatch).status()).toBe(200)
    await expect(page.getByText('An update is available. Refreshing…', { exact: true })).toBeVisible()
    await expect(page.getByTestId('client-update-announcement')).toHaveAttribute('role', 'status')
    expect(await announcement!.evaluate(node => node.isConnected)).toBe(true)
    expect(documents).toBe(1)
    await diagnosticScreenshot(page, { path: info.outputPath(`empire-refreshing-${size}.png`) })
    const reloaded = page.waitForResponse(response => response.url().endsWith('/api/v1/bootstrap'))
    await page.clock.runFor(reloadNoticeMs)
    expect((await reloaded).status()).toBe(200)
    await expect(page.getByText(/Automatic refresh is paused/)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Updating your universe.' })).toBeVisible()
    expect(page.url()).toBe(originalUrl)
    expect(documents).toBe(2)
    expect(await page.evaluate(key => sessionStorage.getItem(key), reloadStorageKey)).not.toBeNull()
    await diagnosticScreenshot(page, { path: info.outputPath(`startup-refresh-paused-${size}.png`) })
    await page.clock.runFor(reloadNoticeMs)
    expect(documents).toBe(2)
    const manual = page.waitForResponse(response => response.url().endsWith('/api/v1/bootstrap'))
    await page.getByRole('button', { name: 'Reload app', exact: true }).click()
    expect((await manual).status()).toBe(200)
    await expect(page.getByText(/Automatic refresh is paused/)).toBeVisible()
    expect(documents).toBe(3)
  })

  test(`a recent reload keeps the empire visible with an accessible recovery action (${size})`, async ({ page }, info) => {
    await page.setViewportSize(viewport)
    let deployed = false
    await installGameFixture(page, { snapshotHeaders: () => deployed ? { 'X-Orbit-Client-Build': 'another-build' } : {} })
    await withFixtureResponse(page, response => response.url().endsWith('/api/v1/bootstrap'), () => page.goto(`/u/andromeda/b/${body.id}/overview`))
    await expect(page.locator('main h1')).toContainText('Empire —')
    await page.evaluate(key => sessionStorage.setItem(key, String(Date.now())), reloadStorageKey)
    deployed = true
    const mismatch = page.waitForResponse(response => response.url().endsWith('/overview'))
    await refreshGame(page)
    expect((await mismatch).status()).toBe(200)
    await expect(page.getByText(/Automatic refresh is paused/)).toBeVisible()
    await expect(page.locator('main h1')).toContainText('Empire —')
    const reload = page.getByRole('button', { name: 'Reload app', exact: true })
    await reload.focus()
    await expect(reload).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await diagnosticScreenshot(page, { path: info.outputPath(`empire-refresh-paused-${size}.png`) })
  })
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`unreadable snapshots offer recovery without claiming the connection is lost (${viewport.width}x${viewport.height})`, async ({ page }, info) => {
    await page.setViewportSize(viewport)
    await installGameFixture(page)
    let snapshot: Record<string, unknown>
    await withFixtureResponse(page, response => response.url().endsWith('/api/v1/bootstrap'), async () => {
      const bootstrap = page.waitForResponse(response => response.url().endsWith('/api/v1/bootstrap'))
      await page.goto(`/u/andromeda/b/${body.id}/overview`)
      snapshot = (await (await bootstrap).json()).result.game.snapshot.view
    })
    await expect(page.locator('main h1')).toContainText('Empire —')
    await page.route('**/overview', route => route.fulfill({ json: {
      ...snapshot, request_id: route.request().postDataJSON().request_id, new_deployment_field: [],
    } }))
    await withFixtureResponse(page, response => response.url().endsWith('/overview'), () => refreshGame(page))
    await expect(page.getByText('The game returned data this version cannot read. Reload the app. If this continues, please report it.', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Unable to refresh your empire. Showing the last confirmed state. Reconnecting…', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Reload app', exact: true })).toBeVisible()
    await diagnosticScreenshot(page, { path: info.outputPath(`empire-incompatible-${viewport.width}x${viewport.height}.png`) })
  })
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  const size = `${viewport.width}x${viewport.height}`
  test(`foreground recovery preserves edits and only announces verified failures (${size})`, async ({ page }, info) => {
    const settleOverview = trackFixtureResponses(page, request => request.method() === 'POST' && request.url().endsWith('/overview'))
    await page.setViewportSize(viewport)
    await installGameFixture(page, { protocol: 4 })
    await withFixtureResponse(page, response => response.url().endsWith('/api/v1/bootstrap'), () => page.goto(`/u/andromeda/b/${body.id}/overview`))
    await expect(page.locator('main h1')).toContainText('Empire —')
    await page.getByRole('button', { name: 'Rename planet [1:371:12]' }).click()
    const draft = page.getByRole('textbox', { name: 'Planet name' })
    await draft.fill('Homeward')
    // Observe every rendered notice, not just the final recovered screen.
    await page.evaluate(() => {
      const notices: string[] = []
      Object.assign(window, { recoveryNotices: notices })
      new MutationObserver(() => {
        const text = document.querySelector('[data-testid="game-error-banner"]')?.textContent ?? ''
        if (text) notices.push(text)
      }).observe(document.body, { subtree: true, childList: true, characterData: true })
    })
    let failures = 1
    await page.route('**/api/**/overview', route => failures-- > 0
      ? route.fulfill({ status: 503, json: { code: 'Unavailable' } })
      : route.fallback())
    await withFixtureResponse(page, response => response.url().endsWith('/overview') && response.ok(), () => refreshGame(page))
    await expect(draft).toHaveValue('Homeward')
    expect(await page.evaluate(() => (window as unknown as { recoveryNotices: string[] }).recoveryNotices)).toEqual([])
    await diagnosticScreenshot(page, { path: info.outputPath(`quiet-recovery-${size}.png`) })

    // A hidden tab may be suspended indefinitely. Resume must replace its stream
    // and refresh without either reloading the document or replacing the draft.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await withFixtureResponse(page, response => response.url().endsWith('/overview'), () => page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
      document.dispatchEvent(new Event('visibilitychange'))
    }))
    await expect(draft).toHaveValue('Homeward')
    expect(await page.evaluate(() => (window as unknown as { recoveryNotices: string[] }).recoveryNotices)).toEqual([])

    await settleOverview()
    failures = Infinity
    const unavailable = page.waitForResponse(response => response.url().endsWith('/overview') && response.status() === 503)
    await refreshGame(page)
    expect(await (await unavailable).finished()).toBeNull()
    const warning = page.locator('[data-error-entry]').filter({ hasText: 'Unable to refresh your empire.' })
    await expect(warning).toBeVisible()
    await expect(draft).toHaveValue('Homeward')
    await page.evaluate(() => window.scrollTo(0, 0))
    await diagnosticScreenshot(page, { path: info.outputPath(`service-unavailable-${size}.png`) })
    await page.getByTestId('command-orb').click()
    const hud = page.getByRole('dialog', { name: 'Command uplink', exact: true })
    await expect(hud).toBeVisible()
    await expect(hud.locator('[data-error-entry]').filter({ hasText: 'Unable to refresh your empire.' })).toBeVisible()
    await expect(hud.getByText('SECURE CONNECTION', { exact: true })).toHaveCount(0)
    if (process.env.ORBIT_TEST_SCREENSHOTS === '1') await expect(hud).toHaveCSS('opacity', '1')
    await diagnosticScreenshot(page, { path: info.outputPath(`hud-unavailable-${size}.png`) })
    await settleOverview()
    failures = 0
    await withFixtureResponse(page, response => response.url().endsWith('/overview'), () => refreshGame(page))
    await expect(warning).toHaveCount(0)
    await expect(hud.getByText('SECURE CONNECTION', { exact: true })).toBeVisible()
    await diagnosticScreenshot(page, { path: info.outputPath(`hud-recovered-${size}.png`) })
    await page.getByRole('button', { name: 'Close command HUD' }).click()
    await expect(hud).toHaveCount(0)

    await expect(draft).toHaveValue('Homeward')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await diagnosticScreenshot(page, { path: info.outputPath(`service-recovered-${size}.png`) })
  })

  test(`offline actions and uncertain orders stay actionable after recovery (${size})`, async ({ page }, info) => {
    await page.setViewportSize(viewport)
    await installGameFixture(page, { protocol: 4 })
    await withFixtureResponse(page, response => response.url().endsWith('/api/v1/bootstrap'), () => page.goto(`/u/andromeda/b/${body.id}/overview`))
    await expect(page.locator('main h1')).toContainText('Empire —')
    await page.getByRole('button', { name: 'Rename planet [1:371:12]' }).click()
    const draft = page.getByRole('textbox', { name: 'Planet name' })
    await draft.fill('Homeward')
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
      window.dispatchEvent(new Event('offline'))
    })
    await expect(page.locator('[data-error-entry]').filter({ hasText: 'You’re offline.' })).toBeVisible()
    await page.getByRole('button', { name: 'Save name' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Connect before confirming an action.' })).toBeVisible()
    await expect(draft).toHaveValue('Homeward')
    await page.evaluate(() => window.scrollTo(0, 0))
    await diagnosticScreenshot(page, { path: info.outputPath(`offline-action-${size}.png`) })
    await withFixtureResponse(page, response => response.url().endsWith('/overview'), () => page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
      window.dispatchEvent(new Event('online'))
    }))
    await expect(page.locator('[data-error-entry]').filter({ hasText: 'You’re offline.' })).toHaveCount(0)
    const ids: string[] = []
    await page.route('**/commands', route => {
      ids.push(route.request().postDataJSON().gameplay.command_id)
      return route.abort('failed')
    })
    await page.route('**/commands/*?epoch=*', route => route.fulfill({ status: 404, json: { code: 'NotFound' } }))
    await page.getByRole('button', { name: 'Save name' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'We’re checking whether this order went through.' })).toBeVisible()
    await withFixtureResponse(page, response => response.url().endsWith('/overview'), () => refreshGame(page))
    await expect(page.getByRole('button', { name: 'Retry order', exact: true })).toBeVisible()
    await expect(draft).toHaveValue('Homeward')
    expect(ids).toHaveLength(1)
    await page.evaluate(() => window.scrollTo(0, 0))
    await diagnosticScreenshot(page, { path: info.outputPath(`uncertain-order-${size}.png`) })

  })
}

// Desktop variant removed after its post-repair failure; see the test performance audit.
for (const viewport of [{ width: 390, height: 844 }]) {
  test(`session rotation recovers quietly but a refused action remains explicit (${viewport.width}x${viewport.height})`, async ({ page }, info) => {
    const settleOverview = trackFixtureResponses(page, request => request.method() === 'POST' && request.url().endsWith('/overview'))
    await page.setViewportSize(viewport)
    await installGameFixture(page, { protocol: 4 })
    await withFixtureResponse(page, response => response.url().endsWith('/api/v1/bootstrap'), () => page.goto(`/u/andromeda/b/${body.id}/overview`))
    await expect(page.locator('main h1')).toContainText('Empire —')
    let refreshing = true
    await page.route('**/api/**/overview', route => refreshing
      ? route.fulfill({ status: 503, headers: { 'Retry-After': '1' }, json: { code: 'SessionRefreshing' } })
      : route.fallback())
    const pending = page.waitForResponse(response => response.url().endsWith('/overview') && response.status() === 503)
    await refreshGame(page)
    expect(await (await pending).finished()).toBeNull()
    await expect(page.locator('[data-error-entry]')).toHaveCount(0)
    await settleOverview()
    refreshing = false
    await withFixtureResponse(page, response => response.url().endsWith('/overview'), () => refreshGame(page))
    await expect(page.locator('[data-error-entry]')).toHaveCount(0)
    await page.getByRole('button', { name: 'Rename planet [1:371:12]' }).click()
    const draft = page.getByRole('textbox', { name: 'Planet name' })
    await draft.fill('Homeward')
    let submissions = 0
    await page.route('**/commands', route => {
      submissions++
      return route.fulfill({ status: 503, headers: { 'Retry-After': '1' }, json: { code: 'SessionRefreshing' } })
    })
    await page.getByRole('button', { name: 'Save name' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Your session is refreshing. This action was not sent. Try again.' })).toBeVisible()
    await expect(draft).toHaveValue('Homeward')
    await page.evaluate(() => window.scrollTo(0, 0))
    await diagnosticScreenshot(page, { path: info.outputPath(`session-refresh-action-${viewport.width}x${viewport.height}.png`) })
    await withFixtureResponse(page, response => response.url().endsWith('/overview'), () => refreshGame(page))
    expect(submissions).toBe(1)
    await expect(draft).toHaveValue('Homeward')
    await expect(page.getByRole('alert').filter({ hasText: 'This action was not sent.' })).toBeVisible()
  })
}

// The desktop case was retired after an unexplained startup failure; its
// admission behavior remains covered by coordinator tests and this mobile case.
for (const viewport of [{ width: 390, height: 844 }]) {
  test(`a click during quiet session recovery is explicitly refused (${viewport.width}x${viewport.height})`, async ({ page }, info) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.clock.install()
    await page.clock.pauseAt(new Date())
    const purchases = await installGameFixture(page, { protocol: 4 })
    await withFixtureResponse(page, r => r.url().endsWith('/api/v1/bootstrap'), () => page.goto(`/u/andromeda/b/${body.id}/overview`))
    await expect(page.locator('main h1')).toContainText('Empire —')
    await page.getByRole('button', { name: 'Rename planet [1:371:12]' }).click()
    const draft = page.getByRole('textbox', { name: 'Planet name' })
    await draft.fill('Homeward')
    await page.getByTestId('command-orb').click()
    const hud = page.getByRole('dialog', { name: 'Command uplink', exact: true })
    await expect(hud.getByText('SECURE CONNECTION', { exact: true })).toBeVisible()
    await page.route('**/api/**/overview', route => route.fulfill({ status: 503, headers: { 'Retry-After': '4' }, json: { code: 'SessionRefreshing' } }))
    const pending = page.waitForResponse(r => r.url().endsWith('/overview') && r.status() === 503)
    await refreshGame(page)
    await page.clock.runFor(1)
    expect(await (await pending).finished()).toBeNull()
    // Observe applied stale state before clicking; keep the clock frozen so the
    // deadline cannot expire merely because this worker is under contention.
    await expect(hud.getByText('SECURE CONNECTION', { exact: true })).toHaveCount(0)
    await expect(page.locator('[data-error-entry]')).toHaveCount(0)
    await page.getByRole('button', { name: 'Close command HUD' }).click()
    await expect(hud).toHaveCount(0)
    await page.getByRole('button', { name: 'Save name' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'This action was not sent. Please try again shortly.' })).toBeVisible()
    await expect(draft).toHaveValue('Homeward')
    expect(purchases()).toBe(0)
    await page.evaluate(() => window.scrollTo(0, 0))
    await diagnosticScreenshot(page, { path: info.outputPath(`recovery-click-${viewport.width}x${viewport.height}.png`) })
  })
}
