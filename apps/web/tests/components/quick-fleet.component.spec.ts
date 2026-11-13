import { test, expect, type Page } from './fixture'

async function openHarvest(page: Page) {
  await page.getByRole('button', { name: 'Harvest', exact: true }).click()
  const surface = page.getByRole('dialog', {
    name: 'Harvest mission',
    exact: true,
  })
  await expect(surface).toBeVisible()
  return surface
}

test('closing mobile harvest cancels its real hook before a held quote completes', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mount('quick-fleet')
  await page.evaluate(() => window.quickFleet!.hold('FleetQuote'))
  const surface = await openHarvest(page)
  await surface.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(
    surface.getByRole('button', { name: 'Sending…', exact: true }),
  ).toBeDisabled()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window
            .quickFleet!.snapshot()
            .calls.filter((q) => q.type === 'FleetQuote').length,
      ),
    )
    .toBe(1)
  try {
    await page.keyboard.press('Escape')
    await expect(surface).not.toBeVisible()
  } finally {
    await page.evaluate(() => window.quickFleet!.release())
  }
  await openHarvest(page)
  expect(
    await page.evaluate(() => window.quickFleet!.snapshot().launches),
  ).toBe(0)
  await expect(
    surface.getByRole('button', { name: 'Send', exact: true }),
  ).toBeEnabled()
})

for (const blocked of ['ships', 'slots'] as const) {
  test(`mobile harvest derives ${blocked} blockers from the real coordinator`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mount('quick-fleet')
    await page.evaluate(async (blocked) => {
      const fixture = window.quickFleet!,
        { view } = fixture.snapshot()
      if (blocked === 'ships') view.bodies[0].inventories = []
      else view.missions.fleet_slots = '0'
      await fixture.configure({ view })
    }, blocked)
    const surface = await openHarvest(page)
    await expect(surface).toContainText(
      blocked === 'ships'
        ? 'No recyclers available on the selected planet.'
        : 'No fleet slots available. Wait for a fleet to return.',
    )
    await expect(
      surface.getByRole('textbox', { name: 'Recyclers', exact: true }),
    ).toBeDisabled()
    await expect(
      surface.getByRole('button', { name: 'Send', exact: true }),
    ).toBeDisabled()
    await expect(
      surface.getByRole('button', { name: 'Customize', exact: true }),
    ).toBeEnabled()
    expect(
      await page.evaluate(() => window.quickFleet!.snapshot().calls),
    ).toEqual([])
  })
}

test('mobile harvest caps its suggested count and validates native edits', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mount('quick-fleet')
  await page.evaluate(async () => {
    const fixture = window.quickFleet!,
      { view } = fixture.snapshot()
    view.bodies[0].inventories[0].count = '2'
    await fixture.configure({ view })
  })
  const surface = await openHarvest(page)
  const input = surface.getByRole('textbox', { name: 'Recyclers', exact: true })
  await expect(input).toHaveValue('2')
  await expect(surface).toContainText('2 available · 3 needed')
  for (const value of ['0', '', '1.5', '3']) {
    await input.fill(value)
    await expect(
      surface.getByRole('button', { name: 'Send', exact: true }),
    ).toBeDisabled()
  }
  await input.fill('1')
  await expect(
    surface.getByRole('button', { name: 'Send', exact: true }),
  ).toBeEnabled()
  await page.keyboard.press('Escape')
  await expect(surface).not.toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Harvest', exact: true }),
  ).toBeFocused()
})

test('mobile harvest exposes a quote failure without creating a departure', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mount('quick-fleet')
  await page.evaluate(() =>
    window.quickFleet!.configure({
      options: { quoteError: 'InsufficientResources' },
    }),
  )
  const surface = await openHarvest(page)
  await surface.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(surface.getByRole('alert')).toContainText('not enough resources')
  await expect(
    surface.getByRole('button', { name: 'Send', exact: true }),
  ).toBeEnabled()
  expect(
    await page.evaluate(() => window.quickFleet!.snapshot().launches),
  ).toBe(0)
})

test('spy without a stationed probe explains its disabled control', async ({
  page,
  mount,
}) => {
  await mount('quick-fleet')
  await page.evaluate(async () => {
    const fixture = window.quickFleet!,
      { view } = fixture.snapshot()
    view.bodies[0].inventories = []
    await fixture.configure({ view })
  })
  const spy = page.getByRole('button', { name: 'Spy on Planet', exact: true })
  await expect(spy).toBeDisabled()
  await expect(spy).toHaveAttribute(
    'title',
    'No espionage probes available on the selected planet.',
  )
  await expect(page.getByRole('alert')).toHaveCount(0)
})
