import { expect, test } from './fixtures/test'
import type { Page, Locator } from '@playwright/test'
import { binding, body, shellFixture } from './fixtures/game'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import type { components } from '../src/contracts'
import { productionFixture } from '../src/test-support/production'
type Vacation = components['schemas']['VacationView4']
const minimum = 48 * 60 * 60 * 1000
async function capture(page: Page, target: Page | Locator, options: Parameters<Page['screenshot']>[0]) {
  // Dismiss transient notifications through their keyboard control; the persistent
  // hostile-fleet indicator stays visible and usable throughout vacation.
  const toasts = page.getByTestId('swipeable-toast')
  while (await toasts.count()) {
    const dismissed = await toasts.first().elementHandle()
    if (!dismissed) continue
    try {
      await toasts.first().getByRole('button').press('Escape')
      // A new notification can replace this one without reducing the total.
      await expect.poll(() => dismissed.evaluate((node) => node.isConnected)).toBe(false)
    } finally {
      await dismissed.dispose()
    }
  }
  const viewport = page.viewportSize()!
  if (target !== page) {
    if (viewport.height < 1200) await page.setViewportSize({ ...viewport, height: 1200 })
    await (target as Locator).evaluate((element) => window.scrollTo({ top: Math.max(0, element.getBoundingClientRect().top + window.scrollY - 80), behavior: 'instant' }))
    await diagnosticScreenshot(target, { ...options, path: options?.path?.toString().replace('x900.png', 'x1200.png') })
    if (viewport.height < 1200) await page.setViewportSize(viewport)
  } else await diagnosticScreenshot(target, options)
}

for (const width of [1280, 390]) {
  test(`vacation review, commitment, minimum and return at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    let now = Date.now()
    let revision = 1
    const planet = { ...body, energy: { ...body.energy } }
    const production = productionFixture(planet)
    let vacation: Vacation = { active: false, entered_at: null, earliest_exit_at: null, blockers: [] }
    await shellFixture(page, { protocol: 4, bodies: [planet], production: [production], vacation: () => vacation, sampledAt: () => now, viewerRevision: () => String(revision) })
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => { release = resolve })
    const commands: string[] = []
    await page.route('**/commands', async (route) => {
      const pair = route.request().postDataJSON()
      if (!pair.gameplay) return route.fallback()
      const type = pair.gameplay.command.action.type
      if (type !== 'EnterVacation' && type !== 'ExitVacation') return route.fallback()
      expect(pair.presence.command.action.body).toBeNull()
      commands.push(type)
      if (type === 'EnterVacation') {
        await gate
        vacation = { active: true, entered_at: now, earliest_exit_at: now + minimum, blockers: [] }
        production.gross_per_hour = { metal: '30000000', crystal: '15000000', deuterium: '0' }
        production.energy_supply = production.energy_demand = '0'
        planet.energy = { supply: '0', demand: '0', utilization: '1000000' }
      } else {
        vacation = { active: false, entered_at: null, earliest_exit_at: null, blockers: [] }
        planet.energy = { ...body.energy }
        Object.assign(production, productionFixture(planet))
      }
      revision++
      await route.fulfill({ json: { protocol: 4, binding, command_id: pair.gameplay.command_id, admitted_at: now, executed_at: now, status: 'Committed', result_ids: [], minimum_viewer_revision: String(revision) } })
    })
    await page.goto('/u/andromeda/settings')
    const section = page.getByRole('region', { name: 'Vacation mode', exact: true })
    await expect(section.getByRole('button', { name: 'Enter vacation mode', exact: true })).toBeEnabled()
    await capture(page, section, { path: `test-results/vacation-ready-${width}x900.png` })
    await section.getByRole('button', { name: 'Enter vacation mode', exact: true }).click()
    await expect(section.getByText('Ready for a break?')).toBeVisible()
    await expect(section.getByRole('button', { name: 'Keep playing' })).toBeFocused()
    await capture(page, section, { path: `test-results/vacation-review-${width}x900.png` })
    await section.getByRole('button', { name: 'Keep playing' }).click()
    expect(commands).toEqual([])
    await expect(section.getByRole('button', { name: 'Enter vacation mode', exact: true })).toBeFocused()
    await section.getByRole('button', { name: 'Enter vacation mode', exact: true }).click()
    await section.getByRole('button', { name: 'Confirm vacation mode' }).click()
    await expect.poll(() => commands.length).toBe(1)
    await expect(section.getByRole('button', { name: 'Entering vacation…' })).toBeDisabled()
    await capture(page, section, { path: `test-results/vacation-submitting-${width}x900.png` })
    release!()
    const leave = section.getByRole('button', { name: 'Leave vacation mode' })
    await expect(leave).toBeVisible()
    await expect(leave).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Threat detected. Open command HUD', exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Vacation active' })).toContainText('Already-launched attacks still arrive')
    await page.evaluate(() => window.scrollTo(0, 0))
    await capture(page, page, { path: `test-results/vacation-active-${width}x900.png` })
    await page.goto(`/u/andromeda/b/${body.id}/resource-settings`)
    const sliders = page.getByRole('slider')
    await expect(sliders).toHaveCount(4)
    for (const slider of await sliders.all()) await expect(slider).toBeDisabled()
    await expect(page.getByText('These saved settings resume when you leave vacation mode.')).toBeVisible()
    await page.setViewportSize({ width, height: 1200 })
    await capture(page, page.getByRole('region', { name: 'Production controls' }), { path: `test-results/vacation-production-${width}x1200.png` })
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/u/andromeda/settings')
    now += minimum
    revision++
    await page.reload()
    await expect(leave).toBeEnabled()
    await capture(page, section, { path: `test-results/vacation-exit-ready-${width}x900.png` })
    await leave.click()
    await expect(section.getByText('Vacation mode ended. Your production settings have resumed.')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Vacation active' })).toHaveCount(0)
    expect(commands).toEqual(['EnterVacation', 'ExitVacation'])
    await capture(page, section, { path: `test-results/vacation-returned-${width}x900.png` })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
  test(`vacation blockers and a changed server decision at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    let vacation: Vacation = { active: false, entered_at: null, earliest_exit_at: null, blockers: [
      { kind: 'Construction', body: body.id }, { kind: 'Manufacturing', body: body.id }, { kind: 'Research', body: null },
      { kind: 'Fleet', body: null }, { kind: 'Missile', body: null }, { kind: 'HostedFleet', body: body.id },
    ] }
    await shellFixture(page, { protocol: 4, vacation: () => vacation })
    await page.goto('/u/andromeda/settings')
    const section = page.getByRole('region', { name: 'Vacation mode', exact: true })
    await expect(section.getByRole('button', { name: 'Enter vacation mode', exact: true })).toBeDisabled()
    await expect(section.getByRole('listitem')).toHaveCount(6)
    await expect(section.getByRole('link', { name: 'Open research' })).toHaveAttribute('href', /research/)
    await page.setViewportSize({ width, height: 1200 })
    await capture(page, section, { path: `test-results/vacation-blocked-${width}x1200.png` })
    await page.setViewportSize({ width, height: 900 })
    vacation = { ...vacation, blockers: [] }
    await page.reload()
    await page.route('**/commands', async (route) => {
      const pair=route.request().postDataJSON()
      if (pair.gameplay?.command.action?.type !== 'EnterVacation') return route.fallback()
      await route.fulfill({ json: { protocol: 4, binding, command_id: pair.gameplay.command_id, admitted_at: Date.now(), executed_at: Date.now(), status: 'Rejected', code: 'VacationBlocked' } })
    })
    await section.getByRole('button', { name: 'Enter vacation mode', exact: true }).click()
    await section.getByRole('button', { name: 'Confirm vacation mode' }).click()
    await expect(section.getByRole('alert')).toContainText('Review your current fleets and unfinished work')
    await expect(page.getByRole('region', { name: 'Vacation active' })).toHaveCount(0)
    await capture(page, section, { path: `test-results/vacation-rejected-${width}x900.png` })
  })
}

for (const width of [1280, 390]) {
  test(`vacation clears confirmation on the same mounted Settings page at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    let now = Date.now()
    let revision = 1
    let vacation: Vacation = { active: false, entered_at: null, earliest_exit_at: null, blockers: [] }
    await shellFixture(page, { protocol: 4, vacation: () => vacation, sampledAt: () => now, viewerRevision: () => String(revision) })
    const submitted: string[] = []
    await page.route('**/commands', async (route) => {
      const pair = route.request().postDataJSON()
      const type = pair.gameplay?.command.action?.type
      if (type !== 'EnterVacation' && type !== 'ExitVacation') return route.fallback()
      submitted.push(type)
      vacation = type === 'EnterVacation'
        ? { active: true, entered_at: now, earliest_exit_at: now + minimum, blockers: [] }
        : { active: false, entered_at: null, earliest_exit_at: null, blockers: [] }
      revision++
      await route.fulfill({ json: { protocol: 4, binding, command_id: pair.gameplay.command_id, admitted_at: now, executed_at: now, status: 'Committed', result_ids: [], minimum_viewer_revision: String(revision) } })
    })
    await page.goto('/u/andromeda/settings')
    const section = page.getByRole('region', { name: 'Vacation mode', exact: true })
    await section.getByRole('button', { name: 'Enter vacation mode', exact: true }).click()
    await section.getByRole('button', { name: 'Confirm vacation mode' }).click()
    const leave = section.getByRole('button', { name: 'Leave vacation mode' })
    await expect(leave).toBeDisabled()
    now += minimum
    revision++
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(leave).toBeEnabled()
    await leave.click()
    await expect(section.getByText('Vacation mode ended. Your production settings have resumed.')).toBeVisible()
    await capture(page, section, { path: `test-results/vacation-same-mount-returned-${width}x1200.png` })
    await expect(section.getByRole('button', { name: 'Confirm vacation mode' })).toHaveCount(0)
    await expect(section.getByRole('button', { name: 'Enter vacation mode', exact: true })).toBeEnabled()
    expect(submitted).toEqual(['EnterVacation', 'ExitVacation'])
    await section.getByRole('button', { name: 'Enter vacation mode', exact: true }).click()
    await expect(section.getByRole('button', { name: 'Keep playing' })).toBeFocused()
    await expect(section.getByRole('button', { name: 'Confirm vacation mode' })).toBeEnabled()
    expect(submitted).toEqual(['EnterVacation', 'ExitVacation'])
  })
}

test('capture dismisses a replacement notification even when the count stays constant', async ({ page }) => {
  await page.setContent('<main><output aria-label="Dismissed notifications">0</output></main>')
  await page.evaluate(() => {
    let dismissed = 0
    function addToast(replace: boolean) {
      const toast = document.createElement('div')
      toast.dataset.testid = 'swipeable-toast'
      const button = document.createElement('button')
      button.textContent = replace ? 'First notification' : 'Replacement notification'
      button.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return
        toast.remove()
        document.querySelector('output')!.textContent = String(++dismissed)
        if (replace) addToast(false)
      })
      toast.append(button)
      document.querySelector('main')!.append(toast)
    }
    addToast(true)
  })
  await capture(page, page, { path: 'test-results/vacation-capture-helper.png' })
  await expect(page.getByTestId('swipeable-toast')).toHaveCount(0)
  await expect(page.getByLabel('Dismissed notifications')).toHaveText('2')
})
