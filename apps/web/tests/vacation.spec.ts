import { expect, test } from './fixtures/test'
import { captureVacation as capture } from './fixtures/vacation-capture'
import { binding, body, shellFixture } from './fixtures/game'
import type { components } from '../src/contracts'
import { productionFixture } from '../src/test-support/production'
import { withBootstrapResponse } from './fixtures/responses'
type Vacation = components['schemas']['VacationView4']
const minimum = 48 * 60 * 60 * 1000
// Preserve main's mobile journey; the desktop variant exhausted its repair.
for (const width of [390]) {
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
    await withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/settings/game`))
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
    await withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/resource-settings`))
    const sliders = page.getByRole('slider')
    await expect(sliders).toHaveCount(4)
    for (const slider of await sliders.all()) await expect(slider).toBeDisabled()
    await expect(page.getByText('These saved settings resume when you leave vacation mode.')).toBeVisible()
    await page.setViewportSize({ width, height: 1200 })
    await capture(page, page.getByRole('region', { name: 'Production controls' }), { path: `test-results/vacation-production-${width}x1200.png` })
    await page.setViewportSize({ width, height: 900 })
    await withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/settings/game`))
    now += minimum
    revision++
    await withBootstrapResponse(page, () => page.reload())
    await expect(leave).toBeEnabled()
    await capture(page, section, { path: `test-results/vacation-exit-ready-${width}x900.png` })
    await leave.click()
    await expect(section.getByText('Vacation mode ended. Your production settings have resumed.')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Vacation active' })).toHaveCount(0)
    expect(commands).toEqual(['EnterVacation', 'ExitVacation'])
    await capture(page, section, { path: `test-results/vacation-returned-${width}x900.png` })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
