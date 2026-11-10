import { expect, type Page } from './fixture'
import type { DispatchSceneControl } from './dispatch'
import type { DispatchFixtureOptions } from './dispatch-fixture'
import type { components } from '../../src/contracts'
import { originId } from './dispatch-fixture'
type State = {
  bodies: components['schemas']['BodyV3'][]
  capabilities: components['schemas']['CapabilityState4']['capability'][]
}
const inputs = new WeakMap<Page, State>()
export type Mount = (scenario: string) => Promise<void>
export async function snapshot(page: Page) {
  return page.evaluate(() => window.dispatchScene!.snapshot())
}
export async function configure(
  page: Page,
  options: Partial<DispatchFixtureOptions>,
) {
  await page.evaluate(
    (options) => window.dispatchScene!.configure({ options }),
    options,
  )
}
export async function setup(
  page: Page,
  mount: Mount,
  options: {
    variant?: 'historical' | 'unknown'
    colonyKind?: 'Planet' | 'Moon'
  } = {},
) {
  await mount(options.variant ? `dispatch-${options.variant}` : 'dispatch')
  await expect(page.locator('[data-dispatch-ready]')).toHaveAttribute(
    'data-origin',
    originId,
  )
  const { view } = await snapshot(page)
  const state = {
    bodies: view.bodies,
    capabilities: view.capabilities
      .filter(
        (c) => c.enabled && !['Transport', 'Galaxy'].includes(c.capability),
      )
      .map((c) => c.capability),
  }
  inputs.set(page, state)
  if (options.colonyKind) {
    state.bodies[1].kind = options.colonyKind
    await refreshDispatch(page)
  }
  if (!options.variant)
    await page.getByLabel('Small Cargo · 2 available').fill('1')
  else if (options.variant === 'unknown')
    await page.getByLabel('Small Cargo · 2 available').fill('1')
  return state
}
export async function refreshDispatch(page: Page) {
  const state = inputs.get(page)
  if (!state) throw Error('Dispatch scene was not mounted')
  await page.evaluate(
    (state) =>
      window.dispatchScene!.configure({
        view: {
          bodies: state.bodies,
          capabilities: (
            ['Transport', 'Galaxy', ...state.capabilities] as const
          ).map((capability) => ({
            capability,
            enabled: true,
            reason: 'Available',
          })),
        },
      }),
    state,
  )
}
export async function selectBody(page: Page, id: string) {
  await page.evaluate((id) => window.dispatchScene!.setOrigin(id), id)
  await expect(page.locator('[data-dispatch-ready]')).toHaveAttribute(
    'data-origin',
    id,
  )
}
export async function selectDestinationPlanet(page: Page, id: string) {
  const picker = page.getByRole('combobox', { name: 'Your planets and moons' })
  await picker.click()
  await page
    .getByRole('option')
    .and(page.locator(`[data-value="${id}"]`))
    .click()
  await expect(picker).toHaveAttribute('data-value', id)
  await expect(page.getByRole('listbox')).toHaveCount(0)
}
export const review = (page: Page) =>
  page.getByRole('button', { name: 'Review fleet', exact: true })
export const mission = (page: Page) =>
  page.getByRole('radio', { checked: true })
export async function counts(page: Page) {
  const { calls, launches } = await snapshot(page)
  return {
    launches,
    estimates: calls.filter((q) => q.type === 'FleetEstimate').length,
    quotes: calls.filter((q) => q.type === 'FleetQuote').length,
    resolves: calls.filter((q) => q.type === 'ResolveDestination').length,
  }
}
export async function lastQuote(page: Page) {
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toBeVisible()
  const quote = (await snapshot(page)).calls
    .filter((q) => q.type === 'FleetQuote')
    .at(-1)
  if (!quote) throw Error('No review quote reached the real coordinator port')
  return quote
}
export async function setSpeed(page: Page, percent: number) {
  const slider = page.getByRole('slider', { name: 'Speed', exact: true })
  await slider.press('Home')
  for (let value = 10; value < percent; value += 10)
    await slider.press('ArrowRight')
  await expect(slider).toHaveValue(String(percent))
}
export async function hold(
  page: Page,
  type: Parameters<DispatchSceneControl['hold']>[0],
) {
  await page.evaluate((type) => window.dispatchScene!.hold(type), type)
}
export async function release(page: Page) {
  await page.evaluate(() => window.dispatchScene!.release())
}
