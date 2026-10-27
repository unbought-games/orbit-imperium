import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect } from './fixtures/test'
import { installGameFixture, binding, body, id } from './fixtures/game'
import observation from '../../../contracts/fixtures/espionage-expanded.json' with { type: 'json' }
import type { components } from '../src/contracts'
const technicalData = {
  facts: [], bonuses: [], storage_capacities: null,
  combat: { attack_ticks: '5000000', shield_ticks: '1000000', hull_ticks: '40000000', rapid_fire_against: [], rapid_fire_from: [] },
}
const catalog: components['schemas']['CatalogEntry3'][] = [
  { key: { kind: 'Ship', id: 'Bomber' }, body_kinds: ['Planet'], requirements: [], enabled: true, mobile: true, ship_statistics: { propulsion: null, combat: { ...technicalData.combat, attack_ticks: '100000000', shield_ticks: '50000000', hull_ticks: '750000000' } } },
  { key: { kind: 'Ship', id: 'LightFighter' }, body_kinds: ['Planet'], requirements: [], enabled: true, mobile: true, technical_data: technicalData },
  { key: { kind: 'Defense', id: 'RocketLauncher' }, body_kinds: ['Planet'], requirements: [], enabled: true, mobile: false, technical_data: technicalData },
  { key: { kind: 'Defense', id: 'HeavyLaser' }, body_kinds: ['Planet'], requirements: [], enabled: true, mobile: false, technical_data: { ...technicalData, combat: { ...technicalData.combat, attack_ticks: '25000000', shield_ticks: '10000000', hull_ticks: '80000000' } } },
  { key: { kind: 'Defense', id: 'LargeShieldDome' }, body_kinds: ['Planet'], requirements: [], enabled: true, mobile: false, technical_data: { ...technicalData, combat: { ...technicalData.combat, attack_ticks: '100000', shield_ticks: '1000000000', hull_ticks: '1000000000' } } },
  { key: { kind: 'Defense', id: 'PlasmaTurret' }, body_kinds: ['Planet'], requirements: [], enabled: true, mobile: false, technical_data: { ...technicalData, combat: { ...technicalData.combat, attack_ticks: '300000000', shield_ticks: '30000000', hull_ticks: '1000000000' } } },
]
for (const hidden of [false, true]) test(`prefills report simulation with ${hidden ? 'unknown' : 'observed'} intelligence`, async ({ page }) => {
  await installGameFixture(page, { protocol: 4, catalog, bodies: [{ ...body, inventories: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: '3' }] }, { ...body, id: id(6), inventories: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: '99' }] }], extraCapabilities: ['Reports'] })
  const header = { id: id(63), kind: 'Espionage', observed_at: 6000, read: true, hidden: false }
  await page.route('**/api/**/reports/**', async route => {
    const context = route.request().postDataJSON()
    await route.fulfill({ json: { protocol: 4, binding, request_id: context.request_id, viewer_revision: '1', sampled_at: Date.now(), as_of_ms: Date.now(), data: { header, payload: { ...observation, resources: hidden ? { visibility: 'Unknown' } : observation.resources, defenses: hidden ? { visibility: 'Unknown' } : { visibility: 'Known', value: [{ item: { kind: 'Defense', id: 'HeavyLaser' }, count: '7' }, { item: { kind: 'Defense', id: 'LargeShieldDome' }, count: '1' }, { item: { kind: 'Defense', id: 'PlasmaTurret' }, count: '3' }] }, fleet: hidden ? { visibility: 'Unknown' } : { visibility: 'Known', value: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: '12' }] }, research: hidden ? { visibility: 'Unknown' } : observation.research } } } })
  })
  let submitted: any = null
  let attempts = 0
  await page.route('**/combat-simulation', async route => {
    submitted = route.request().postDataJSON()
    if (hidden && attempts++ === 0) { await route.fulfill({ status: 503, json: { code: 'Unavailable' } }); return }
    await route.fulfill({ json: { ...submitted.context, profile_hash: 'a'.repeat(64), loot_rules_enabled: true, samples: Array.from({ length: 10 }, () => ({ outcome: 'AttackerVictory', rounds: 1, surviving_cargo_capacity: '400000000', estimated_loot: hidden ? null : { metal: '133000000', crystal: '133000000', deuterium: '134000000' }, attacker: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: 8 }, { item: { kind: 'Ship', id: 'Bomber' }, count: 0 }], defender: [] })) } })
  })
  await page.goto(`/u/andromeda/b/${body.id}/reports/${header.id}`)
  const trigger = page.getByRole('button', { name: 'Simulate combat', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Combat simulation' })
  await expect(dialog).toContainText('historical snapshot')
  await expect(dialog).toContainText('Light Fighter (3 available)')
  await expect(dialog).toContainText('hypothetical quantities are allowed')
  await expect(dialog.getByLabel('Defender Light Fighter', { exact: true })).toHaveValue(hidden ? '' : '12')
  await expect(dialog.getByLabel('Defender Rocket Launcher', { exact: true })).toHaveValue(hidden ? '' : '0')
  await expect(dialog.getByLabel('Defender Heavy Laser', { exact: true })).toHaveValue(hidden ? '' : '7')
  await expect(dialog.getByLabel('Defender Large Shield Dome', { exact: true })).toHaveValue(hidden ? '' : '1')
  await expect(dialog.getByLabel('Defender Plasma Turret', { exact: true })).toHaveValue(hidden ? '' : '3')
  await expect(dialog.getByLabel('Attacker Plasma Turret', { exact: true })).toHaveCount(0)
  await expect(dialog.getByLabel('Attacker Large Shield Dome', { exact: true })).toHaveCount(0)
  await expect(dialog.getByLabel('Attacker Heavy Laser', { exact: true })).toHaveCount(0)
  await dialog.getByLabel('Attacker Light Fighter', { exact: true }).fill('10')
  await dialog.getByLabel('Attacker Bomber', { exact: true }).fill('2')
  await expect(dialog.getByLabel('Defender Bomber', { exact: true })).toHaveValue(hidden ? '' : '0')
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
  const results = dialog.getByRole('region', { name: 'Simulation results' })
  await expect(results).toContainText('Light Fighter2 lost · 8 surviving')
  await expect(results).toContainText('Bomber2 lost · 0 surviving')
  await expect(results).toContainText('Surviving cargo capacity: 400 average')
  await expect(results).toContainText(hidden ? 'resources were not observed' : 'Estimated loot: 400 average')
  if (!hidden) {
    for (const name of ['Metal', 'Crystal', 'Deuterium']) await expect(results.getByRole('img', { name, exact: true }).first()).toBeVisible()
    expect(submitted.inputs.observed_resources).toEqual(observation.resources.value)
  } else expect(submitted.inputs.observed_resources).toBeUndefined()
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await results.scrollIntoViewIfNeeded()
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await diagnosticScreenshot(page, { path: `test-results/simulation-results-${hidden}-${width}.png`, fullPage: true })
  }
  expect(submitted.inputs.defender.units).toEqual(hidden ? [] : [{ item: { kind: 'Ship', id: 'LightFighter' }, count: 12 }, { item: { kind: 'Defense', id: 'HeavyLaser' }, count: 7 }, { item: { kind: 'Defense', id: 'LargeShieldDome' }, count: 1 }, { item: { kind: 'Defense', id: 'PlasmaTurret' }, count: 3 }])
  expect(submitted.inputs.attacker.units).toEqual([{ item: { kind: 'Ship', id: 'Bomber' }, count: 2 }, { item: { kind: 'Ship', id: 'LightFighter' }, count: 10 }])
  expect(Object.keys(submitted).sort()).toEqual(['context', 'inputs'])
  await dialog.getByLabel('Attacker Light Fighter', { exact: true }).fill('20')
  await expect(dialog.getByRole('region', { name: 'Simulation results' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
})
