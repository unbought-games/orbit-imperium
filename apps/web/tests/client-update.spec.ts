import { test, expect } from './fixtures/test'
import { installGameFixture, body, refreshGame } from './fixtures/game'
import { withFixtureResponse } from './fixtures/responses'
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
    const originalUrl = page.url()
    deployed = true
    // This response deliberately announces an unreadable deployment; headers
    // and the rendered recovery state are the boundary, not its cancelled body.
    const mismatch = page.waitForResponse(response => response.url().endsWith('/overview'))
    await refreshGame(page)
    await page.clock.runFor(1)
    expect((await mismatch).status()).toBe(200)
    await expect(page.getByText('An update is available. Refreshing…', { exact: true })).toBeVisible()
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
    await expect(page.getByText('Connection lost. Reconnecting…', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Reload app', exact: true })).toBeVisible()
    await diagnosticScreenshot(page, { path: info.outputPath(`empire-incompatible-${viewport.width}x${viewport.height}.png`) })
  })
}
