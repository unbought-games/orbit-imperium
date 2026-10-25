import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect } from './fixtures/test'
import { installGameFixture, binding, body, id } from './fixtures/game'
import observation from '../../../contracts/fixtures/espionage-expanded.json' with { type: 'json' }
import type { components } from '../src/contracts'
const catalog: components['schemas']['CatalogEntry3'][] = [
  { key: { kind: 'Ship', id: 'LightFighter' }, body_kinds: ['Planet'], requirements: [], enabled: true, mobile: true },
  { key: { kind: 'Defense', id: 'RocketLauncher' }, body_kinds: ['Planet'], requirements: [], enabled: true, mobile: false },
]
for (const hidden of [false, true]) test(`prefills report simulation with ${hidden ? 'unknown' : 'observed'} intelligence`, async ({ page }) => {
  await installGameFixture(page, { protocol: 4, catalog, extraCapabilities: ['Reports'] })
  const header = { id: id(63), kind: 'Espionage', observed_at: 6000, read: true, hidden: false }
  await page.route('**/api/**/reports/**', async route => {
    const context = route.request().postDataJSON()
    await route.fulfill({ json: { protocol: 4, binding, request_id: context.request_id, viewer_revision: '1', sampled_at: Date.now(), as_of_ms: Date.now(), data: { header, payload: { ...observation, fleet: hidden ? { visibility: 'Unknown' } : { visibility: 'Known', value: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: '12' }] }, research: hidden ? { visibility: 'Unknown' } : observation.research } } } })
  })
  let submitted: any = null
  let attempts = 0
  await page.route('**/combat-simulation', async route => {
    submitted = route.request().postDataJSON()
    if (hidden && attempts++ === 0) { await route.fulfill({ status: 503, json: { code: 'Unavailable' } }); return }
    await route.fulfill({ json: { ...submitted.context, profile_hash: 'a'.repeat(64), samples: Array.from({ length: 10 }, () => ({ outcome: 'AttackerVictory', rounds: 1, attacker: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: 8 }], defender: [] })) } })
  })
  await page.goto(`/u/andromeda/b/${body.id}/reports/${header.id}`)
  const trigger = page.getByRole('button', { name: 'Simulate combat', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Combat simulation' })
  await expect(dialog).toContainText('historical snapshot')
  await expect(dialog.getByLabel('Defender Light Fighter', { exact: true })).toHaveValue(hidden ? '' : '12')
  await expect(dialog.getByLabel('Defender Rocket Launcher', { exact: true })).toHaveValue('0')
  await dialog.getByLabel('Attacker Light Fighter', { exact: true }).fill('10')
  if (hidden) {
    await expect(dialog.getByRole('button', { name: 'Run 10 battles' })).toBeDisabled()
    await dialog.getByRole('button', { name: 'Assume all unknown values are zero' }).click()
    await expect(dialog).toContainText('Player assumption · not observed')
  }
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await diagnosticScreenshot(page, { path: `test-results/simulation-${hidden}-${width}.png`, fullPage: true })
  }
  await dialog.getByRole('button', { name: 'Run 10 battles' }).click()
  if (hidden) {
    await expect(dialog.getByRole('alert')).toContainText('Simulation failed')
    await dialog.getByRole('button', { name: 'Run 10 battles' }).click()
  }
  await expect(dialog.getByRole('region', { name: 'Simulation results' })).toBeVisible()
  expect(submitted.inputs.defender.units).toEqual(hidden ? [] : [{ item: { kind: 'Ship', id: 'LightFighter' }, count: 12 }])
  expect(Object.keys(submitted).sort()).toEqual(['context', 'inputs'])
  await dialog.getByLabel('Attacker Light Fighter', { exact: true }).fill('20')
  await expect(dialog.getByRole('region', { name: 'Simulation results' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
})
