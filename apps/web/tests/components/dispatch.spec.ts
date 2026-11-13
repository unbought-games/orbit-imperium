import { test, expect } from './fixture'
import { setDestination, coordinatePattern } from '../fixtures/coordinates'
import { originBody as body, id, player } from './dispatch-data'
import {
  setup,
  configure,
  snapshot,
  counts,
  refreshDispatch,
  selectBody,
  selectDestinationPlanet,
  review,
  setSpeed,
  lastQuote,
  hold,
  release,
} from './dispatch-driver'
const binding = { player }

test('Enter reviews the fleet, then sends once from the focused review panel', async ({
  page,
  mount,
}) => {
  await setup(page, mount)
  await page.getByLabel('Small Cargo · 2 available').press('Enter')
  const quote = page.getByRole('region', { name: 'Fleet quote' })
  await expect(quote).toBeFocused()
  expect((await counts(page)).launches).toBe(0)

  // Holding the review key or confirming IME text must not launch the fleet.
  await quote.dispatchEvent('keydown', { key: 'Enter', repeat: true })
  await quote.dispatchEvent('keydown', { key: 'Enter', isComposing: true })
  await page.keyboard.press('Shift+Enter')
  expect((await counts(page)).launches).toBe(0)
  await expect(quote).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('group', { name: 'Fleet dispatch result' }),
  ).toContainText('Fleet sent.')
  await expect(quote).toHaveCount(0)
  expect((await counts(page)).launches).toBe(1)
})

test('Enter respects a disabled review action and the send button retains native keyboard activation', async ({
  page,
  mount,
}) => {
  await setup(page, mount)
  await review(page).click()
  const quote = page.getByRole('region', { name: 'Fleet quote' })
  const send = quote.getByRole('button', { name: /^Transport to/ })
  await expect(quote).toBeFocused()
  const { view } = await snapshot(page)
  await page.evaluate(
    (missions) =>
      window.dispatchScene!.configure({
        view: { missions: { ...missions, fleet_slots: '0' } },
      }),
    view.missions,
  )
  await expect(send).toBeDisabled()
  await page.keyboard.press('Enter')
  await expect(quote).toBeVisible()
  expect((await counts(page)).launches).toBe(0)

  await page.evaluate(
    (missions) => window.dispatchScene!.configure({ view: { missions } }),
    view.missions,
  )
  await expect(send).toBeEnabled()
  await send.focus()
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('group', { name: 'Fleet dispatch result' }),
  ).toContainText('Fleet sent.')
  expect((await counts(page)).launches).toBe(1)
})

// These are actual Dispatch components/hooks with in-memory external ports, not application fixtures.
test.afterEach(async ({ page }) => {
  const mounted = await page.evaluate(() => !!window.dispatchScene)
  if (!mounted) return
  await release(page)
  expect((await snapshot(page)).unexpected).toEqual([])
})

test('destination focus glow is desktop only', async ({ page, mount }) => {
  await setup(page, mount)
  const input = page.getByLabel('Destination coordinates', { exact: true })
  const preview = page.getByLabel('Destination preview')
  for (const width of [767, 768, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await input.focus()
    await expect(input).toBeFocused()
    await expect(preview).toHaveCSS(
      'border-color',
      width < 768 ? 'rgba(138, 157, 157, 0.4)' : 'rgb(154, 207, 230)',
    )
    await expect(preview).toHaveCSS(
      'box-shadow',
      width < 768 ? 'none' : 'rgba(154, 207, 230, 0.157) 0px 0px 0px 2px',
    )
    await expect(input.locator('..')).toHaveCSS('outline-style', 'none')
  }
})

test('flight timing updates with speed and selected ships without opening review or sending fleets', async ({
  page,
  mount,
}) => {
  await page.clock.setFixedTime(new Date())
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page, mount)
  const timing = page.getByRole('region', { name: 'Flight timing' })
  const ship = page.getByLabel('Small Cargo · 2 available')
  await expect(timing.locator('dd').nth(0)).toHaveText('1m 40s')
  await ship.blur()
  await ship.click()
  const initialShipPosition = (await ship.boundingBox())!.y
  await ship.press('Backspace')
  await expect(ship).toHaveValue('')
  await expect(timing.locator('dd')).toHaveText(['—', '—', '—', '—'])
  expect((await ship.boundingBox())!.y).toBe(initialShipPosition)
  await expect(timing.locator('p')).toHaveText(
    'Select ships to see flight times.',
  )
  await ship.fill('1')
  await expect(timing.locator('dd').nth(0)).toHaveText('1m 40s')
  await expect(timing.locator('dd').nth(2)).toHaveText('3m 20s')
  expect((await ship.boundingBox())!.y).toBe(initialShipPosition)
  const firstReturn = Date.parse(
    (await timing.locator('time').getAttribute('datetime'))!,
  )
  const started = await page.evaluate(() => performance.now())
  await setSpeed(page, 50)
  await expect(timing.locator('dd').nth(0)).toHaveText('3m 20s')
  await expect(timing.locator('dd').nth(2)).toHaveText('6m 40s')
  const slowerReturn = Date.parse(
    (await timing.locator('time').getAttribute('datetime'))!,
  )
  // The game's monotonic clock keeps advancing while the estimate is fetched.
  const elapsed = (await page.evaluate(() => performance.now())) - started
  expect(slowerReturn - firstReturn).toBeGreaterThanOrEqual(200000)
  expect(slowerReturn - firstReturn).toBeLessThanOrEqual(200000 + elapsed + 500)
  const before = (await counts(page)).estimates
  await ship.fill('2')
  await expect
    .poll(async () => (await counts(page)).estimates)
    .toBeGreaterThan(before)
  const estimated = (await snapshot(page)).calls
    .filter((q) => q.type === 'FleetEstimate')
    .at(-1)!
  expect(estimated.intent.ships[0]?.count).toBe('2')
  expect(estimated.intent.speed_percent).toBe(50)
  await expect(timing.locator('dd').nth(0)).toHaveText('3m 20s')
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(0)
  expect((await counts(page)).launches).toBe(0)
})

for (const width of [320, 390, 1280]) {
  test(`dispatch shows deployment arrival with speed and fuel below cargo at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 950 })
    await setup(page, mount, {
      colonyKind: width === 390 ? 'Moon' : 'Planet',
    })
    const settings = page.getByRole('group', {
      name: 'Speed and flight estimates',
    })
    const speed = settings.getByRole('slider', { name: 'Speed', exact: true })
    const timing = settings.getByRole('region', { name: 'Flight timing' })
    const fuel = timing.locator('div').filter({
      has: page.locator('dt').getByText('Deuterium consumed', { exact: true }),
    })
    await expect(timing.locator('dt')).toHaveText([
      'To destination',
      'Back at',
      'Total flight',
      'Deuterium consumed',
    ])
    await expect(fuel.locator('dd')).toHaveText('1')
    await expect(
      fuel.getByRole('img', { name: 'Deuterium', exact: true }),
    ).toBeVisible()
    const cargoBox = (await page
      .getByRole('group', { name: 'Cargo', exact: true })
      .boundingBox())!
    const speedBox = (await speed.boundingBox())!
    const timingBox = (await timing.boundingBox())!
    expect(speedBox.y).toBeGreaterThanOrEqual(cargoBox.y + cargoBox.height)
    expect(timingBox.y).toBeGreaterThanOrEqual(speedBox.y + speedBox.height)
    expect((await review(page).boundingBox())!.y).toBeGreaterThanOrEqual(
      timingBox.y + timingBox.height,
    )
    await configure(page, { fuel: '250000000' })
    await setSpeed(page, 50)
    await expect(fuel.locator('dd')).toHaveText('250')
    await expect(timing.locator('dd').nth(0)).toHaveText('3m 20s')
    await page.getByRole('radio', { name: 'Deploy', exact: true }).check()
    await selectDestinationPlanet(page, id(6))
    await expect(timing.locator('dt')).toHaveText([
      'To destination',
      'Arrives at',
      'Deuterium consumed',
    ])
    await expect(timing.locator('time')).toBeVisible()
    await expect(timing.getByText('One-way', { exact: true })).toHaveCount(0)
    await expect(timing.locator('dd').first()).toHaveText('3m 20s')
    const arrival = Date.parse(
      (await timing.locator('time').getAttribute('datetime'))!,
    )
    expect(Number.isFinite(arrival)).toBe(true)
    await expect(fuel.locator('dd')).toHaveText('250')
    await page.getByLabel('Small Cargo · 2 available').fill('')
    await expect(timing.locator('dd')).toHaveText(['—', '—', '—'])
    await expect(timing.getByText('Back at', { exact: true })).toHaveCount(0)
    await expect(timing.locator('time')).toHaveCount(0)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    if (width === 1280) {
      await selectBody(page, id(6))
      await expect(timing.locator('time')).toHaveCount(0)
      await configure(page, { duration: 250000 })
      await selectDestinationPlanet(page, body.id)
      await page.getByLabel('Small Cargo · 2 available').fill('1')
      await expect(timing.locator('dd').first()).toHaveText('8m 20s')
      await expect(timing.locator('time')).toBeVisible()
      expect(
        Date.parse((await timing.locator('time').getAttribute('datetime'))!),
      ).toBeGreaterThan(arrival)
    }
    expect((await counts(page)).launches).toBe(0)
  })
}

test('max deuterium keeps other cargo and Add all evenly fills the remaining space', async ({
  page,
  mount,
}) => {
  await setup(page, mount)
  const metal = page.getByRole('textbox', { name: 'Metal', exact: true })
  const crystal = page.getByRole('textbox', { name: 'Crystal', exact: true })
  const deuterium = page.getByRole('textbox', {
    name: 'Deuterium',
    exact: true,
  })
  await metal.fill('100')
  await page.getByRole('button', { name: 'Max deuterium', exact: true }).click()
  const fuelReserved = BigInt(body.amounts.deuterium) / 1000000n - 1n
  await expect(deuterium).toHaveValue(String(fuelReserved))
  await expect(metal).toHaveValue('100')
  await expect(crystal).toHaveValue('0')
  await page.getByRole('button', { name: 'Add all', exact: true }).click()
  const remaining = 4999n - fuelReserved - 100n
  await expect(metal).toHaveValue(String(100n + (remaining + 1n) / 2n))
  await expect(crystal).toHaveValue(String(remaining / 2n))
  await expect(deuterium).toHaveValue(String(fuelReserved))
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(0)
  expect((await counts(page)).launches).toBe(0)
})

test('Add all leaves invalid cargo untouched and explains the problem', async ({
  page,
  mount,
}) => {
  await setup(page, mount)
  const metal = page.getByRole('textbox', { name: 'Metal', exact: true })
  await metal.fill('invalid')
  await page.getByRole('button', { name: 'Add all', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('whole nonnegative')
  await expect(metal).toHaveValue('invalid')
  await expect(
    page.getByRole('textbox', { name: 'Crystal', exact: true }),
  ).toHaveValue('0')
})

test('mission changes preserve the observed destination and coordinate edits never reuse another target', async ({
  page,
  mount,
}) => {
  await setup(page, mount)
  const preview = page.getByLabel('Destination preview')
  await expect(preview).toContainText('Ember Watch')
  for (const next of ['Attack', 'Espionage', 'Transport']) {
    await page.getByRole('radio', { name: next, exact: true }).check()
    await expect(preview).toContainText('Ember Watch')
  }
  await setDestination(page, { position: '3' })
  await expect(preview).toContainText('Empty position')
  await expect(preview).not.toContainText('Ember Watch')
  await setDestination(page, { position: '1' })
  await expect(preview).toContainText('Ember Watch')
  await setDestination(page, { system: '2' })
  await expect(preview).not.toContainText('Ember Watch')
  await expect(preview).toContainText('Other Planet')
})

test('cleared ship and cargo amounts display zero and submit as zero even before blur', async ({
  page,
  mount,
}) => {
  await setup(page, mount)
  const cargoFields = ['Metal', 'Crystal', 'Deuterium'].map((name) =>
    page.getByRole('textbox', { name, exact: true }),
  )
  await page.getByRole('button', { name: /^Show all ships/ }).click()
  const unusedShip = page.getByLabel('Light Fighter · 0 available')
  for (const field of [...cargoFields, unusedShip]) {
    await field.fill('')
    await field.blur()
    await expect(field).toHaveValue('0')
  }
  for (const field of [unusedShip, ...cargoFields]) {
    await field.fill('')
    // Enter submits the real form without first blurring the edited input.
    await field.press('Enter')
    const intent = (await lastQuote(page)).intent
    expect(intent.cargo).toEqual({ metal: '0', crystal: '0', deuterium: '0' })
    expect(intent.ships).toEqual([
      { owner: binding.player, ship_type: 'SmallCargo', count: '1' },
    ])
    await expect(
      page.getByRole('region', { name: 'Fleet quote' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Back to edit mission' }).click()
  }
})

test('pasting coordinates fills the unified field and preserves validation', async ({
  page,
  mount,
}) => {
  await setup(page, mount)
  const fields = ['Destination coordinates']
  for (const [index, field] of fields.entries()) {
    const system = String(370 + index)
    const input = page.getByLabel(field, { exact: true })
    const paste = async (text: string) =>
      input.evaluate((element, value) => {
        const clipboardData = new DataTransfer()
        clipboardData.setData('text/plain', value)
        return element.dispatchEvent(
          new ClipboardEvent('paste', {
            clipboardData,
            bubbles: true,
            cancelable: true,
          }),
        )
      }, text)
    expect(await paste(` \n [ 1 : ${system} : 10 ] \t`)).toBe(false)
    await expect(
      page.getByLabel('Destination coordinates', { exact: true }),
    ).toHaveValue(coordinatePattern('galaxy', '1'))
    await expect(
      page.getByLabel('Destination coordinates', { exact: true }),
    ).toHaveValue(coordinatePattern('system', system))
    await expect(
      page.getByLabel('Destination coordinates', { exact: true }),
    ).toHaveValue(coordinatePattern('position', '10'))
    await expect(review(page)).toBeEnabled()
    // Unrecognized text retains the browser's ordinary paste behavior.
    expect(await paste('12')).toBe(true)
    expect(await paste('1:2:3:4')).toBe(true)
    expect(await paste('[1:500:16]')).toBe(false)
    await expect(
      page.getByLabel('Destination coordinates', { exact: true }),
    ).toHaveAttribute('aria-invalid', 'true')
    await expect(
      page.getByLabel('Destination coordinates', { exact: true }),
    ).toHaveAttribute('aria-invalid', 'true')
    await expect(review(page)).toBeDisabled()
  }
})

test('coordinate errors appear beside entry before review, including pasted emoji and ranges', async ({
  page,
  mount,
}) => {
  const now = new Date('2026-10-25T12:00:00Z')
  await page.clock.install({ time: now })
  await page.clock.pauseAt(now)
  await setup(page, mount)
  const position = page.getByLabel('Destination coordinates', { exact: true })
  for (const value of [
    '🏎️',
    '1🏎️',
    '1.5',
    '1e1',
    '0',
    '-1',
    '16',
    '9007199254740993',
    '',
  ]) {
    await setDestination(page, { position: value })
    await expect(position).toHaveAttribute('aria-invalid', 'true')
    await expect(position).toHaveAccessibleDescription(
      /position number from 1 to 15/,
    )
    await expect(review(page)).toBeDisabled()
    // Invalid coordinates must not request timing even after its debounce fires.
    await page.clock.runFor(1000)
    expect((await counts(page)).resolves).toBe(0)
    expect((await counts(page)).quotes).toBe(0)
    expect((await counts(page)).estimates).toBe(0)
  }
  // Keep this edit invalid throughout; a temporary valid position can resolve.
  await setDestination(page, { position: '1', system: '500' })
  await expect(
    page.getByLabel('Destination coordinates', { exact: true }),
  ).toHaveAccessibleDescription(/Enter a system number from 1 to 499./)
  await setDestination(page, { galaxy: '2' })
  await expect(
    page.getByLabel('Destination coordinates', { exact: true }),
  ).toHaveAccessibleDescription(/Enter a galaxy number from 1 to 1./)
  await setDestination(page, { position: '🏎️' })
  await page.clock.runFor(1000)
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  }
  expect((await counts(page)).resolves).toBe(0)
  expect((await counts(page)).quotes).toBe(0)
  expect((await counts(page)).estimates).toBe(0)
  await setDestination(page, { galaxy: '1' })
  await setDestination(page, { system: '499' })
  await setDestination(page, { position: '15' })
  await expect(review(page)).toBeEnabled()
  await expect(position).toHaveAttribute('aria-invalid', 'false')
  await page.clock.runFor(1000)
  await expect.poll(async () => (await counts(page)).resolves).toBe(1)
  await expect.poll(async () => (await counts(page)).estimates).toBe(1)
  expect((await counts(page)).quotes).toBe(0)
})

test('own-planet attack is actionable, while transport to another owned planet and own-position harvest stay available', async ({
  page,
  mount,
}) => {
  const now = new Date('2026-10-26T12:00:00Z')
  await page.clock.install({ time: now })
  await page.clock.pauseAt(now)
  await setup(page, mount)
  await setDestination(page, { position: '2' })
  await page.getByRole('radio', { name: 'Attack', exact: true }).check()
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'You cannot attack your own planet' }),
  ).toContainText('use Transport')
  await expect(review(page)).toBeDisabled()
  // Advance beyond the timing debounce only after the invalid attack is selected.
  await page.clock.runFor(1000)
  expect((await counts(page)).quotes).toBe(0)
  expect((await counts(page)).estimates).toBe(0)
  await page.getByRole('radio', { name: 'Transport', exact: true }).check()
  await review(page).click()
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toBeVisible()
  await page.getByRole('button', { name: 'Back to edit mission' }).click()
  await page.getByRole('radio', { name: 'Harvest', exact: true }).check()
  await setDestination(page, { system: String(body.coordinates.system) })
  await setDestination(page, { position: String(body.coordinates.position) })
  await expect(review(page)).toBeEnabled()
  await review(page).click()
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toBeVisible()
})

for (const width of [320, 390, 1280]) {
  test(`dispatch keeps coordinate editing inside one compact field at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await setup(page, mount)
    const group = page.getByRole('group', {
      name: 'Mission and destination',
      exact: true,
    })
    await expect(
      page.getByRole('region', { name: 'Flight timing' }).locator('time'),
    ).toBeVisible()
    await expect(
      page
        .getByLabel('Destination preview')
        .getByText('Ember Watch', { exact: true }),
    ).toBeVisible()
    const coordinate = group.getByLabel('Destination coordinates', {
      exact: true,
    })
    await expect(coordinate).toHaveCount(1)
    const fieldBox = (await coordinate.boundingBox())!
    expect(fieldBox.height).toBe(36)
    expect(fieldBox.width).toBeGreaterThan(width < 400 ? 130 : 250)
    const selectors = await group
      .getByRole('group', { name: 'Mission', exact: true })
      .locator('label')
      .evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().height),
      )
    expect(selectors).toHaveLength(6)
    for (const height of selectors) {
      expect(height).toBeGreaterThanOrEqual(44)
      expect(height).toBeLessThanOrEqual(56)
    }
    const speed = page
      .getByRole('group', { name: 'Speed and flight estimates' })
      .getByRole('slider', { name: 'Speed', exact: true })
    expect((await speed.boundingBox())!.height).toBe(44)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width)
    const cargo = page.getByRole('group', { name: 'Cargo', exact: true })
    const cargoBoxes = await cargo
      .locator('input, button:not([aria-label])')
      .evaluateAll((elements) =>
        elements.map((element) => {
          const { x, y, width, height } = element.getBoundingClientRect()
          return { x, y, width, height }
        }),
      )
    expect(cargoBoxes).toHaveLength(4)
    const wideCargo = (await cargo.boundingBox())!.width >= 520
    for (const [i, box] of cargoBoxes.entries()) {
      expect(box.y).toBe(cargoBoxes[0].y + (wideCargo ? 0 : i * 52))
      expect(box.height).toBe(44)
    }
    const headerHeight = (await cargo
      .getByText('Cargo', { exact: true })
      .locator('..')
      .boundingBox())!.height
    expect(headerHeight).toBeLessThanOrEqual(wideCargo ? 23 : 70)
    expect(
      (await cargo.boundingBox())!.height - headerHeight,
    ).toBeLessThanOrEqual(wideCargo ? 52 : 208)
    const maxButtons = cargo.getByRole('button', { name: /^Max / })
    await expect(maxButtons).toHaveCount(3)
    for (let i = 0; i < 3; i++) {
      const button = (await maxButtons.nth(i).boundingBox())!
      const input = cargoBoxes[i]
      expect(button.x + button.width).toBe(input.x + input.width - 4)
      expect(button.y).toBe(input.y + 4)
      expect(button.height).toBe(36)
      expect(input.width - button.width - 36).toBeGreaterThan(60)
    }
    const colors = await cargo
      .locator('svg[data-resource]')
      .evaluateAll((icons) => icons.map((icon) => getComputedStyle(icon).color))
    expect(new Set(colors).size).toBe(3)

    await page.getByRole('radio', { name: 'Attack', exact: true }).check()
    await expect(
      page.getByText('Beginner protection can prevent attacks', {
        exact: false,
      }),
    ).toBeVisible()
    await expect(coordinate).toBeVisible()
  })
}

for (const kind of ['Attack', 'Deploy', 'Harvest', 'Colonize'] as const) {
  test(`review clearly identifies ${kind}, its route and conditional return`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width: 320, height: 1000 })
    await setup(page, mount)
    await configure(page, { duration: 1172000 })
    const requiredShip = {
      Espionage: 'Espionage Probe',
      Harvest: 'Recycler',
      Colonize: 'Colony Ship',
    }[kind as 'Espionage' | 'Harvest' | 'Colonize']
    if (requiredShip) {
      await page.getByLabel('Small Cargo · 2 available').fill('0')
      await page.getByLabel(`${requiredShip} · 1 available`).fill('1')
    }
    await page.getByRole('radio', { name: kind, exact: true }).check()
    if (kind === 'Deploy') await setDestination(page, { position: '2' })
    if (kind === 'Colonize') await setDestination(page, { position: '6' })
    if (['Attack', 'Transport', 'Espionage'].includes(kind))
      await expect(
        page
          .getByLabel('Destination preview')
          .getByText('Ember Watch', { exact: true }),
      ).toBeVisible()
    await review(page).click()
    const quote = page.getByRole('region', { name: 'Fleet quote' })
    await expect(quote).toBeFocused()
    const heading = quote.getByRole('heading', { level: 2 })
    expect(
      await heading.evaluate((element) => {
        const box = element.getBoundingClientRect()
        const hit = document.elementFromPoint(
          box.x + box.width / 2,
          box.y + box.height / 2,
        )
        return element === hit || element.contains(hit)
      }),
    ).toBe(true)
    await expect(heading).toHaveText(kind)
    await expect(
      quote.getByRole('button', { name: 'Back to edit mission' }),
    ).toHaveCount(0)
    await expect(quote).toContainText('Commander')
    await expect(quote).toContainText('19m 32s')
    await expect(quote).toContainText('Payload capacity 4,999 after fuel')
    await expect(
      quote.getByRole('button', { name: /^Fleet slots:/ }),
    ).toHaveCount(0)
    await expect(
      page.locator('main').getByRole('button', { name: /^Fleet slots:/ }),
    ).toHaveCount(1)
    await expect(page.getByText(/^Origin .*Fleet slots:/)).toHaveCount(0)
    const action = quote.getByRole('button', {
      name: /^(Attack with|Spy with|Harvest with|Colonize with|Transport to|Deploy to) /,
    })
    await expect(action).toBeEnabled()
    if (kind === 'Deploy') {
      await expect(quote).toContainText('No scheduled return')
      await expect(
        quote.getByRole('region', { name: 'Flight schedule' }).locator('time'),
      ).toHaveCount(1)
    } else {
      await expect(
        quote.getByRole('region', { name: 'Flight schedule' }).locator('time'),
      ).toHaveCount(2)
      const times = await quote
        .getByRole('region', { name: 'Flight schedule' })
        .locator('time')
        .evaluateAll((elements) =>
          elements.map((e) => Date.parse(e.getAttribute('datetime')!)),
        )
      expect(times[1] - times[0]).toBe(1172000)
    }
    if (kind === 'Colonize') {
      await expect(quote).toContainText('Empty position')
      await expect(quote).toContainText('Return if needed')
      await expect(quote).toContainText('no return leg')
    }
    if (kind === 'Harvest') {
      await expect(quote).toContainText('Debris field')
      await quote
        .getByRole('link', {
          name: 'View destination [1:1:1] in galaxy',
          exact: true,
        })
        .click({ button: 'right' })
      await expect(
        page.getByRole('menuitem', { name: 'View in Galaxy', exact: true }),
      ).toHaveAttribute('href', /target=debris/)
      await page.keyboard.press('Escape')
    }
    if (kind === 'Attack')
      await expect(quote).toContainText('Return if surviving')
    if (['Attack', 'Transport', 'Espionage'].includes(kind)) {
      await expect(quote).toContainText('Ember Watch')
      await expect(quote).toContainText('Stargazer')
    }
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 1000 })
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width)
    }
    // Keyboard editing preserves the draft and returns focus to review.
    await page
      .getByLabel('Dispatch header', { exact: true })
      .getByRole('button', { name: 'Back to edit mission' })
      .focus()
    await page.keyboard.press('Enter')
    await expect(review(page)).toBeFocused()
    await expect(page.getByLabel('Small Cargo · 2 available')).toHaveValue(
      requiredShip ? '0' : '1',
    )
    expect((await counts(page)).launches).toBe(0)
  })
}

test('review retains honest unknown identities and coordinate actions', async ({
  page,
  mount,
}) => {
  await setup(page, mount)
  await configure(page, { observationAvailable: false })
  await page.getByRole('radio', { name: 'Attack', exact: true }).check()
  await setDestination(page, { system: '2' })
  await review(page).click()
  const quote = page.getByRole('region', { name: 'Fleet quote' })
  await expect(quote).toContainText('Unknown planet')
  await expect(quote).not.toContainText('Ember Watch')
  const destination = quote.getByRole('link', {
    name: 'View destination [1:2:1] in galaxy',
    exact: true,
  })
  await destination.click({ button: 'right' })
  await expect(
    page.getByRole('menuitem', { name: 'Copy coordinates', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(destination).toBeFocused()
})

test('historical review keeps observation context visible without flight details', async ({
  page,
  mount,
}) => {
  await setup(page, mount, { variant: 'historical' })
  await review(page).click()
  const quote = page.getByRole('region', { name: 'Fleet quote' })
  const context = quote.getByText('Prepared from an observation at', {
    exact: false,
  })
  await expect(quote.locator('details')).toHaveCount(0)
  await expect(context).toBeVisible()
  await expect(context).toContainText('historical information')
})

for (const width of [320, 390, 1280]) {
  test(`dispatch review keeps each ship and count on its own row at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await setup(page, mount)
    await page.getByLabel('Recycler · 1 available').fill('1')
    await page.getByLabel('Colony Ship · 1 available').fill('1')
    await review(page).click()
    const quote = page.getByRole('region', { name: 'Fleet quote' })
    const ships = quote.getByRole('list', { name: 'Ship composition' })
    await expect(ships.getByRole('listitem')).toHaveText([
      'Recycler 1',
      'Colony Ship 1',
      'Small Cargo 1',
    ])
    const rows = await ships.getByRole('listitem').evaluateAll((elements) =>
      elements.map((element) => {
        const [name, count] = Array.from(element.children).map((child) =>
          child.getBoundingClientRect(),
        )
        return {
          nameTop: name.top,
          countTop: count.top,
          bottom: element.getBoundingClientRect().bottom,
          top: element.getBoundingClientRect().top,
        }
      }),
    )
    for (const [index, row] of rows.entries()) {
      expect(row.nameTop).toBe(row.countTop)
      if (index > 0)
        expect(row.top).toBeGreaterThanOrEqual(rows[index - 1].bottom)
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)

    await page
      .getByRole('button', { name: 'Back to edit mission', exact: true })
      .click()
    await expect(review(page)).toBeFocused()
  })
}

for (const width of [320, 390, 1440]) {
  test(`destination picker and coordinates converge on one preview at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await setup(page, mount)
    const picker = page.getByRole('combobox', {
      name: 'Your planets and moons',
    })
    const preview = page.getByLabel('Destination preview')
    const input = page.getByLabel('Destination coordinates', { exact: true })
    await picker.click()
    await expect(
      page
        .getByRole('listbox', { name: 'Your planets and moons' })
        .getByRole('option'),
    ).toHaveText(['Haven ColonyPlanet · [1:1:2]'])
    await picker.press('Escape')
    await selectDestinationPlanet(page, id(6))
    await expect(input).toHaveValue('1:1:2')
    await expect(preview).toContainText('Haven Colony')
    await expect(preview).toContainText('Planet · Your colony')
    await expect(preview.locator('img')).toHaveAttribute('src', /planet-02-/)
    await expect(preview).toHaveCount(1)
    expect((await preview.boundingBox())!.height).toBeLessThanOrEqual(120)
    await expect(
      preview.getByLabel('Destination coordinates', { exact: true }),
    ).toHaveCount(1)
    await expect(page.getByLabel('Destination type')).toHaveCount(0)

    const picked = await preview.textContent()
    await input.fill('1:1:1')
    await expect(picker).not.toHaveAttribute('data-value')
    await expect(preview).toContainText('Ember Watch')
    await expect(preview).toContainText('Stargazer')
    await input.fill('1:1:2')
    await expect(picker).toHaveAttribute('data-value', id(6))
    expect(await preview.textContent()).toBe(picked)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.getByRole('radio', { name: 'Deploy', exact: true }).check()
    await expect(picker).toHaveAttribute('data-value', id(6))
    await review(page).click()
    await expect(
      page.getByRole('region', { name: 'Fleet quote' }),
    ).toContainText('Haven Colony')
    await page.getByRole('button', { name: 'Back to edit mission' }).click()
    // Mission chooses debris automatically; the planet picker explicitly returns to a planet.
    await page.getByRole('radio', { name: 'Harvest', exact: true }).check()
    await expect(preview).toContainText('Debris field')
    await page.getByRole('radio', { name: 'Transport', exact: true }).check()
    await selectDestinationPlanet(page, id(6))
    await expect(preview).toContainText('Haven Colony')
    await input.fill('1:')
    await expect(preview).toContainText('Complete your destination')
    await expect(preview.locator('img')).toHaveCount(0)
    await expect(picker).not.toHaveAttribute('data-value')
    await input.fill('')
    await expect(preview).toContainText('Where are we heading?')
    await input.fill('1:1:999')
    await expect(preview).toContainText('Complete your destination')
    await expect(preview.getByText('[1:1:999]')).toHaveCount(0)
  })
}

test('destination picker includes a same-coordinate moon and excludes the origin', async ({
  page,
  mount,
}) => {
  const state = await setup(page, mount)
  state.bodies = [
    { ...structuredClone(body), name: 'Home' },
    { ...structuredClone(body), id: id(90), kind: 'Moon', name: 'Home moon' },
  ]
  await refreshDispatch(page)
  await page.getByRole('combobox', { name: 'Your planets and moons' }).click()
  await page.getByRole('option', { name: /Home moon/ }).click()
  await expect(page.getByLabel('Destination preview')).toContainText(
    'Moon · Your moon',
  )
  await expect(
    page.getByLabel('Destination coordinates', { exact: true }),
  ).toBeEnabled()
})

test('planet renames, removal and origin changes update the picker and preview from live empire data', async ({
  page,
  mount,
}) => {
  const state = await setup(page, mount)
  const home = { ...structuredClone(body), name: 'Home' }
  const colony = {
    ...structuredClone(body),
    id: id(6),
    name: 'Colony',
    coordinates: { galaxy: 1, system: 1, position: 2 },
  }
  const bodies = [home, colony]
  state.bodies = bodies
  await refreshDispatch(page)
  const picker = page.getByRole('combobox', { name: 'Your planets and moons' })
  const preview = page.getByLabel('Destination preview')
  await selectDestinationPlanet(page, colony.id)
  await expect(preview).toContainText('Colony')
  colony.name = 'Aurora Anchorage 🪐'
  await refreshDispatch(page)
  await expect(preview).toContainText(colony.name)
  await expect(picker).toContainText(colony.name)
  await selectBody(page, colony.id)
  await picker.click()
  await expect(
    page
      .getByRole('listbox', { name: 'Your planets and moons' })
      .getByRole('option'),
  ).toHaveText(['HomePlanet · [1:371:12]'])
  await picker.press('Escape')
  await selectDestinationPlanet(page, home.id)
  await expect(preview).toContainText('Home')
  await selectBody(page, home.id)
  await selectDestinationPlanet(page, colony.id)
  bodies.pop()
  await refreshDispatch(page)
  await expect(picker).toBeDisabled()
  await expect(preview).not.toContainText(colony.name)
  await expect(
    page.getByLabel('Destination coordinates', { exact: true }),
  ).toHaveValue('1:1:2')
})

test('unified destination supports keyboard planet selection, dismissal and coordinate advancement', async ({
  page,
  mount,
}) => {
  await setup(page, mount)
  const picker = page.getByRole('combobox', { name: 'Your planets and moons' })
  const input = page.getByLabel('Destination coordinates', { exact: true })
  await picker.focus()
  await picker.press('ArrowDown')
  await expect(
    page.getByRole('listbox', { name: 'Your planets and moons' }),
  ).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(input).toHaveValue('1:1:2')
  await expect(picker).toBeFocused()
  await picker.press('ArrowDown')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(input).toHaveValue('1:1:2')
  await input.fill('1')
  await input.press('Space')
  await input.pressSequentially('1')
  await input.press('Space')
  await input.pressSequentially('2')
  await expect(input).toHaveValue('1:1:2')
  await expect(picker).toHaveAttribute('data-value', id(6))
})

test('ordinary coordinate entry defaults to Planet and Harvest keeps debris intent', async ({
  page,
  mount,
}) => {
  await setup(page, mount)
  const input = page.getByLabel('Destination coordinates', { exact: true })
  const preview = page.getByLabel('Destination preview')
  await input.fill('1:1:3')
  await expect(preview).toContainText('Empty position')
  await input.fill('1:1:1')
  await expect(preview).toContainText('Planet · Stargazer')
  await page.getByRole('radio', { name: 'Harvest', exact: true }).check()
  await input.fill('1:1:3')
  await expect(preview).toContainText('Debris field')
  await page.getByRole('radio', { name: 'Transport', exact: true }).check()
  await input.fill('1:1:1')
  await expect(preview).toContainText('Planet · Stargazer')
})

test('explicit moon links retain their body intent through coordinate edits and review', async ({
  page,
  mount,
}) => {
  await setup(page, mount)
  const input = page.getByLabel('Destination coordinates', { exact: true })
  const preview = page.getByLabel('Destination preview')
  await input.evaluate((element) => {
    const data = new DataTransfer()
    data.setData(
      'text/plain',
      `${location.origin}/u/andromeda/location/1:1:1?target=moon`,
    )
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    )
  })
  await expect(preview).toContainText('Moon not observed')
  await input.fill('1')
  await input.press('Space')
  await input.pressSequentially('1 3')
  await expect(input).toHaveValue('1:1:3')
  await expect(preview).toContainText('Moon not observed')
  await expect(review(page)).toBeEnabled()
  await review(page).click()
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toBeVisible()
  expect((await counts(page)).quotes).toBe(1)
  expect((await counts(page)).launches).toBe(0)
  await page
    .getByRole('button', { name: 'Back to edit mission', exact: true })
    .click()
  await selectDestinationPlanet(page, id(6))
  await expect(preview).toContainText('Planet · Your colony')
})

test('long planet names remain readable in the narrow destination list', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 320, height: 900 })
  const state = await setup(page, mount)
  const name = 'M'.repeat(40)
  state.bodies[1].name = name
  await refreshDispatch(page)
  const picker = page.getByRole('combobox', { name: 'Your planets and moons' })
  await picker.click()
  const list = page.getByRole('listbox', { name: 'Your planets and moons' })
  await expect(list).toContainText(name)
  expect(
    await list.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true)
  await page
    .getByRole('option')
    .and(page.locator(`[data-value="${id(6)}"]`))
    .click()
  await expect(picker).toContainText(name)
  await expect(picker.locator('strong')).toHaveAttribute('title', name)
  expect(
    (await page.getByLabel('Destination preview').boundingBox())!.height,
  ).toBeLessThanOrEqual(120)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})

test('choosing a planet clears a rejected paste notice without changing coordinate validation', async ({
  page,
  mount,
}) => {
  await setup(page, mount)
  const input = page.getByLabel('Destination coordinates', { exact: true })
  const preview = page.getByLabel('Destination preview')
  await input.focus()
  await input.evaluate((element) => {
    const data = new DataTransfer()
    data.setData('text/plain', 'https://other.test/u/andromeda/location/1:1:2')
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    )
  })
  await expect(preview.getByRole('alert')).toContainText(
    'Use coordinates or a location link',
  )
  await selectDestinationPlanet(page, id(6))
  await expect(input).toHaveValue('1:1:2')
  await expect(preview).toContainText('Haven Colony')
  await expect(preview.getByRole('alert')).toHaveCount(0)
  await expect(input).toHaveAttribute('aria-invalid', 'false')
  await input.fill('999:1:2')
  await input.press('Tab')
  await expect(preview.getByRole('alert')).toContainText(
    'Enter a galaxy number from 1 to 1.',
  )
  await expect(input).toHaveAttribute('aria-invalid', 'true')
})

for (const width of [390, 1440]) {
  test(`dispatch feedback and ship selection at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await setup(page, mount)
    const table = page.getByRole('table', { name: 'Ships to dispatch' })
    await expect(
      table
        .getByRole('row')
        .filter({ has: page.locator('input') })
        .locator('th'),
    ).toHaveText(['Espionage Probe', 'Small Cargo', 'Recycler', 'Colony Ship'])
    await expect(
      page
        .getByRole('group', { name: 'Mission', exact: true })
        .locator('label'),
    ).toHaveText([
      'Transport',
      'Deploy',
      'Attack',
      'Harvest',
      'Espionage',
      'Colonize',
    ])
    await page
      .getByRole('button', { name: 'All Small Cargo', exact: true })
      .click()
    await expect(page.getByLabel('Small Cargo · 2 available')).toHaveValue('2')
    await expect(
      page.getByRole('button', { name: 'Next coordinate segment' }),
    ).toBeVisible({ visible: width < 768 })
    await expect(
      page.getByRole('complementary', { name: 'Departure context' }),
    ).toHaveCount(0)
    await page.getByLabel('Small Cargo · 2 available').fill('0')
    await page.getByRole('radio', { name: 'Colonize', exact: true }).check()
    await expect(
      page.getByRole('status').filter({ hasText: 'This position is occupied' }),
    ).toBeVisible()
    await expect(review(page)).toBeDisabled()

    await configure(page, { debris: false })
    await page.getByRole('radio', { name: 'Harvest', exact: true }).check()
    await expect(
      page.getByRole('status').filter({ hasText: 'no available debris field' }),
    ).toBeVisible()

    await page.getByRole('radio', { name: 'Deploy', exact: true }).check()
    await expect(
      page.getByRole('status').filter({ hasText: 'you own' }),
    ).toBeVisible()
    await page.getByRole('radio', { name: 'Transport', exact: true }).check()
    await page.getByLabel('Small Cargo · 2 available').fill('1')
    await configure(page, { fuel: '4000000000' })
    await configure(page, { quoteError: 'InsufficientResources' })
    await setSpeed(page, 90)
    const timing = page.getByRole('region', { name: 'Flight timing' })
    await expect(timing).toContainText('4,000 · Insufficient fuel')
    await expect(timing.locator('dd').first()).not.toHaveText('—')
    await review(page).click()
    await expect(page.getByRole('alert')).toContainText(
      'Not enough deuterium for fuel',
    )
    await expect(timing).toContainText('4,000 · Insufficient fuel')

    await configure(page, { fuel: '1000000' })
    await configure(page, { quoteError: null })
    await selectDestinationPlanet(page, id(6))
    await setSpeed(page, 100)
    await expect(timing.locator('dd').first()).toHaveText('1m 40s')

    await review(page).click()
    await expect(
      page.getByRole('region', { name: 'Fleet quote' }),
    ).toBeVisible()

    expect((await counts(page)).launches).toBe(0)
  })
}

for (const width of [390]) {
  test(`homeworld identity survives origin changes at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await setup(page, mount)
    await selectBody(page, id(6))
    await selectDestinationPlanet(page, body.id)
    await expect(page.getByLabel('Destination preview')).toContainText(
      'Planet · Your Homeworld',
    )
  })
}

test('espionage protection is observed before ships and remains advisory until review', async ({
  page,
  mount,
}) => {
  await setup(page, mount)
  await page.getByLabel('Small Cargo · 2 available').fill('0')
  await configure(page, { blocker: 'BeginnerProtected' })
  await page.getByRole('radio', { name: 'Espionage', exact: true }).check()
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Beginner protection prevents' }),
  ).toBeVisible()
  expect((await counts(page)).launches).toBe(0)
})

for (const width of [320, 390, 1440]) {
  test(`compact Dispatch identities, fleet slots and speed at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await setup(page, mount)
    const slots = page.locator('main').getByRole('button', {
      name: 'Fleet slots: 0 used / 5 total',
      exact: true,
    })
    const title = page
      .getByLabel('Dispatch header', { exact: true })
      .getByRole('heading', { name: 'Dispatch', exact: true })
    const bounds = await slots.evaluate((element) => {
      const badge = element.getBoundingClientRect(),
        heading = element.parentElement!.getBoundingClientRect()
      return {
        right: badge.right,
        headerRight: heading.right,
        top: badge.top,
        bottom: badge.bottom,
      }
    })
    expect(bounds.right).toBeCloseTo(
      (await page.locator('main').boundingBox())!.x +
        (await page.locator('main').boundingBox())!.width,
      0,
    )
    const titleBox = (await title.boundingBox())!
    expect(titleBox.y + titleBox.height / 2).toBeGreaterThanOrEqual(bounds.top)
    expect(titleBox.y + titleBox.height / 2).toBeLessThanOrEqual(bounds.bottom)
    const origin = page.getByRole('group', { name: 'Origin', exact: true })
    await expect(origin).toContainText('Aster Haven')
    await expect(origin).toContainText('Commander')
    await expect(origin.getByRole('link', { name: /origin/ })).toBeVisible()
    await expect(
      page
        .getByRole('table', { name: 'Ships to dispatch' })
        .locator('tr')
        .filter({ has: page.locator('th[scope="rowgroup"]') }),
    ).toHaveText(['Civil'])
    await expect(page.getByLabel('Small Cargo · 2 available')).toHaveValue('1')
    await expect(page.getByLabel('Destination preview')).toContainText(
      'Ember Watch',
    )
    await expect(
      page.getByRole('region', { name: 'Flight timing' }).locator('dd').first(),
    ).toHaveText('1m 40s')

    await slots.click()
    await expect(page.getByRole('tooltip')).toContainText(
      'Outbound and returning fleets, including pending departures',
    )
    await page.keyboard.press('Escape')
    const slider = page.getByRole('slider', { name: 'Speed', exact: true })
    await slider.press('Home')
    await expect(slider).toHaveValue('10')
    await slider.press('ArrowLeft')
    await expect(slider).toHaveValue('10')
    await slider.press('End')
    await expect(slider).toHaveValue('100')
    await slider.press('ArrowRight')
    await expect(slider).toHaveValue('100')
    await slider.press('ArrowLeft')
    await expect(slider).toHaveAttribute('aria-valuetext', '90%')
    await expect(
      page.getByRole('region', { name: 'Flight timing' }).locator('dd').first(),
    ).toHaveText('1m 52s')

    await review(page).click()
    await expect(
      page.getByRole('region', { name: 'Fleet quote' }),
    ).toContainText('90% speed')
    await expect(
      page.locator('main').getByRole('button', { name: /^Fleet slots:/ }),
    ).toHaveCount(1)

    expect((await counts(page)).launches).toBe(0)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  })
}

for (const width of [390, 1440]) {
  test(`Origin shares the planet selector presentation at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await setup(page, mount)
    await selectDestinationPlanet(page, id(6))
    const origin = page.getByRole('group', { name: 'Origin', exact: true })
    const destination = page.getByLabel('Destination preview')
    await expect(origin).toContainText('Aster Haven')
    await expect(origin).toContainText('Planet · Commander')
    await expect(origin.locator('img')).toHaveJSProperty('complete', true)
    const originArt = (await origin.locator('img').boundingBox())!
    const destinationArt = (await destination.locator('img').boundingBox())!
    expect(originArt.width).toBe(width < 480 ? 56 : 80)
    expect(originArt.width).toBe(destinationArt.width)
    expect((await origin.boundingBox())!.width).toBe(
      (await destination.boundingBox())!.width,
    )
    await expect(origin.getByText('Aster Haven', { exact: true })).toHaveCSS(
      'font-family',
      'Georgia, serif',
    )
    await expect(origin.getByRole('link', { name: /origin/ })).toBeVisible()
    await expect(
      page.getByRole('region', { name: 'Flight timing' }).locator('dd').first(),
    ).toHaveText('1m 40s')

    await page.getByRole('combobox', { name: 'Your planets and moons' }).click()
    await expect(
      page.getByRole('listbox', { name: 'Your planets and moons' }),
    ).toBeVisible()
    await page.keyboard.press('Escape')
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  })
}

for (const width of [320, 390, 640, 768, 1440]) {
  test(`mission choices are compact and keyboard accessible at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await setup(page, mount)
    const selector = page.getByRole('group', { name: 'Mission', exact: true })
    const radios = selector.getByRole('radio')
    await expect(radios).toHaveCount(6)
    await expect(
      page.getByRole('combobox', { name: 'Mission', exact: true }),
    ).toHaveCount(0)
    expect(
      await selector
        .locator('label > span')
        .evaluateAll((elements) =>
          elements.every(
            (element) => element.scrollWidth <= element.clientWidth,
          ),
        ),
    ).toBe(true)
    const transport = selector.getByRole('radio', {
      name: 'Transport',
      exact: true,
    })
    await expect(transport).toBeChecked()
    const tiles = await selector.locator('label').evaluateAll((elements) =>
      elements.map((element) => {
        const { x, y, width, height } = element.getBoundingClientRect()
        return { x, y, width, height }
      }),
    )
    expect(new Set(tiles.map((tile) => tile.y)).size).toBe(width < 768 ? 2 : 1)
    for (const tile of tiles) {
      expect(tile.height).toBeGreaterThanOrEqual(44)
      expect(tile.x + tile.width).toBeLessThanOrEqual(width)
    }
    await transport.focus()
    await transport.press('ArrowRight')
    await expect(
      selector.getByRole('radio', { name: 'Deploy', exact: true }),
    ).toBeChecked()
    await expect(selector).toContainText(
      'Move ships and cargo to an owned planet or moon.',
    )
    await expect(
      page.getByText(/Deployment transfers ships and cargo/),
    ).toHaveCount(0)
    await expect(page.getByLabel('Destination preview')).toContainText(
      'Ember Watch',
    )

    await page.keyboard.press('ArrowRight')
    const attack = selector.getByRole('radio', { name: 'Attack', exact: true })
    await expect(attack).toBeChecked()
    await expect(attack).toBeFocused()
    await expect(attack.locator('+ span')).toHaveCSS('outline-style', 'solid')
    await expect(page.getByLabel('Destination preview')).toContainText(
      'Ember Watch',
    )

    await selector.getByRole('radio', { name: 'Harvest', exact: true }).check()
    await expect(page.getByLabel('Destination preview')).toContainText(
      'Debris field',
    )
    await selector.getByRole('radio', { name: 'Colonize', exact: true }).check()
    await expect(selector).toContainText(
      'Use a Colony Ship to settle an empty planet slot.',
    )
    await expect(
      page.getByText(/Planets:|Requires at least one Colony Ship/),
    ).toHaveCount(0)

    await transport.check()
    await expect(page.getByLabel('Destination preview')).toContainText(
      'Ember Watch',
    )
    await expect(selector.getByRole('radio', { checked: true })).toHaveCount(1)
    await expect(page.getByLabel('Small Cargo · 2 available')).toHaveValue('1')
    await expect(
      page.getByRole('region', { name: 'Flight timing' }).locator('dd').first(),
    ).toHaveText('1m 40s')

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  })
}

test('mission choices honor capabilities and retain a selected unavailable mission', async ({
  page,
  mount,
}) => {
  const state = await setup(page, mount)
  const selector = page.getByRole('group', { name: 'Mission', exact: true })
  await selector.getByRole('radio', { name: 'Attack', exact: true }).check()
  state.capabilities.splice(0)
  await refreshDispatch(page)
  await expect(selector.locator('label')).toHaveText(['Transport', 'Attack'])
  await expect(
    selector.getByRole('radio', { name: 'Attack', exact: true }),
  ).toBeChecked()
  await selector.getByRole('radio', { name: 'Transport', exact: true }).check()
  await expect(selector.locator('label')).toHaveText(['Transport'])
  await expect(
    selector.getByRole('radio', { name: 'Transport', exact: true }),
  ).toBeChecked()
})

for (const width of [320, 390, 1440]) {
  test(`ship fill actions share the cargo control and fill the fleet at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    const state = await setup(page, mount)
    const fleet = page.getByRole('group', { name: 'Ships', exact: true })
    const addAll = fleet.getByRole('button', {
      name: 'Add all ships',
      exact: true,
    })
    const smallCargo = page.getByLabel('Small Cargo · 2 available')
    await expect(addAll).toHaveText('Add All')
    await expect(addAll).toHaveAttribute('data-button-variant', 'secondary')
    await expect(
      fleet.getByRole('button', { name: 'Max Light Fighter', exact: true }),
    ).toHaveCount(0)
    await smallCargo.fill('')
    const fillCargo = fleet.getByRole('button', {
      name: 'Max Small Cargo',
      exact: true,
    })
    await fillCargo.focus()
    await fillCargo.press('Enter')
    await expect(smallCargo).toHaveValue('2')
    expect((await counts(page)).quotes).toBe(0)
    await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(
      0,
    )
    expect((await counts(page)).launches).toBe(0)
    // Measure together: a destination lookup can move the table between frames.
    const { inputBox, actionBox } = await smallCargo.evaluate((input) => ({
      inputBox: input.getBoundingClientRect().toJSON(),
      actionBox: input
        .parentElement!.querySelector('button')!
        .getBoundingClientRect()
        .toJSON(),
    }))
    expect(actionBox.x + actionBox.width).toBe(inputBox.x + inputBox.width - 4)
    expect(actionBox.y).toBe(inputBox.y + 4)
    expect(actionBox.height).toBe(36)
    await expect(page.getByLabel('Destination preview')).toContainText(
      'Ember Watch',
    )

    state.bodies[0].inventories.push({
      item: { kind: 'Ship', id: 'LightFighter' },
      count: '7',
    })
    await refreshDispatch(page)
    await expect(
      fleet.getByRole('button', { name: 'Max Light Fighter', exact: true }),
    ).toBeEnabled()
    await page.getByLabel('Metal', { exact: true }).fill('42')
    await smallCargo.fill('99')
    await page.getByLabel('Recycler · 1 available').fill('')
    await addAll.click()
    for (const [ship, count] of [
      ['Light Fighter', '7'],
      ['Espionage Probe', '1'],
      ['Small Cargo', '2'],
      ['Recycler', '1'],
      ['Colony Ship', '1'],
    ]) {
      await expect(page.getByLabel(`${ship} · ${count} available`)).toHaveValue(
        count,
      )
    }
    await addAll.click()
    await expect(smallCargo).toHaveValue('2')
    await expect(page.getByLabel('Metal', { exact: true })).toHaveValue('42')
    expect((await counts(page)).quotes).toBe(0)
    await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(
      0,
    )
    expect((await counts(page)).launches).toBe(0)
    await expect(
      page.getByRole('region', { name: 'Flight timing' }).locator('dd').first(),
    ).toHaveText('1m 40s')

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await review(page).click()
    const request = await lastQuote(page)
    expect((await counts(page)).quotes).toBe(1)
    expect(
      Object.fromEntries(
        request.intent.ships.map(
          (ship: { ship_type: string; count: string }) => [
            ship.ship_type,
            ship.count,
          ],
        ),
      ),
    ).toEqual({
      LightFighter: '7',
      EspionageProbe: '1',
      SmallCargo: '2',
      Recycler: '1',
      ColonyShip: '1',
    })
    expect((await counts(page)).launches).toBe(0)
  })
}

test('Add All reads current inventory and disables on an empty origin', async ({
  page,
  mount,
}) => {
  const state = await setup(page, mount)
  const originalCargo = body.inventories.find(
    (stack) => stack.item.id === 'SmallCargo',
  )!.count
  const addAll = page.getByRole('button', {
    name: 'Add all ships',
    exact: true,
  })
  const cargo = state.bodies[0].inventories.find(
    (stack) => stack.item.id === 'SmallCargo',
  )!
  cargo.count = '9007199254740993'
  await refreshDispatch(page)
  await addAll.click()
  await expect(
    page.getByLabel('Small Cargo · 9007199254740993 available'),
  ).toHaveValue('9007199254740993')
  cargo.count = '1'
  await refreshDispatch(page)
  await addAll.click()
  await expect(page.getByLabel('Small Cargo · 1 available')).toHaveValue('1')
  state.bodies[1].inventories = []
  await refreshDispatch(page)
  await selectBody(page, id(6))
  await expect(addAll).toBeDisabled()
  const fleet = page.getByRole('group', { name: 'Ships', exact: true })
  for (const fill of await fleet.getByRole('button', { name: /^Max / }).all())
    await expect(fill).toBeDisabled()
  await expect(fleet).toContainText('No ships available here.')
  await expect(
    page.getByRole('table', { name: 'Ships to dispatch' }),
  ).toHaveCount(0)
  await fleet.getByRole('button', { name: /^Show all ships/ }).click()
  await expect(page.getByLabel('Small Cargo · 0 available')).toHaveValue('0')
  expect(
    body.inventories.find((stack) => stack.item.id === 'SmallCargo')!.count,
  ).toBe(originalCargo)
})

test('Dispatch keeps You in origin and review when self profiles and view names are unavailable', async ({
  page,
  mount,
}) => {
  await setup(page, mount, { variant: 'unknown' })
  await expect(
    page.getByRole('group', { name: 'Origin', exact: true }),
  ).toContainText('Planet · You')
  await review(page).click()
  const quote = page.getByRole('region', { name: 'Fleet quote' })
  await expect(quote.getByText('You', { exact: true })).toBeVisible()
  await expect(quote).not.toContainText(`Player ${binding.player.slice(0, 8)}`)
  expect((await counts(page)).launches).toBe(0)
})

for (const width of [390, 1440]) {
  test(`Dispatch shows available ships with a reversible all-rows disclosure at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    const state = await setup(page, mount)
    const fleet = page.getByRole('group', { name: 'Ships', exact: true })
    const table = fleet.getByRole('table', { name: 'Ships to dispatch' })
    const toggle = fleet.getByRole('button', {
      name: 'Show all ships (1 more)',
      exact: true,
    })
    await expect(table.getByRole('rowheader')).toHaveText([
      'Civil',
      'Espionage Probe',
      'Small Cargo',
      'Recycler',
      'Colony Ship',
    ])
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await toggle.focus()
    await toggle.press('Enter')
    const collapse = fleet.getByRole('button', {
      name: 'Show available ships',
      exact: true,
    })
    await expect(collapse).toHaveAttribute('aria-expanded', 'true')
    await expect(collapse).toBeFocused()
    await expect(table.getByRole('rowheader')).toHaveText([
      'Military',
      'Light Fighter',
      'Civil',
      'Espionage Probe',
      'Small Cargo',
      'Recycler',
      'Colony Ship',
    ])
    await expect(page.getByLabel('Light Fighter · 0 available')).toHaveValue(
      '0',
    )
    await expect(
      fleet.getByRole('button', { name: 'Max Light Fighter', exact: true }),
    ).toBeDisabled()

    await collapse.press('Space')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(toggle).toBeFocused()
    await expect(
      table.getByRole('rowheader', { name: 'Military', exact: true }),
    ).toHaveCount(0)
    await expect(page.getByLabel('Small Cargo · 2 available')).toHaveValue('1')
    // New inventory appears without expanding; removing it hides the unused row.
    state.bodies[0].inventories.push({
      item: { kind: 'Ship', id: 'LightFighter' },
      count: '3',
    })
    await refreshDispatch(page)
    await expect(page.getByLabel('Light Fighter · 3 available')).toBeVisible()
    await expect(toggle).toHaveCount(0)
    expect((await counts(page)).quotes).toBe(0)
    expect((await counts(page)).launches).toBe(0)
    // Expansion is local to the selected origin; the colony has no ships.
    state.bodies[1].inventories = []
    await refreshDispatch(page)
    await selectBody(page, id(6))
    const emptyShips = page.getByRole('group', { name: 'Ships', exact: true })
    await expect(emptyShips.getByRole('table')).toHaveCount(0)
    await expect(emptyShips.getByRole('status')).toHaveText(
      'No ships available here.',
    )
    await expect(
      emptyShips.getByRole('button', { name: 'Add all ships' }),
    ).toBeDisabled()

    await emptyShips.getByRole('button', { name: /^Show all ships/ }).click()
    await expect(emptyShips.getByRole('table')).toBeVisible()

    await selectBody(page, body.id)
    await expect(
      page.getByRole('button', { name: 'Show available ships', exact: true }),
    ).toHaveCount(0)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  })
}

test('Dispatch retains unavailable edited rows until corrected without hiding a launch selection', async ({
  page,
  mount,
}) => {
  const state = await setup(page, mount)
  const cargo = state.bodies[0].inventories.find(
    (stack) => stack.item.id === 'SmallCargo',
  )!
  cargo.count = '0'
  await refreshDispatch(page)
  const selected = page.getByLabel('Small Cargo · 0 available')
  await expect(selected).toHaveValue('1')
  await selected.fill('invalid')
  await expect(selected).toBeVisible()
  await review(page).click()
  await expect(page.getByRole('alert')).toContainText('Enter whole nonnegative')
  expect((await counts(page)).quotes).toBe(0)
  await selected.fill('000')
  await expect(selected).toHaveCount(0)
  await page.getByRole('button', { name: 'Show all ships (2 more)' }).click()
  await expect(selected).toHaveValue('000')
  await page.getByRole('button', { name: 'Show available ships' }).click()
  await expect(selected).toHaveCount(0)
  expect((await counts(page)).launches).toBe(0)
})

for (const width of [390, 635, 1440]) {
  test(`dispatch header keeps mission and editing controls together at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await setup(page, mount)
    const header = page.getByLabel('Dispatch header', { exact: true })
    await expect(header.getByRole('heading')).toHaveText('Dispatch')
    await review(page).click()
    await expect(header.getByRole('heading')).toHaveText('Dispatch')
    const missionHeading = page
      .getByRole('region', { name: 'Fleet quote' })
      .getByRole('heading', { level: 2 })
    await expect(missionHeading).toHaveText('Transport')
    const route = page.getByLabel('Flight route', { exact: true })
    await expect(
      route.getByRole('img', { name: /^Planned flight from/ }),
    ).toBeVisible()
    expect((await route.boundingBox())!.height).toBeLessThan(180)
    const quote = page.getByRole('region', { name: 'Fleet quote' })
    const manifest = quote.getByRole('region', {
      name: 'Fleet and cargo',
      exact: true,
    })
    const schedule = quote.getByRole('region', {
      name: 'Flight schedule',
      exact: true,
    })
    await expect(
      manifest.getByRole('list', { name: 'Ship composition' }),
    ).toBeVisible()
    await expect(manifest).toContainText('Payload capacity')
    await expect(schedule).toContainText('Fuel')
    await expect(schedule).toContainText('Estimated arrival')
    await expect(schedule).toContainText('Ships return after delivering cargo.')
    for (const group of [manifest, schedule]) {
      const values = await group
        .getByRole('definition')
        .evaluateAll((elements) =>
          elements.map((el) => el.getBoundingClientRect().x),
        )
      expect(new Set(values).size).toBe(1)
    }
    const manifestBox = (await manifest.boundingBox())!
    const scheduleBox = (await schedule.boundingBox())!
    if ((await quote.boundingBox())!.width < 576)
      expect(scheduleBox.y).toBeGreaterThanOrEqual(
        manifestBox.y + manifestBox.height,
      )
    else {
      expect(scheduleBox.y).toBe(manifestBox.y)
      expect(scheduleBox.x).toBeGreaterThanOrEqual(
        manifestBox.x + manifestBox.width,
      )
    }
    await expect(quote.locator('details')).toHaveCount(0)
    await expect(quote).not.toContainText('Estimates assume departure now.')
    const send = (await quote
      .getByRole('button', { name: /^Transport to/ })
      .boundingBox())!
    expect(
      Math.max(
        manifestBox.y + manifestBox.height,
        scheduleBox.y + scheduleBox.height,
      ),
    ).toBeLessThanOrEqual(send.y)
    const headerBox = (await header.boundingBox())!
    expect((await missionHeading.boundingBox())!.y).toBeGreaterThan(
      headerBox.y + headerBox.height,
    )
    const slots = header.getByRole('button', { name: /^Fleet slots:/ })
    const edit = header.getByRole('button', { name: 'Back to edit mission' })
    await expect(edit).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Edit mission', exact: true }),
    ).toHaveCount(0)
    const slotsBox = (await slots.boundingBox())!
    const backBox = (await edit.boundingBox())!
    expect(backBox.x + backBox.width).toBeLessThanOrEqual(slotsBox.x)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    await header
      .getByRole('button', { name: 'Back to edit mission', exact: true })
      .click()
    await expect(
      header.getByRole('link', { name: 'Back to fleets' }),
    ).toBeVisible()
    await expect(header.getByRole('heading')).toHaveText('Dispatch')
    await expect(page.getByLabel('Small Cargo · 2 available')).toHaveValue('1')
    await expect(edit).toHaveCount(0)
  })
}

for (const width of [390, 635, 1440]) {
  test(`dense dispatch review preserves full ship counts and cargo at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    const state = await setup(page, mount)
    for (const inventory of state.bodies[0].inventories)
      inventory.count = '1234567'
    state.bodies[0].inventories.push({
      item: { kind: 'Ship', id: 'LightFighter' },
      count: '1234567',
    })
    state.bodies[0].amounts = {
      metal: '50000000000000',
      crystal: '35000000000000',
      deuterium: '20000000000000',
    }
    await configure(page, { capacity: '40000000000000' })
    await configure(page, { maximumPayload: '39871550000000' })
    await configure(page, { fuel: '128450000000' })
    await refreshDispatch(page)
    await expect(
      page.getByLabel('Small Cargo · 1234567 available'),
    ).toBeVisible()
    await page
      .getByRole('button', { name: 'Add all ships', exact: true })
      .click()
    for (const [resource, amount] of [
      ['Metal', '12345678'],
      ['Crystal', '8765432'],
      ['Deuterium', '3210987'],
    ]) {
      await page
        .getByRole('textbox', { name: resource, exact: true })
        .fill(amount)
    }
    await review(page).click()
    const quote = page.getByRole('region', { name: 'Fleet quote' })
    const ships = quote.getByRole('list', { name: 'Ship composition' })
    await expect(ships.getByRole('listitem')).toHaveCount(5)
    for (const ship of await ships.getByRole('listitem').all())
      await expect(ship).toContainText('1,234,567')
    const manifest = quote.getByRole('region', { name: 'Fleet and cargo' })
    for (const amount of ['12,345,678', '8,765,432', '3,210,987', '39,871,550'])
      await expect(manifest).toContainText(amount)
    const cargoRows = []
    for (const name of ['Metal', 'Crystal', 'Deuterium']) {
      cargoRows.push(
        (await manifest
          .getByRole('img', { name, exact: true })
          .locator('..')
          .boundingBox())!,
      )
    }
    const shipNames = await ships
      .getByRole('listitem')
      .evaluateAll((items) =>
        items.map((item) => item.firstElementChild!.getBoundingClientRect().x),
      )
    for (const x of shipNames) expect(x).toBe(cargoRows[0].x)
    for (let i = 1; i < cargoRows.length; i++) {
      expect(cargoRows[i].x).toBe(cargoRows[0].x)
      expect(cargoRows[i].y).toBeGreaterThanOrEqual(
        cargoRows[i - 1].y + cargoRows[i - 1].height,
      )
    }
    await expect(
      quote.getByRole('region', { name: 'Flight schedule' }),
    ).toContainText('128,450')
    await expect(quote.locator('details')).toHaveCount(0)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    const bounds = (await manifest.boundingBox())!
    for (const row of await ships.getByRole('listitem').all()) {
      const box = (await row.boundingBox())!
      expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width)
    }

    await page
      .getByRole('button', { name: 'Back to edit mission', exact: true })
      .click()
    await expect(
      page.getByRole('textbox', { name: 'Metal', exact: true }),
    ).toHaveValue('12345678')

    await expect(
      page.getByLabel('Flight timing', { exact: true }),
    ).toContainText('128,450')
  })
}

for (const width of [390]) {
  test(`background refresh retains compatible flight estimates and fresh Review at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await setup(page, mount)
    const timing = page.getByRole('region', { name: 'Flight timing' })
    const preview = page.getByLabel('Destination preview')
    await expect(timing.locator('dd').first()).toHaveText('1m 40s')
    const previewText = await preview.textContent()
    const ships = page.getByLabel('Small Cargo · 2 available')
    await ships.focus()
    const before = (await counts(page)).estimates
    await hold(page, 'FleetEstimate')
    await hold(page, 'Galaxy')
    try {
      await refreshDispatch(page)
      await expect
        .poll(async () => (await counts(page)).estimates)
        .toBeGreaterThan(before)
      await expect(timing.locator('dd').first()).toHaveText('1m 40s')
      await expect(timing.locator('dd').nth(2)).toHaveText('3m 20s')
      for (const value of await timing.locator('dd').allTextContents())
        expect(value).not.toBe('—')
      await expect(timing).not.toContainText('Updating flight times…')
      expect(await preview.textContent()).toBe(previewText)
      await expect(ships).toBeEnabled()
      await expect(ships).toBeFocused()
      await expect(ships).toHaveValue('1')

      // Advisory retention never substitutes for fresh, authoritative launch terms.
      const quotes = (await counts(page)).quotes
      await configure(page, { quoteError: 'InsufficientResources' })
      await page
        .getByRole('button', { name: 'Review fleet', exact: true })
        .click()
      await expect
        .poll(async () => (await counts(page)).quotes)
        .toBe(quotes + 1)
      await expect(
        page.getByRole('button', { name: 'Launch fleet', exact: true }),
      ).toHaveCount(0)
      expect((await counts(page)).launches).toBe(0)
    } finally {
      await release(page)
    }
  })
}

for (const width of [390, 1440]) {
  test(`dispatch cargo capacity follows current estimates and edits at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await setup(page, mount)
    const capacity = page.getByRole('group', {
      name: 'Cargo capacity',
      exact: true,
    })
    const metal = page.getByRole('textbox', { name: 'Metal', exact: true })
    await expect(capacity).toHaveText('5,000 total capacity4,999 after fuel')
    await expect(metal).toHaveValue('0')

    const estimates = (await counts(page)).estimates
    const initialInputY = await metal.evaluate(
      (el) => el.getBoundingClientRect().top + window.scrollY,
    )
    await metal.fill('100')
    await expect(capacity).toContainText('4,899 remaining')
    expect((await counts(page)).estimates).toBe(estimates)
    expect(
      await metal.evaluate(
        (el) => el.getBoundingClientRect().top + window.scrollY,
      ),
    ).toBe(initialInputY)

    await metal.fill('4999')
    await expect(capacity).toContainText('0 remaining')
    await metal.fill('5001')
    await expect(capacity).toContainText('2 over capacity')
    await configure(page, { quoteError: 'CargoCapacity' })
    await review(page).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(
      0,
    )
    await expect(metal).toHaveValue('5001')
    await expect(capacity).toContainText('2 over capacity')

    await configure(page, { quoteError: null })
    await metal.fill('1.5')
    await expect(capacity).toContainText(
      'Enter whole nonnegative cargo amounts.',
    )
    await expect(capacity).not.toContainText('remaining')
    await metal.fill('100')

    // A different ship selection invalidates the old advisory result immediately.
    const before = (await counts(page)).estimates
    await hold(page, 'FleetEstimate')
    await configure(page, { capacity: '10000000000' })
    await configure(page, { maximumPayload: '9998000000' })
    await page.getByLabel('Small Cargo · 2 available').fill('2')
    try {
      await expect
        .poll(async () => (await counts(page)).estimates)
        .toBeGreaterThan(before)
      await expect(capacity).toHaveText('Calculating capacity…')
    } finally {
      await release(page)
    }
    await expect(capacity).toHaveText(
      '10,000 total capacity9,998 after fuel9,898 remaining',
    )

    await configure(page, { maximumPayload: '9999000000' })
    await configure(page, { fuel: '1000000' })
    await setSpeed(page, 50)
    await expect(capacity).toContainText('9,999 after fuel9,899 remaining')
    await configure(page, { maximumPayload: '9997000000' })
    await configure(page, { fuel: '3000000' })
    await setDestination(page, { system: '2' })
    await expect(capacity).toContainText('9,997 after fuel9,897 remaining')

    await configure(page, { estimateError: 'NotFound' })
    await setSpeed(page, 40)
    await expect(capacity).toHaveText('Capacity unavailable.')
    await expect(metal).toHaveValue('100')
    await configure(page, { estimateError: null })
    await page.getByLabel('Small Cargo · 2 available').fill('0')
    await expect(capacity).toHaveText('Select ships to see capacity.')
    await page.getByLabel('Small Cargo · 2 available').fill('1.5')
    await expect(capacity).toHaveText(
      'Enter valid ship counts to see capacity.',
    )
    await page.getByLabel('Small Cargo · 2 available').fill('1')
    await expect(capacity).toContainText('total capacity')
    await setDestination(page, { system: '0' })
    await expect(capacity).toHaveText('Capacity unavailable.')
    await expect(review(page)).toBeDisabled()
    expect((await counts(page)).launches).toBe(0)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width)
  })

  test(`dispatch debris preview reuses debris artwork at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await setup(page, mount)
    await page.getByRole('radio', { name: 'Harvest', exact: true }).check()
    const preview = page.getByLabel('Destination preview')
    await expect(preview).toContainText('Debris field')
    const art = preview.locator('img')
    await expect(art).toHaveAttribute('src', '/art/debris/debris-medium.webp')
    await expect
      .poll(async () =>
        art.evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
      )
      .toBe(true)
    await expect(preview).toContainText('System observation checked.')

    await configure(page, { debris: false })
    await setDestination(page, { system: '2' })
    await expect(
      page.getByRole('status').filter({ hasText: 'no available debris field' }),
    ).toBeVisible()
    await expect(review(page)).toBeDisabled()
    await expect(art).toHaveAttribute('src', '/art/debris/debris-medium.webp')
    expect((await counts(page)).launches).toBe(0)
  })
}

const dispatchResult = (page: import('./fixture').Page) =>
  page.getByRole('group', { name: 'Fleet dispatch result', exact: true })

test('editing a new draft clears the previous launch receipt', async ({
  page,
  mount,
}) => {
  await setup(page, mount)
  await review(page).click()
  await page
    .getByRole('button', {
      name: /^(Attack with|Spy with|Harvest with|Colonize with|Transport to|Deploy to) /,
    })
    .click()
  await expect(dispatchResult(page)).toContainText('Fleet sent.')
  await page.getByLabel('Small Cargo · 2 available').fill('2')
  await expect(dispatchResult(page)).toHaveCount(0)
  await review(page).click()
  await expect(dispatchResult(page)).toHaveCount(0)
  await page.getByRole('button', { name: 'Back to edit mission' }).click()
  await expect(dispatchResult(page)).toHaveCount(0)
})

test('protection is explained before review, rechecked at review, and launch races have readable receipts', async ({
  page,
  mount,
}) => {
  await setup(page, mount)
  await expect(page.getByLabel('Destination preview')).toContainText(
    'Ember Watch',
  )
  await configure(page, {
    blocker: 'BeginnerProtected',
    launchOutcome: 'Rejected',
  })
  await page.getByRole('radio', { name: 'Attack', exact: true }).check()
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Beginner protection prevents' }),
  ).toBeVisible()
  // Timing requests read-only estimates before the explicit review step.
  expect((await counts(page)).launches).toBe(0)
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 900 })
  await configure(page, { quoteError: 'BeginnerProtected' })
  await review(page).click()
  await expect(
    page.getByRole('alert').filter({ hasText: 'Beginner protection prevents' }),
  ).toBeVisible()
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(0)
  // The observation is advisory: a newer valid quote can supersede a stale blocker.
  await configure(page, { quoteError: null })
  await page.getByRole('textbox', { name: 'Metal', exact: true }).fill('42')
  await review(page).click()
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toBeVisible()
  await page
    .getByRole('button', {
      name: /^(Attack with|Spy with|Harvest with|Colonize with|Transport to|Deploy to) /,
    })
    .click()
  await expect(
    page.getByRole('complementary', { name: 'Action needs attention' }),
  ).toContainText('Fleet not sent: Beginner protection prevents')
  expect((await counts(page)).launches).toBe(1)
  await expect(page.getByLabel('Small Cargo · 2 available')).toHaveValue('1')
  await expect(
    page.getByRole('textbox', { name: 'Metal', exact: true }),
  ).toHaveValue('42')
})

for (const outcome of ['Pending', 'Rejected'] as const) {
  test(`dispatch shows submitting then ${outcome} without false success`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await setup(page, mount)
    await configure(page, { launchOutcome: outcome })
    await hold(page, 'LaunchFleet')
    await review(page).click()
    try {
      await page.getByRole('button', { name: /^Transport to/ }).click()
      await expect(dispatchResult(page)).toContainText('Sending fleet order…')
      await expect(dispatchResult(page)).not.toContainText('Fleet sent.')
      expect((await counts(page)).launches).toBe(1)
    } finally {
      await release(page)
    }
    const feedback =
      outcome === 'Pending'
        ? dispatchResult(page)
        : page
            .getByTestId('game-error-banner')
            .getByRole('group', { name: 'Order status' })
    if (outcome === 'Rejected')
      await expect(dispatchResult(page)).toHaveCount(0)
    await expect(feedback).toContainText(
      outcome === 'Pending'
        ? 'Order accepted. Waiting for launch confirmation…'
        : 'Fleet not sent: Beginner protection prevents',
    )
    await expect(feedback).not.toContainText('Fleet sent.')
    await expect(page.getByLabel(/Small Cargo · \d+ available/)).toHaveValue(
      '1',
    )
    expect((await counts(page)).launches).toBe(1)
  })
}

for (const failure of ['PositionOccupied', 'PrerequisiteMissing'] as const) {
  test(`colony ${failure} remains actionable after the advisory read settles`, async ({
    page,
    mount,
  }) => {
    await setup(page, mount)
    await configure(
      page,
      failure === 'PositionOccupied'
        ? { resolveError: failure }
        : { quoteError: failure, estimateError: failure },
    )
    await page.getByLabel('Small Cargo · 2 available').fill('0')
    await page.getByRole('radio', { name: 'Colonize', exact: true }).check()
    await setDestination(page, { position: '3' })
    await page.getByLabel('Colony Ship · 1 available').fill('1')
    await review(page).click()
    const message =
      failure === 'PositionOccupied'
        ? 'This position is occupied. Choose an empty position.'
        : 'Astrophysics level 4 is required for this position.'
    await expect(page.getByRole('alert')).toHaveText(message)
    await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(
      0,
    )
    await expect(
      page.getByRole('region', { name: 'Flight timing' }),
    ).toContainText(
      failure === 'PositionOccupied'
        ? 'This position is occupied.'
        : 'Your empire does not meet the requirements for this mission.',
    )
    await expect(page.getByRole('alert')).toHaveText(message)
    expect((await counts(page)).launches).toBe(0)
    expect((await counts(page)).quotes).toBe(
      failure === 'PositionOccupied' ? 0 : 1,
    )
  })
}

test('known locked colony positions disable review and an eligible position restores it', async ({
  page,
  mount,
}) => {
  await setup(page, mount)
  await page.getByLabel('Small Cargo · 2 available').fill('0')
  await page.evaluate(() =>
    window.dispatchScene!.configure({
      view: { research: [{ research: 'Astrophysics', level: 1 }] },
    }),
  )
  await page.getByRole('radio', { name: 'Colonize', exact: true }).check()
  await setDestination(page, { position: '3' })
  await expect(
    page.getByRole('status').filter({ hasText: 'Astrophysics level 4' }),
  ).toContainText('Astrophysics level 4 is required for this position.')
  await expect(review(page)).toBeDisabled()
  await setDestination(page, { position: '4' })
  await expect(review(page)).toBeEnabled()
  expect((await counts(page)).quotes).toBe(0)
  expect((await counts(page)).launches).toBe(0)
})

test('prepared attack opens final review with carried fleet and speed, without launching', async ({
  page,
  mount,
}) => {
  await mount('dispatch-prepared')
  const quote = page.getByRole('region', { name: 'Fleet quote' })
  await expect(quote).toBeFocused()
  expect((await snapshot(page)).launches).toBe(0)
  const intent = (await lastQuote(page)).intent
  expect(intent.speed_percent).toBe(80)
  expect(intent.ships).toEqual([
    { owner: player, ship_type: 'SmallCargo', count: '1' },
  ])
  expect(intent.destination).toMatchObject({
    id: id(20),
    expected_owner: id(30),
  })
  await page.getByRole('button', { name: 'Back to edit mission' }).click()
  await expect(
    page.getByRole('region', { name: 'Observed raid resources' }),
  ).toContainText('12,000')
  await expect(review(page)).toBeVisible()
  expect((await counts(page)).quotes).toBe(1)
})

test('prepared attack with unavailable fleet slot keeps editable draft and final confirmation closed', async ({
  page,
  mount,
}) => {
  await mount('dispatch-prepared-blocked')
  await expect(page.getByRole('alert')).toContainText('fleet slots')
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(0)
  await expect(page.getByLabel('Small Cargo · 2 available')).toHaveValue('1')
  await expect(
    page.getByRole('slider', { name: 'Speed', exact: true }),
  ).toHaveValue('80')
  expect((await snapshot(page)).launches).toBe(0)
})

test('cargo add all and max stay editable when launch quotes reject occupied slots', async ({
  page,
  mount,
}) => {
  await setup(page, mount)
  await configure(page, {
    quoteError: 'NoFleetSlot',
    fuel: '100000000',
    maximumPayload: '5000000000',
  })
  await page.getByRole('button', { name: 'Add all', exact: true }).click()
  await expect(
    page.getByRole('textbox', { name: 'Metal', exact: true }),
  ).not.toHaveValue('0')
  await page.getByRole('button', { name: 'Max deuterium', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await review(page).click()
  await expect(page.getByRole('alert')).toContainText('fleet slots')
  expect((await snapshot(page)).launches).toBe(0)
})

test('raid observations show historical amounts and preserve unknown or unavailable resource states', async ({
  page,
  mount,
}) => {
  await setup(page, mount, { variant: 'historical' })
  const planning = page.getByRole('region', { name: 'Observed raid resources' })
  await expect(planning).toContainText('12,000')
  await expect(
    planning.getByRole('img', { name: 'Metal', exact: true }).first(),
  ).toBeVisible()
  for (const resourceVisibility of ['Unknown', 'Missing', 'Error'] as const) {
    await page.evaluate(
      (resourceVisibility) =>
        window.dispatchScene!.configure({
          options: { resourceVisibility },
          view: {},
        }),
      resourceVisibility,
    )
    await expect(planning).toContainText(
      resourceVisibility === 'Error' ? 'Unable to load' : 'No known resources',
    )
    await expect(planning).not.toContainText('12,000')
    await expect(planning).not.toContainText('Potential loot')
  }
})
