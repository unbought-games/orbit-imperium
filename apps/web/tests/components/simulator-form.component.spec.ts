import { test, expect, type Page } from './fixture'
import type { EmpireSceneInput } from './empire-runtime'
import type {} from './empire.scenarios'
import { body, id } from '../../src/test-support/empire'
import { catalog as observationCatalog } from '../fixtures/simulation-observation-catalog'
import { simulationCatalog } from '../fixtures/simulation-catalog'

const input: EmpireSceneInput = {
  surface: 'simulation',
  catalog: simulationCatalog,
  research: [],
  missions: {
    fleets: [],
    incoming: [],
    score_value_micro: '0',
    fleet_slots: '1',
  },
  bodies: [
    {
      ...body,
      inventories: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: '3' }],
    },
  ],
  simulationSamples: Array.from({ length: 10 }, () => ({
    outcome: 'AttackerVictory',
    rounds: 1,
    moon_chance_percent: 0,
    attacker: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: 8 }],
    defender: [],
    debris: { metal: '18000000', crystal: '6000000', deuterium: '0' },
    surviving_cargo_capacity: '400000000',
    estimated_loot: null,
  })),
}
async function prepare(page: Page, mount: (s: string) => Promise<void>) {
  await page.addInitScript((input) => {
    window.empireInput = input
  }, input)
  await mount('empire')
}
async function expectLayout(page: Page) {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  }
}

test('the phone simulator fits every digit of a five-digit Start count', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await prepare(page, mount)
  const start = page.getByRole('textbox', { name: 'Defender Light Fighter' })
  await start.fill('10000')
  await expect(start).toBeFocused()
  await expect(start).toHaveValue('10000')
  await page.evaluate(() => document.fonts.ready)

  const expectDigitsToFit = async () => {
    const { available, required } = await start.evaluate((input) => {
      const style = getComputedStyle(input)
      const text = document.createElement('span')
      text.style.position = 'absolute'
      text.style.font = style.font
      text.style.fontVariantNumeric = style.fontVariantNumeric
      text.textContent = (input as HTMLInputElement).value
      document.body.append(text)
      const required = text.getBoundingClientRect().width
      text.remove()
      const available =
        input.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight)
      return { available, required }
    })
    expect(available).toBeGreaterThan(required)
  }

  await expectDigitsToFit()
  await start.fill('20000')
  await start.blur()
  await expect(start).toHaveValue('20000')
  await expectDigitsToFit()
})

test('adding an allied attacker preserves separate technology levels and editing it invalidates the results', async ({
  page,
  mount,
}) => {
  await prepare(page, mount)
  await page.getByLabel('Attacker Light Fighter', { exact: true }).fill('2')
  await expect(
    page.getByLabel('Defender Weapons Technology', { exact: true }),
  ).toHaveValue('0')
  await page
    .getByRole('button', { name: 'Add attacking fleet', exact: true })
    .click()
  const ally = page.getByRole('group', {
    name: 'Allied attacking fleet 1',
    exact: true,
  })
  await expect(
    ally.getByLabel('Attacker Weapons Technology', { exact: true }),
  ).toHaveValue('0')
  await ally
    .getByLabel('Attacker Weapons Technology', { exact: true })
    .fill('9')
  await ally
    .getByLabel('Attacker Shielding Technology', { exact: true })
    .fill('8')
  await ally.getByLabel('Attacker Armour Technology', { exact: true }).fill('7')
  await ally.getByLabel('Attacker Light Fighter', { exact: true }).fill('3')
  await expectLayout(page)
  await page.getByRole('button', { name: 'Simulate' }).click()
  await expect(
    page.getByRole('region', { name: 'Simulation results' }),
  ).toBeVisible()
  const submitted = await page.evaluate(() => window.empireScene.simulations[0])
  expect(submitted?.attacker.technology).toEqual([0, 0, 0])
  expect(submitted?.attacking_allies?.[0].technology).toEqual([9, 8, 7])
  await expectLayout(page)
  await ally
    .getByLabel('Attacker Weapons Technology', { exact: true })
    .fill('10')
  await expect(
    page.getByRole('region', { name: 'Simulation results' }),
  ).toHaveCount(0)
})

for (const width of [390, 1440])
  test(`standalone simulator keeps independent unit rows stable through submission and editing at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await prepare(page, mount)
    for (const name of ['Defender ships', 'Defender defenses'])
      await expect(
        page.getByRole('region', { name, exact: true }).locator('details'),
      ).toHaveJSProperty('open', true)
    await expect(
      page.getByText('No report imported.', { exact: false }),
    ).toHaveCount(0)
    await expect(
      page.getByLabel('Defender Weapons Technology', { exact: true }),
    ).toHaveValue('0')
    await expect(
      page.getByLabel('Defender Light Fighter', { exact: true }),
    ).toHaveValue('0')
    await expect(
      page.getByLabel('Attacker Solar Satellite', { exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByLabel('Defender Ion Cannon', { exact: true }),
    ).toBeVisible()
    for (const side of ['Attacker', 'Defender']) {
      const group = page.getByRole('group', { name: side, exact: true })
      await expect(
        group.getByRole('heading', { name: 'Military', exact: true }),
      ).toBeVisible()
      await expect(
        group.getByRole('heading', { name: 'Civil', exact: true }),
      ).toBeVisible()
    }
    await expect(
      page.getByRole('region', { name: 'Attack planning', exact: true }),
    ).toHaveCount(0)
    const runButton = page.getByRole('button', {
      name: 'Simulate',
      exact: true,
    })
    await runButton.scrollIntoViewIfNeeded()
    const buttonBox = await runButton.boundingBox()
    const errorBox = await page
      .getByRole('status')
      .filter({ hasText: 'Add at least one attacking ship.' })
      .boundingBox()
    expect(errorBox!.y).toBeGreaterThanOrEqual(buttonBox!.y + buttonBox!.height)
    expect(Math.abs(errorBox!.x - buttonBox!.x)).toBeLessThan(2)
    expect(
      await runButton.evaluate((button) => {
        const box = button.getBoundingClientRect()
        const hit = document.elementFromPoint(
          box.x + box.width / 2,
          box.y + box.height / 2,
        )
        return hit === button || button.contains(hit)
      }),
    ).toBe(true)
    await page.getByLabel('Attacker Light Fighter', { exact: true }).fill('10')
    await expect(page.getByRole('button', { name: 'Simulate' })).toBeEnabled()
    await page.getByLabel('Defender Light Fighter', { exact: true }).fill('2')
    await page
      .getByLabel('Defender Weapons Technology', { exact: true })
      .fill('7')
    await expect(
      page.getByRole('button', { name: 'Assume all unknown values are zero' }),
    ).toHaveCount(0)
    const cleared = [
      'Attacker Weapons Technology',
      'Attacker Bomber',
      'Defender Shielding Technology',
      'Defender Rocket Launcher',
    ]
    for (const name of cleared)
      await page.getByLabel(name, { exact: true }).fill('')
    await page.getByRole('button', { name: 'Add defending fleet' }).click()
    const ally = page.getByRole('group', {
      name: 'Allied defending fleet 1',
      exact: true,
    })
    await ally.getByLabel('Defender Light Fighter', { exact: true }).fill('3')
    await ally
      .getByLabel('Defender Weapons Technology', { exact: true })
      .fill('')
    await ally.getByLabel('Defender Bomber', { exact: true }).fill('')
    await expect(
      page
        .getByRole('group', { name: 'Defender', exact: true })
        .getByLabel('Defender Light Fighter', { exact: true }),
    ).toHaveValue('2')
    const attackerOutcome = page.getByRole('group', {
      name: 'Attacker Light Fighter average outcome',
      exact: true,
    })
    const defenderOutcome = page.getByRole('group', {
      name: 'Defender Light Fighter average outcome',
      exact: true,
    })
    await expect(attackerOutcome).toHaveText('— remaining')
    await expect(
      page.getByText(/Average remaining units|Before defense repairs/),
    ).toHaveCount(0)
    // Results must fill reserved space without moving any draft row or input.
    const draftGeometry = () =>
      page.locator('input[id^="simulation-"]').evaluateAll((inputs) =>
        inputs.map((input) => {
          const label = (input as HTMLInputElement).labels![0]
          const row =
            label.parentElement!.parentElement!.getBoundingClientRect()
          const box = input.getBoundingClientRect()
          return [
            row.x,
            row.y + scrollY,
            row.width,
            row.height,
            box.x,
            box.width,
          ]
        }),
      )
    const beforeResults = await draftGeometry()
    await page.getByRole('button', { name: 'Simulate' }).click()
    await expect(
      page.getByRole('region', { name: 'Simulation results' }),
    ).toBeVisible()
    const submitted = await page.evaluate(
      () => window.empireScene.simulations[0],
    )
    await expect(attackerOutcome).toHaveText('8 remaining')
    await expect(defenderOutcome).toHaveText('0 remaining')
    const attackerShips = page.getByRole('region', {
      name: 'Attacker ships',
      exact: true,
    })
    await expect(
      attackerShips.getByText('Remaining', { exact: true }).first(),
    ).toBeVisible()
    await expect(attackerShips.getByText('Lost', { exact: true })).toHaveCount(
      0,
    )
    await expect(attackerOutcome.locator('strong')).toHaveText('8')
    await expect(
      page.getByRole('group', {
        name: 'Attacker Bomber average outcome',
        exact: true,
      }),
    ).toHaveText('0 remaining')
    expect(await draftGeometry()).toEqual(beforeResults)
    for (const name of cleared)
      await expect(page.getByLabel(name, { exact: true }).first()).toHaveValue(
        '0',
      )
    await expect(
      ally.getByLabel('Defender Weapons Technology', { exact: true }),
    ).toHaveValue('0')
    await expect(
      ally.getByLabel('Defender Bomber', { exact: true }),
    ).toHaveValue('0')
    expect(submitted.attacker).toEqual({
      technology: [0, 0, 0],
      units: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: 10 }],
    })
    expect(submitted.defending_allies).toEqual([
      {
        technology: [0, 0, 0],
        units: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: 3 }],
      },
    ])
    const results = page.getByRole('region', { name: 'Simulation results' })
    const cargo = results.getByRole('region', { name: 'Cargo and loot' })
    await expect(
      cargo.getByText('Avg. surviving capacity', { exact: true }),
    ).toBeVisible()
    await expect(
      cargo.getByRole('table', { name: 'Haul', exact: true }),
    ).toHaveCount(0)
    expect(submitted.defender).toEqual({
      technology: [7, 0, 0],
      units: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: 2 }],
    })
    expect(submitted.observed_resources).toBeUndefined()
    await expect(
      page.getByRole('button', { name: 'Review attack' }),
    ).toHaveCount(0)
    await results.scrollIntoViewIfNeeded()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.getByLabel('Attacker Light Fighter', { exact: true }).fill('11')
    await expect(results).toHaveCount(0)
    await expect(attackerOutcome).toHaveText('— remaining')
    await expect(defenderOutcome).toHaveText('— remaining')
    expect(await draftGeometry()).toEqual(beforeResults)
    expect(await page.evaluate(() => window.empireScene.sent)).toEqual([])
    expect(
      await page.evaluate(() => window.empireScene.detailRequests),
    ).toEqual([])
    if (width === 390) {
      await page.reload()
      await expect(page.locator('html')).toHaveAttribute(
        'data-component-ready',
        'empire',
      )
      await expect(
        page.getByLabel('Defender Light Fighter', { exact: true }),
      ).toHaveValue('0')
      expect(await page.evaluate(() => window.empireScene.sent)).toEqual([])
      expect(
        await page.evaluate(() => window.empireScene.detailRequests),
      ).toEqual([])
    }
  })

test('switching worlds preserves a manually edited defender until the new moon is explicitly imported', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 1000 })
  const home = {
    ...body,
    name: 'Home',
    inventories: [
      { item: { kind: 'Ship', id: 'LightFighter' } as const, count: '3' },
      { item: { kind: 'Defense', id: 'RocketLauncher' } as const, count: '20' },
    ],
  }
  const moon = {
    ...home,
    id: id(80),
    coordinates: {
      ...home.coordinates,
      position: home.coordinates.position + 1,
    },
    kind: 'Moon' as const,
    name: 'Watchtower',
    moon: { parent: id(81), created_at: 1000 },
    inventories: [
      { item: { kind: 'Ship', id: 'LightFighter' } as const, count: '8' },
      { item: { kind: 'Defense', id: 'RocketLauncher' } as const, count: '7' },
    ],
  }

  const prepared: EmpireSceneInput = {
    surface: 'simulation',
    catalog: observationCatalog,
    bodies: [
      home,
      {
        ...home,
        id: moon.moon.parent,
        name: 'Outpost',
        coordinates: moon.coordinates,
      },
      moon,
    ],
    research: [{ research: 'WeaponsTechnology', level: 4 }],
    simulationSamples: Array.from({ length: 10 }, (_, i) => ({
      outcome:
        i < 5
          ? 'AttackerVictory'
          : i < 7
            ? 'DefenderVictory'
            : i < 9
              ? 'Draw'
              : 'MutualDestruction',
      rounds: 2,
      moon_chance_percent: 20,
      surviving_cargo_capacity: '0',
      estimated_loot: null,
      attacker: [],
      defender: [],
      debris: {
        metal: String(i * 2_000_000_000),
        crystal: String(i * 1_000_000_000),
        deuterium: String(i * 100_000_000),
      },
    })),
  }
  await page.addInitScript((prepared) => {
    window.empireInput = prepared
  }, prepared)
  await mount('empire')
  const attacker = page.getByRole('group', { name: 'Attacker', exact: true })
  const defender = page.getByRole('group', { name: 'Defender', exact: true })
  await attacker
    .getByLabel('Attacker Light Fighter', { exact: true })
    .fill('25')
  await attacker
    .getByLabel('Attacker Weapons Technology', { exact: true })
    .fill('9')
  await defender
    .getByLabel('Defender Rocket Launcher', { exact: true })
    .fill('99')
  await page.getByText('Use my planet as defender', { exact: true }).click()
  const replace = page.getByRole('button', {
    name: 'Replace defender from current planet',
    exact: true,
  })
  await expect(page.getByLabel('Include stationed ships')).not.toBeChecked()
  await replace.focus()
  await page.keyboard.press('Enter')
  await expect(
    defender.getByLabel('Defender Weapons Technology', { exact: true }),
  ).toHaveValue('4')
  await expect(
    defender.getByLabel('Defender Rocket Launcher', { exact: true }),
  ).toHaveValue('20')
  await expect(
    defender.getByLabel('Defender Light Fighter', { exact: true }),
  ).toHaveValue('0')
  await expect(
    attacker.getByLabel('Attacker Weapons Technology', { exact: true }),
  ).toHaveValue('9')
  await expect(
    attacker.getByLabel('Attacker Light Fighter', { exact: true }),
  ).toHaveValue('25')
  await expect(
    page.getByText('Defender imported from', { exact: false }),
  ).toContainText('Planet · Home')
  await page.getByLabel('Include stationed ships').check()
  await expect(
    defender.getByLabel('Defender Light Fighter', { exact: true }),
  ).toHaveValue('0')
  await replace.click()
  await expect(
    defender.getByLabel('Defender Light Fighter', { exact: true }),
  ).toHaveValue('3')
  await defender
    .getByLabel('Defender Rocket Launcher', { exact: true })
    .fill('21')
  await page.evaluate((id) => window.selectPreparedEmpireBody(id), moon.id)
  await expect(
    page
      .getByRole('group', { name: 'Origin', exact: true })
      .getByRole('link', { name: /View origin/ }),
  ).toHaveAttribute('href', /target=moon/)
  const replaceMoon = page.getByRole('button', {
    name: 'Replace defender from current moon',
    exact: true,
  })
  await expect(replaceMoon).toBeVisible()
  await expect(
    defender.getByLabel('Defender Rocket Launcher', { exact: true }),
  ).toHaveValue('21')
  await expect(
    defender.getByLabel('Defender Light Fighter', { exact: true }),
  ).toHaveValue('3')
  await expect(
    page.getByText('Defender imported from', { exact: false }),
  ).toContainText('Planet · Home')
  await replaceMoon.click()
  await expect(
    defender.getByLabel('Defender Rocket Launcher', { exact: true }),
  ).toHaveValue('7')
  await expect(
    defender.getByLabel('Defender Light Fighter', { exact: true }),
  ).toHaveValue('8')
  await expect(
    page.getByText('Defender imported from', { exact: false }),
  ).toContainText('Moon · Watchtower')
  await page.getByRole('button', { name: 'Simulate' }).click()
  await expect(
    page.getByRole('region', { name: 'Simulation results' }),
  ).toBeVisible()
  const submitted = await page.evaluate(
    () => window.empireScene.simulations.at(-1)!,
  )
  expect(submitted?.attacker).toEqual({
    technology: [9, 0, 0],
    units: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: 25 }],
  })
  expect(submitted?.defender).toEqual({
    technology: [4, 0, 0],
    units: [
      { item: { kind: 'Ship', id: 'LightFighter' }, count: 8 },
      { item: { kind: 'Defense', id: 'RocketLauncher' }, count: 7 },
    ],
  })
  expect(submitted?.observed_resources).toBeUndefined()
  await expect(
    page.getByLabel('Moon creation target', { exact: false }),
  ).toHaveCount(0)
  const debris = page
    .getByRole('region', {
      name: 'Debris and moon creation',
      exact: true,
    })
    .getByRole('table', { name: 'Debris', exact: true })
  await expect(
    debris.getByRole('row', { name: /^Moon creation/ }).getByRole('cell'),
  ).toHaveText('0%')
  const results = page.getByRole('region', { name: 'Simulation results' })
  await expect(results.getByText('3 Draws', { exact: true })).toBeVisible()
  await expect(
    results.getByText('Average Rounds: 2', { exact: true }),
  ).toBeVisible()
  await expect(results.getByText(/mutual destruction/i)).toHaveCount(0)
  await expect(
    results.getByText(/^(Sample ranges|Losses and survivors)$/),
  ).toHaveCount(0)
  for (const [resource, value] of [
    ['Metal', '9,000'],
    ['Crystal', '4,500'],
    ['Deuterium', '450'],
  ]) {
    const row = debris.getByRole('row').filter({
      has: page.getByRole('rowheader', { name: resource, exact: true }),
    })
    await expect(row.getByRole('cell')).toHaveText(value)
    await expect(
      row.getByRole('img', { name: resource, exact: true }),
    ).toHaveCount(1)
  }
  await expect(
    debris.getByRole('row', { name: /^Recyclers/ }).getByRole('cell'),
  ).toHaveText('1 average · 2 max')
  await expect(debris.getByRole('rowheader')).toHaveText([
    'Metal',
    'Crystal',
    'Deuterium',
    'Recyclers',
    'Moon creation',
  ])
  await expectLayout(page)
  await defender
    .getByLabel('Defender Rocket Launcher', { exact: true })
    .fill('8')
  await expect(debris).toHaveCount(0)
})

test('the phone Menu includes the funded standalone simulator link', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 1000 })
  await mount('shell-menu')
  const link = page
    .getByRole('navigation', { name: 'Menu destinations' })
    .getByRole('link', { name: 'Combat Simulator', exact: true })
  await expect(link).toBeVisible()
  await expect(link).toHaveAttribute(
    'href',
    `/u/andromeda/b/${body.id}/combat-simulator`,
  )
})
