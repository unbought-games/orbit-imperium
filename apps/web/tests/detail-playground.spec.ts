import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { body, id, refreshGame, shellFixture } from './fixtures/game'
import type { components } from '../src/contracts'
import { expect, test } from './fixtures/test'

const examples = [
  ['mine-zero', 'Metal Mine', 'Confirm upgrade'],
  ['mine-ready', 'Metal Mine', 'Confirm upgrade'],
  ['mine-energy', 'Metal Mine', 'Confirm upgrade'],
  ['mine-short', 'Metal Mine', 'Confirm upgrade'],
  ['mine-busy', 'Metal Mine', 'Confirm upgrade'],
  ['mine-active', 'Metal Mine', 'Cancel construction'],
  ['storage-full', 'Metal Storage', 'Confirm upgrade'],
  ['solar-ready', 'Solar Plant', 'Confirm upgrade'],
  ['facility-locked', 'Research Lab', 'Confirm upgrade'],
  ['research-ready', 'Combustion Drive', 'Confirm research'],
  ['research-active', 'Combustion Drive', 'Cancel research'],
  ['ship-ready', 'Small Cargo', 'Build'],
  ['defense-queued', 'Rocket Launcher', 'Build'],
] as const

for (const [scene, title, action] of examples) {
  test(`real detail preview ${scene} keeps its decision above the phone fold without game requests`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const api: string[] = [], errors: string[] = []
    page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) api.push(request.url()) })
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`/detail-playground?scene=${scene}`)
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Now', exact: true })).toHaveCount(0)
    await expect(page.getByText('Building', { exact: true })).toHaveCount(0)
    await expect(page.locator('article > header').getByText(/^(Ship|Defense|Research|Building)$/)).toHaveCount(0)
    const button = page.getByRole('button', { name: action, exact: true })
    await expect(button).toBeVisible()
    await expect(page.getByText(/Loading (building|technology) details/)).toHaveCount(0)
    if (!scene.endsWith('active')) await expect(page.getByRole('group', { name: 'Required resources', exact: true }).first()).toBeVisible()
    const box = (await button.boundingBox())!
    expect(box.y).toBeGreaterThan(98)
    expect(box.y + box.height).toBeLessThanOrEqual(844 - 76)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (scene === 'mine-zero') {
      await expect(page.getByLabel('Current level and benefit')).toHaveCount(0)
      const empty = page.getByText('No Metal Mine', { exact: true })
      const firstBuild = page.getByRole('heading', { name: 'First Build', exact: true })
      await expect(empty).toBeVisible()
      await expect(firstBuild).toBeVisible()
      await expect(page.getByText('Next · level 1', { exact: true })).toHaveCount(0)
      await expect(page.getByRole('progressbar')).toHaveCount(0)
      await expect(page.getByText('33 / h', { exact: true })).toBeVisible()
      await expect(page.getByText('Power to operate', { exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Solar Plant', exact: true })).toHaveCount(0)
      await expect(button).toHaveText('Build Metal Mine')
      const emptyBox = (await empty.boundingBox())!
      const firstBuildBox = (await firstBuild.boundingBox())!
      expect(firstBuildBox.y).toBeGreaterThan(emptyBox.y + emptyBox.height)
      expect(firstBuildBox.y - emptyBox.y).toBeLessThan(60)
      expect(box.y + box.height).toBeLessThan(500)
      const costs = page.getByRole('group', { name: 'Required resources', exact: true })
      await expect(costs.getByRole('button', { name: 'Metal details', exact: true })).toHaveText('60')
      await expect(costs.getByRole('button', { name: 'Crystal details', exact: true })).toHaveText('15')
      const colors = await costs.locator('svg').evaluateAll(icons => icons.map(icon => getComputedStyle(icon).color))
      expect(new Set(colors).size).toBe(2)
      await expect(page.getByText('Ready to build now', { exact: true })).toHaveCount(0)
      await expect(page.getByText('At saved settings, with enough energy.', { exact: true })).toHaveCount(0)
      await expect(button).toBeEnabled()
      await expect(page.getByRole('button', { name: /Demolish/ })).toHaveCount(0)
    }
    if (scene === 'mine-ready' || scene === 'mine-energy') {
      await expect(page.getByText('Energy balance', { exact: true })).toBeVisible()
      await expect(page.locator('dl > div').filter({ has: page.getByText('Energy balance', { exact: true }) }).getByRole('img', { name: 'energy', exact: true })).toBeVisible()
      await expect(page.getByText('Extra operating energy', { exact: true })).toHaveCount(0)
      await expect(page.getByText('Power to operate', { exact: true })).toHaveCount(0)
    }
    if (scene === 'mine-energy') {
      await expect(page.getByRole('button', { name: 'Energy balance details', exact: true })).toContainText('(92%)')
      await expect(page.getByText('Estimated production efficiency', { exact: true })).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'Solar Plant', exact: true })).toHaveCount(0)
      await expect(page.getByText('+10')).toBeVisible()
      await expect(page.getByText('-11', { exact: true })).toBeVisible()
      await expect(button).toBeEnabled()
    }
    if (scene === 'mine-short') {
      await expect(button).toBeDisabled()
      await expect(page.getByLabel('Action blockers')).toHaveCount(0)
      await expect(page.getByLabel('Missing resources')).toContainText(/Missing\s*183\s*55/)
      await expect(page.getByText(/Ready in ~/)).toBeVisible()
    }
    if (scene === 'mine-busy') {
      await expect(button).toBeDisabled()
      await expect(page.getByLabel('Action blockers')).toContainText(/Robotics Factory level 4 · finishes in/)
    }
    if (scene === 'storage-full') await expect(page.getByText('Storage full', { exact: true })).toBeVisible()
    await diagnosticScreenshot(page, { path: `test-results/decision-${scene}-mobile.png`, fullPage: true })
    expect(api).toEqual([])
    expect(errors).toEqual([])
  })
}

test('desktop uses large real artwork with an overlapping description and the same decision panel', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/detail-playground?scene=mine-ready')
  await expect(page.getByRole('button', { name: 'Confirm upgrade', exact: true })).toBeEnabled()
  const visual = page.getByRole('figure', { name: 'Metal Mine illustration' })
  const image = visual.locator('img')
  await expect(image).toBeVisible()
  const art = (await image.boundingBox())!, caption = (await visual.locator('figcaption').boundingBox())!
  expect(art.width).toBeGreaterThan(500)
  expect(art.height).toBeGreaterThan(450)
  expect(caption.y).toBeLessThan(art.y + art.height - 100)
  const panel = (await visual.boundingBox())!
  expect(panel.height).toBeLessThanOrEqual(502)
  expect(caption.y + caption.height).toBeLessThanOrEqual(art.y + art.height + 1)
  expect((await page.getByRole('button', { name: 'Confirm upgrade', exact: true }).boundingBox())!.x).toBeLessThan(art.x)
  await diagnosticScreenshot(page, { path: 'test-results/decision-desktop.png', fullPage: true })
})

for (const [scene, label] of [['mine-active', 'Cancel construction'], ['research-active', 'Cancel research']] as const) {
  test(`${label} requires confirmation and Escape preserves the work`, async ({ page }) => {
    await page.goto(`/detail-playground?scene=${scene}`)
    await page.getByRole('button', { name: label, exact: true }).click()
    const dialog = page.getByRole('dialog', { name: `${label}?`, exact: true })
    await expect(dialog).toBeVisible()
    await expect(page.getByText(/Preview only:/)).toHaveCount(0)
    await expect(dialog.getByRole('group', { name: 'Cancellation refund', exact: true }).getByRole('img')).toHaveCount(2)
    await expect(dialog).not.toContainText('0 deuterium')
    await expect(dialog.getByRole('button', { name: /^Keep / })).toBeFocused()
    await expect(dialog).toContainText('refund')
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('button', { name: label, exact: true })).toBeFocused()
    await expect(page.getByText(/Preview only:/)).toHaveCount(0)
    await page.getByRole('button', { name: label, exact: true }).click()
    await dialog.getByRole('button', { name: 'Confirm cancellation', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByText(`Preview only: ${scene === 'mine-active' ? 'CancelConstruction' : 'CancelResearch'}`)).toBeVisible()
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0)
  })
}

test('demolition presents target level, payment and duration before sending', async ({ page }) => {
  await page.goto('/detail-playground?scene=mine-ready')
  await page.getByRole('button', { name: 'Demolish Metal Mine', exact: true }).click()
  const review = page.getByRole('button', { name: 'Confirm demolition', exact: true })
  await expect(review).toBeEnabled()
  await review.click()
  const dialog = page.getByRole('dialog', { name: 'Tear down Metal Mine?', exact: true })
  await expect(dialog).toContainText('from level 4 to 3')
  await expect(dialog.getByRole('img', { name: 'Metal', exact: true }).locator('..')).toContainText('303')
  await expect(dialog.getByRole('img', { name: 'Crystal', exact: true }).locator('..')).toContainText('75')
  await expect(dialog.getByRole('img', { name: 'Deuterium', exact: true }).locator('..')).toContainText('0')
  await expect(dialog).toContainText('18s')
  await dialog.getByRole('button', { name: 'Keep this level' }).click()
  await expect(page.getByText(/Preview only:/)).toHaveCount(0)
  await review.click()
  await dialog.getByRole('button', { name: 'Confirm demolition', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Tearing down Metal Mine to level 3', exact: true })).toBeVisible()
})

test('playground compares responsive real components and filters categories', async ({ page }) => {
  await page.goto('/detail-playground')
  await expect(page.getByRole('heading', { name: 'Every decision. One language.' })).toBeVisible()
  await expect(page.locator('iframe')).toHaveCount(26)
  await page.getByRole('button', { name: 'Research', exact: true }).click()
  await expect(page.locator('iframe')).toHaveCount(4)
  await page.getByLabel('Preview viewport').selectOption('Mobile')
  await expect(page.locator('iframe')).toHaveCount(2)
})


test('a completed operation removes its open cancellation confirmation without sending', async ({ page }) => {
  await page.clock.install()
  const planet = structuredClone(body)
  const constructions: components['schemas']['Construction3'][] = [{ id: id(20), body: planet.id, building: 'MetalMine', target_level: 2, paid: { metal: '60000000', crystal: '15000000', deuterium: '0' }, due_at: Date.now() + 2000 }]
  const sent: unknown[] = []
  await shellFixture(page, { bodies: [planet], constructions, catalog: [{ key: { kind: 'Building', id: 'MetalMine' }, enabled: true, mobile: false, body_kinds: ['Planet'], requirements: [] }] })
  page.on('request', request => { if (request.url().endsWith('/commands')) sent.push(request.postDataJSON()) })
  await page.goto(`/u/andromeda/b/${planet.id}/resources/metal-mine`)
  await page.clock.runFor(3000)
  await expect(page.getByRole('button', { name: 'Completion time details', exact: true })).toContainText('Checking completion…')
  await expect(page.getByText('Level 1', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel construction', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Cancel construction?', exact: true })
  await expect(dialog).toContainText('Metal Mine to level 2')
  constructions.length = 0
  planet.levels.MetalMine = 2
  await refreshGame(page)
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Active construction', exact: true })).toHaveCount(0)
  expect(sent).toEqual([])
})


test('icon-only decision costs keep named accessible triggers and spending details', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/detail-playground?scene=mine-zero')
  const cost = page.getByRole('group', { name: 'Required resources', exact: true })
  await cost.getByRole('button', { name: 'Metal details', exact: true }).click()
  const details = page.getByRole('dialog', { name: 'Metal', exact: true })
  await expect(details).toContainText('Required 60')
  await expect(details).toContainText('Available 500')
  await expect(details).toContainText('After spending 440')
  await page.keyboard.press('Escape')
  await expect(details).toHaveCount(0)
})


for (const [scene, label] of [['mine-energy', 'Energy balance'], ['mine-zero', 'Operating power']] as const) {
  test(`${label} keeps energy explanation and recommendations behind the value`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/detail-playground?scene=${scene}`)
    const trigger = page.getByRole('button', { name: `${label} details`, exact: true })
    const dialog = page.getByRole('dialog', { name: label, exact: true })
    await expect(dialog).toHaveCount(0)
    await trigger.click()
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Available power divided by total demand')
    await expect(dialog).toContainText('Additional demand:')
    await expect(dialog.getByRole('link', { name: 'Solar Plant', exact: true })).toBeVisible()
    if (scene === 'mine-energy') await expect(dialog).toContainText('Production efficiency: 92%')
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await trigger.focus()
    await page.keyboard.press('Enter')
    await expect(dialog).toBeVisible()
  })
}


test('missing resources and availability share the cost row with details on demand', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/detail-playground?scene=mine-short')
  const summary = page.getByLabel('Missing resources')
  const row = page.locator('dl > div').filter({ has: summary })
  await expect(row).toContainText('Upgrade cost')
  await expect(row.getByRole('group', { name: 'Required resources' })).toBeVisible()
  await expect(row).toContainText('Ready in ~')
  await expect(page.getByLabel('Action blockers')).toHaveCount(0)
  await page.getByRole('button', { name: 'Resource availability details', exact: true }).click()
  const details = page.getByRole('dialog', { name: 'Resource availability', exact: true })
  await expect(details).toContainText('metal: 183 more needed')
  await expect(details).toContainText('crystal: 55 more needed')
  await expect(details).toContainText('if nothing else is spent')
  await page.keyboard.press('Escape')
  await expect(details).toHaveCount(0)
})


for (const [scene, region, initial, next, elapsed] of [
  ['mine-active', 'Active construction', '1m', 'Level 5', 75000],
  ['research-active', 'Active research', '2m', 'Level 3', 165000],
] as const) {
  test(`${scene} shows a real countdown, icon refund, and completes in the sandbox`, async ({ page }) => {
    await page.clock.install()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/detail-playground?scene=${scene}`)
    const active = page.getByRole('region', { name: region, exact: true })
    const timer = active.getByRole('button', { name: 'Completion time details', exact: true })
    await expect(timer).toContainText(initial)
    await expect(active).not.toContainText('Awaiting confirmation')
    const refund = active.getByRole('group', { name: 'Cancellation refund', exact: true })
    await expect(refund.getByRole('img')).toHaveCount(2)
    await expect(refund).not.toContainText('0 deuterium')
    const before = await timer.innerText()
    await page.clock.runFor(5000)
    await expect(timer).not.toHaveText(before)
    // The ticking check above exercises intermediate updates. Completion only
    // needs the next tick after the deadline, not every intervening 250ms tick.
    await page.clock.fastForward(elapsed - 5000)
    await expect(active).toHaveCount(0)
    await expect(page.getByText(next, { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: scene === 'mine-active' ? 'Next · level 6' : 'Next · level 4', exact: true })).toBeVisible()
  })
}


test('prerequisites and dependent items link to real details inside the isolated preview', async ({ page }) => {
  const api: string[] = []
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) api.push(request.url()) })
  await page.goto('/detail-playground?scene=facility-locked')
  const prerequisite = page.getByLabel('Action blockers').getByRole('link', { name: 'Robotics Factory', exact: true })
  await expect(prerequisite).toHaveAttribute('href', /\/facilities\/robotics-factory$/)
  await prerequisite.click()
  await expect(page.getByRole('heading', { name: 'Robotics Factory', exact: true })).toBeVisible()
  await expect(page.getByLabel('Action blockers')).toHaveCount(0)
  await page.getByRole('link', { name: /^Back to / }).click()
  await expect(page.getByRole('heading', { name: 'Research Lab', exact: true })).toBeVisible()
  await page.goto('/detail-playground?scene=research-ready')
  await expect(page.getByText('Unlock progress:', { exact: false })).toHaveCount(0)
  const required = page.locator('dl > div').filter({ has: page.getByText('Required for', { exact: true }) })
  const probe = required.getByRole('link', { name: 'Espionage Probe', exact: true })
  await expect(probe).toHaveAttribute('href', /\/shipyard\/espionage-probe$/)
  await probe.click()
  await expect(page.getByRole('heading', { name: 'Espionage Probe', exact: true })).toBeVisible()
  await page.getByRole('link', { name: /^Back to / }).click()
  await expect(page.getByRole('heading', { name: 'Combustion Drive', exact: true })).toBeVisible()
  expect(api).toEqual([])
  await expect(page.getByText(/Preview only:/)).toHaveCount(0)
})


for (const width of [320, 390, 1440]) {
  for (const [scene, inputLabel] of [['ship-ready', 'Shipyard quantity'], ['defense-queued', 'Defenses quantity']] as const) {
    test(`${scene} puts quantity left of its action below the decision at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto(`/detail-playground?scene=${scene}`)
      const input = page.getByRole('textbox', { name: inputLabel, exact: true })
      const button = page.getByRole('button', { name: 'Build', exact: true })
      await expect(input).toHaveValue('1')
      const field = (await input.boundingBox())!, action = (await button.boundingBox())!
      const costs = (await page.getByRole('group', { name: 'Required resources', exact: true }).first().boundingBox())!
      expect(field.x + field.width).toBeLessThan(action.x)
      expect(Math.abs(field.width - action.width)).toBeLessThan(1)
      expect(Math.abs(field.y - action.y)).toBeLessThan(1)
      expect(Math.abs(field.height - action.height)).toBeLessThan(1)
      expect(field.y).toBeGreaterThan(costs.y + costs.height)
      await expect(page.locator('article > header')).not.toContainText(/Ship|Defense|Research|Building/)
      await input.fill('123456')
      await expect(input).toHaveValue('123456')
      await expect(button).toContainText('Order 123456')
      const itemName = scene === 'ship-ready' ? 'Small Cargo' : 'Rocket Launcher'
      await expect.poll(async () => (await button.innerText()).replace(/\s+/g, ' ').trim()).toBe(width < 768 ? 'Order 123456' : `Order 123456 ${itemName}`)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await diagnosticScreenshot(page, { path: `test-results/order-controls-${scene}-${width}.png`, fullPage: true })
    })
  }
}


test.describe('scheduled completion dates', () => {
  test.use({ timezoneId: 'UTC', locale: 'en-US' })
  for (const kind of ['construction', 'research'] as const) {
    test(`${kind} finish details include the day and year across midnight`, async ({ page }) => {
      await page.clock.install({ time: new Date('2026-12-31T12:00:00Z') })
      const dueAt = Date.parse('2027-01-02T18:00:00Z')
      const paid = { metal: '60000000', crystal: '15000000', deuterium: '0' }
      await shellFixture(page, {
        constructions: kind === 'construction' ? [{ id: id(20), body: body.id, building: 'MetalMine', target_level: 2, due_at: dueAt, paid }] : [],
        researchOperation: kind === 'research' ? { id: id(21), host: body.id, research: 'EnergyTechnology', source_level: 1, target_level: 2, paid, started_at: Date.now(), due_at: dueAt, labs: [], effective_lab: '1', can_cancel: true } : null,
        catalog: [
          { key: { kind: 'Building', id: 'MetalMine' }, enabled: true, mobile: false, body_kinds: ['Planet'], requirements: [] },
          { key: { kind: 'Research', id: 'EnergyTechnology' }, enabled: true, mobile: false, body_kinds: ['Planet'], requirements: [] },
        ],
      })
      await page.goto(`/u/andromeda/b/${body.id}/${kind === 'construction' ? 'resources/metal-mine' : 'research/energy-technology'}`)
      await page.getByRole('button', { name: 'Completion time details', exact: true }).click()
      const details = page.getByRole('dialog', { name: 'Completion time', exact: true })
      await expect(details).toContainText('Jan 2, 2027')
      await expect(details).toContainText('6:00 PM')
      await expect(details.locator('time')).toHaveAttribute('datetime', '2027-01-02T18:00:00.000Z')
    })
  }
})
