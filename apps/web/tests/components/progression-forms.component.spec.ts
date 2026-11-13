import { test, expect } from './fixture'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'

// Mounts the existing isolated detail preview through the parent's shared harness.
// No application bootstrap or network fixture is involved.
for (const width of [390, 1280]) {
  test(`manufacturing keeps its form anchored through blank and invalid quantities at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 })

    for (const [scene, itemName, quantityLabel] of [
      ['ship-ready', 'Small Cargo', 'Shipyard quantity'],
      ['defense-queued', 'Rocket Launcher', 'Defenses quantity'],
    ]) {
      await page.goto(`/detail-playground?scene=${scene}`)
      const order = page.getByRole('region', { name: 'New order', exact: true })
      const input = order.getByRole('textbox', { name: quantityLabel })
      const build = order.getByRole('button', { name: 'Build', exact: true })
      await expect(build).toBeEnabled()
      await input.scrollIntoViewIfNeeded()
      await input.click()
      const position = async () =>
        input.evaluate((el) => {
          const rect = el.getBoundingClientRect()
          return { top: rect.top + window.scrollY, height: rect.height }
        })
      const before = await position()
      const labels = [
        'Production duration per unit',
        'Order',
        'Estimated start',
        'Order complete',
        'New order cost',
      ]
      await input.press('Backspace')
      await expect(input).toHaveValue('')
      for (const value of [
        '',
        '0',
        '-1',
        '1.5',
        'abc',
        '9223372036854775808',
      ]) {
        if (value) await input.fill(value)
        await expect(input).toBeFocused()
        await expect(order.locator('dt')).toHaveText(labels)
        await expect(build).toBeDisabled()
        await expect(
          order.getByRole('button', { name: 'Retry', exact: true }),
        ).toHaveCount(0)
        await expect(
          order
            .locator('dt')
            .filter({ hasText: /^Order$/ })
            .locator('..'),
        ).toHaveText('Order—')
        expect(await position()).toEqual(before)
        if (value === '')
          await diagnosticScreenshot(order, {
            path: `test-results/quantity-edit-${scene}-${width}.png`,
          })
      }
      await input.fill('2')
      await expect(build).toBeEnabled()
      await expect(order).toContainText(`2 × ${itemName}`)
      expect(await position()).toEqual(before)
      await input.fill('999999')
      await expect(build).toBeDisabled()
      await expect(page.getByLabel('Missing resources')).toBeVisible()
      expect(await position()).toEqual(before)
      await expect(page.getByText(/Preview only:/)).toHaveCount(0)
    }
  })
}

async function openOrder(
  page: import('./fixture').Page,
  item: 'SmallCargo' | 'RocketLauncher',
  options: Record<string, string> = {},
) {
  await page.goto(
    '/?' +
      new URLSearchParams({
        scenario: 'progression-detail',
        mode: 'order',
        item,
        ...options,
      }),
  )
  const pane = page.getByRole('region', { name: 'Progression quote' })
  await expect(pane).toBeVisible()
  return {
    pane,
    build: pane.getByRole('button', { name: 'Build', exact: true }),
    quantity: pane.getByRole('textbox', {
      name: item === 'SmallCargo' ? 'Shipyard quantity' : 'Defenses quantity',
    }),
    result: pane.getByRole('group', { name: 'Latest action result' }),
  }
}

test('quote delivery uses the latest quantity and Back closes the detail', async ({
  page,
}) => {
  const { pane, quantity, build } = await openOrder(page, 'SmallCargo', {
    loading: 'yes',
  })
  try {
    await expect
      .poll(() => page.evaluate(() => window.progressionScene.requests.length))
      .toBe(1)
    await quantity.fill('4')
    await expect(build).toBeDisabled()
  } finally {
    await page.evaluate(() => window.progressionScene.releaseOptions())
  }
  await expect(pane).toContainText('4 × Small Cargo')
  await expect(build).toBeEnabled()
  await pane.getByRole('link', { name: 'Back to Shipyard' }).click()
  await expect(pane).toHaveCount(0)
})

test('changed unit terms refresh the visible cost and require a new confirmation', async ({
  page,
}) => {
  const { pane, build } = await openOrder(page, 'SmallCargo', {
    metalCost: '60000000',
  })
  await expect(build).toBeEnabled()
  await page.evaluate(() => window.progressionScene.setMetalCost('70000000'))
  await build.click()
  await expect(
    pane.getByRole('button', { name: 'Metal details' }),
  ).toContainText('70')
  await expect(build).toBeEnabled()
  await expect(page.getByRole('alert')).toContainText(
    'Cost or build time changed',
  )
  expect(await page.evaluate(() => window.progressionScene.sent)).toEqual([])
})

for (const [item, name, width] of [
  ['RocketLauncher', 'Rocket Launcher', 320],
  ['SmallCargo', 'Small Cargo', 1440],
] as const) {
  test(`${name} keeps confirmed quantity separate from a subsequent draft`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const { pane, build, quantity, result } = await openOrder(page, item, {
      metalCost: '2000000000',
    })
    await quantity.fill('4')
    await expect(build).toBeEnabled()
    const before = await page.evaluate(
      () => window.progressionScene.requests.length,
    )
    await expect(pane).toContainText(`4 × ${name}`)
    expect(
      await page.evaluate(() => window.progressionScene.requests.length),
    ).toBe(before)
    await build.click()
    await expect(result).toContainText(`Last submitted: 4 × ${name}`)
    await expect(result).toContainText(
      'Order confirmed. Costs shown are for a new order.',
    )
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: `4 × ${name}: Order confirmed.` }),
    ).toHaveCount(1)
    await expect(quantity).toHaveValue('0')
    await expect(build).toBeDisabled()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await quantity.fill('4')
    await expect(pane.getByLabel('Missing resources')).toBeVisible()
    await expect(
      pane.getByText('New order cost', { exact: true }),
    ).toBeVisible()
    await expect(build).toBeDisabled()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await quantity.fill('1')
    await expect(result).toContainText(`Last submitted: 4 × ${name}`)
    await expect(build).toBeEnabled()
    await build.click()
    await expect(result).toContainText(`Last submitted: 1 × ${name}`)
    await expect(result).toContainText('Order confirmed.')
    await expect(quantity).toHaveValue('0')
    await expect(build).toBeDisabled()
    expect(
      await page.evaluate(() =>
        window.progressionScene.sent.map((e) => e.command),
      ),
    ).toEqual(
      ['4', '1'].map((quantity) => ({
        type: 'StartManufacture',
        body: '00000000-0000-4000-8000-000000000005',
        item: { kind: item === 'SmallCargo' ? 'Ship' : 'Defense', id: item },
        quantity,
        expected_terms_hash: 'b'.repeat(64),
      })),
    )
    await pane.getByRole('link', { name: /^Back to / }).click()
    await page.getByRole('link', { name: `Build ${name}`, exact: true }).click()
    await expect(result).toContainText(`Last submitted: 1 × ${name}`)
  })
}

for (const [outcome, width, text] of [
  ['Pending', 320, 'Order accepted; awaiting the game result.'],
  ['Rejected', 390, 'Action rejected: Insufficient Resources'],
  ['uncertain', 1440, 'We’re checking whether this order went through.'],
] as const) {
  test(`manufacturing renders ${outcome} without false success or duplicate submission`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    const { build, quantity, result } = await openOrder(page, 'RocketLauncher')
    await quantity.fill('4')
    await expect(build).toBeEnabled()
    const initialHeight = (await build.boundingBox())!.height
    await page.evaluate(() => window.progressionScene.holdOrder())
    try {
      await build.click()
      await expect(result).toContainText('Submitting action.')
      await expect(build).toHaveText('Confirming')
      expect((await build.boundingBox())!.height).toBe(initialHeight)
      await expect(result).not.toContainText('confirmed')
      await expect(quantity).toHaveValue('4')
      await expect(build).toBeDisabled()
      await expect
        .poll(() => page.evaluate(() => window.progressionScene.sent.length))
        .toBe(1)
      await build.evaluate((button) => (button as HTMLButtonElement).click())
    } finally {
      await page.evaluate(
        (status) => window.progressionScene.finishOrder(status),
        outcome,
      )
    }
    const feedback =
      outcome === 'Pending'
        ? result
        : page
            .getByTestId('game-error-banner')
            .getByRole('group', { name: 'Order status' })
    if (outcome !== 'Pending') await expect(result).toHaveCount(0)
    await expect(feedback).toContainText(text)
    await expect(feedback).not.toContainText('confirmed')
    await expect(quantity).toHaveValue('4')
    if (outcome === 'Rejected') await expect(build).toBeEnabled()
    else await expect(build).toBeDisabled()
    if (outcome === 'uncertain') {
      await feedback.getByRole('button', { name: 'Retry order' }).click()
      await expect(result).toContainText('Order confirmed.')
      await expect(quantity).toHaveValue('0')
    }
    expect(await page.evaluate(() => window.progressionScene.sent.length)).toBe(
      1,
    )
  })
}

test('manufacturing affordability crosses the income threshold while the detail stays mounted', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 1000 })
  const { pane, build, quantity } = await openOrder(page, 'SmallCargo', {
    metal: '17999000000',
    metalCost: '6000000000',
    income: 'yes',
  })
  await quantity.fill('3')
  const missing = pane.getByLabel('Missing resources')
  await expect(missing).toContainText(/Missing\s*1/)
  await expect(build).toBeDisabled()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.evaluate(() => window.progressionScene.tick(1000))
  await expect(build).toBeEnabled()
  await expect(missing).toHaveCount(0)
})

test('defense catalog shows only the confirmed inventory after returning from a batch order', async ({
  page,
}) => {
  await page.goto(
    '/?' +
      new URLSearchParams({
        scenario: 'progression-detail',
        item: 'IonCannon',
        mode: 'defense-content',
        list: 'yes',
      }),
  )
  const tile = page.getByRole('link', { name: 'Build Ion Cannon', exact: true })
  await expect(tile).toContainText('7')
  await tile.click()
  const pane = page.getByRole('region', { name: 'Progression quote' })
  await pane.getByLabel('Defenses quantity').fill('3')
  await pane.getByRole('button', { name: 'Build', exact: true }).click()
  await expect(
    pane.getByRole('group', { name: 'Latest action result' }),
  ).toContainText('Order confirmed.')
  await page.evaluate(async () => {
    const scene = window.progressionScene
    scene.view.bodies[0].inventories[0].count = '10'
    await scene.refresh()
  })
  await pane.getByRole('link', { name: 'Back to Defense' }).click()
  await expect(tile).toContainText('10')
  expect(await page.evaluate(() => window.progressionScene.sent.length)).toBe(1)
})
