import { selectBody } from './fixtures/body-selector'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { expect, test, type Page } from './fixtures/test'
import type { components } from '../src/contracts'
import {
  binding,
  body,
  id,
  shellFixture,
  installGameFixture,
  refreshGame,
} from './fixtures/game'

type S = components['schemas']
const now = Date.now()

async function buildingFixture(page: Page, active = false, activeBuilding: S['BuildingId3'] = 'CrystalMine') {
  await page.clock.install({ time: now })
  const planet = structuredClone(body)
  planet.amounts = {
    metal: '1000000000',
    crystal: '1000000000',
    deuterium: '182999999',
  }
  const constructions: S['Construction3'][] = active
    ? [
        {
          id: id(10),
          body: body.id,
          building: activeBuilding,
          target_level: planet.levels[activeBuilding]! + 1,
          due_at: now + 60000,
          paid: { metal: '76000000', crystal: '38000000', deuterium: '0' },
        },
      ]
    : []
  const bootstrap = page.waitForResponse((r) =>
    r.url().endsWith('/api/v1/bootstrap'),
  )
  await shellFixture(page, {
    protocol: 4,
    bodies: [planet],
    constructions,
    catalog: [
      ...['MetalStorage', 'CrystalMine', 'MetalMine'].map((id) => ({
        key: { kind: 'Building' as const, id: id as S['BuildingId3'] },
        enabled: true,
        mobile: false,
        body_kinds: ['Planet' as const],
        requirements: [],
      })),
      {
        key: { kind: 'Building', id: 'ResearchLab' },
        enabled: true,
        mobile: false,
        body_kinds: ['Planet'],
        requirements: [],
      },
    ],
  })
  const baseline: S['BoundView4'] = (await (await bootstrap).json()).result.game
    .snapshot.view
  let completed = false
  let reads = 0
  await page.route('**/overview', (route) => {
    reads++
    return route.fulfill({
      json: {
        ...baseline,
        request_id: route.request().postDataJSON().request_id,
        sampled_at: completed
          ? baseline.sampled_at + 60000
          : baseline.sampled_at,
        as_of_ms: completed ? baseline.sampled_at + 60000 : baseline.sampled_at,
        viewer_revision: completed ? '2' : '1',
        bodies: [planet],
        constructions,
      },
    })
  })
  await page.route('**/progression-options', (route) => {
    const { context, request } = route.request().postDataJSON()
    const building = request.building as S['BuildingId3']
    const source = planet.levels[building]!
    const response: S['BoundProgressionOptions4'] = {
      protocol: 4,
      binding,
      request_id: context.request_id,
      viewer_revision: completed ? '2' : '1',
      sampled_at: now,
      as_of_ms: now,
      request,
      terms_hash: 'b'.repeat(64),
      estimates: null,
      blockers: constructions.length
        ? [
            {
              code: 'ActiveConstruction',
              requirement: null,
              required: null,
              actual: null,
              resource: null,
              unit: null,
            },
          ]
        : [],
      terms: {
        type: 'Building',
        profile_hash: baseline.profile_hash,
        body: planet.id,
        building,
        action: request.type,
        source_level: source,
        target_level: source + (request.type === 'Demolition' ? -1 : 1),
        paid: {
          metal: '200000000',
          crystal: '400000000',
          deuterium: building === 'ResearchLab' ? '200000000' : '0',
        },
        duration_ms: 57000,
        formula: 'BuildingRedesign2011',
        facilities: [],
        required_energy: '0',
        reserve_fields: 1,
      },
      building_benefit:
        building === 'MetalStorage'
          ? {
              kind: 'MetalCapacity',
              current: '10000000000',
              target: '20000000000',
            }
          : building === 'CrystalMine'
            ? {
                kind: 'CrystalPerHour',
                current: '22000000',
                target: request.type === 'Demolition' ? '0' : '48400000',
              }
            : undefined,
      building_energy: {
        current_consumption: building === 'CrystalMine' ? '11000000' : '0',
        target_consumption:
          building === 'CrystalMine'
            ? request.type === 'Demolition'
              ? '0'
              : '24200000'
            : '0',
      },
    }
    return route.fulfill({ json: response })
  })
  return {
    reads: () => reads,
    complete: () => {
      completed = true
      constructions.length = 0
      planet.levels.CrystalMine = 2
      planet.fields_reserved = 0
    },
  }
}

for (const selected of ['Crystal Mine', 'Metal Mine']) {
  test(`open ${selected} quote becomes actionable after construction completes without refresh`, async ({
    page,
  }) => {
    const fixture = await buildingFixture(page, true)
    await page.goto(`/u/andromeda/b/${body.id}/resources`)
    await page
      .getByRole('link', { name: `Upgrade ${selected}`, exact: true })
      .click()
    const pane = page.getByRole('region', { name: 'Progression quote' })
    if (selected === 'Crystal Mine')
      await expect(
        pane.getByRole('region', { name: 'Active construction' }),
      ).toBeVisible()
    else {
      await expect(pane.getByLabel('Action blockers')).toContainText(
        'Active Construction',
      )
      await expect(
        pane.getByRole('button', { name: 'Confirm upgrade', exact: true }),
      ).toBeDisabled()
    }
    const before = fixture.reads()
    // The due timestamp triggers reconciliation even if no invalidation arrives.
    // First leave the server work active to exercise delayed confirmation.
    await page.clock.fastForward(60000)
    await expect.poll(fixture.reads).toBeGreaterThan(before)
    if (selected === 'Crystal Mine')
      await expect(
        pane.getByRole('region', { name: 'Active construction' }),
      ).toBeVisible()
    else
      await expect(
        pane.getByRole('button', { name: 'Confirm upgrade', exact: true }),
      ).toBeDisabled()
    fixture.complete()
    await page.clock.fastForward(1000)
    await expect(
      pane.getByRole('button', { name: 'Confirm upgrade', exact: true }),
    ).toBeEnabled()
    await expect(
      pane.getByRole('button', { name: 'Confirm upgrade', exact: true }),
    ).toHaveText(
      selected === 'Crystal Mine' ? 'Build level 3' : 'Build level 2',
    )
  })
}

for (const width of [320, 390, 1440]) {
  test(`building quotes distinguish energy and show consistent shortages at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await buildingFixture(page)
    await page.goto(`/u/andromeda/b/${body.id}/resources`)
    await page
      .getByRole('link', { name: 'Upgrade Crystal Mine', exact: true })
      .click()
    const pane = page.getByRole('region', { name: 'Progression quote' })
    await expect(pane).not.toContainText('Construction energy required')
    await expect(pane).not.toContainText('Extra operating energy')
    await expect(pane.locator('dl')).toContainText(
      /Energy after upgrade13\s*\(-14\)/,
    )
    await expect(
      pane.getByRole('button', { name: 'Confirm upgrade', exact: true }),
    ).toBeEnabled()
    await diagnosticScreenshot(page, {
      path: `test-results/building-energy-${width}.png`,
    })
    await pane
      .getByRole('button', { name: 'Demolish Crystal Mine', exact: true })
      .click()
    await expect(pane.locator('dl')).toContainText(
      /Energy after demolition37\s*\(\+11\)/,
    )
    await expect(pane).not.toContainText('Operating energy saved')
    await page.goto(`/u/andromeda/b/${body.id}/facilities`)
    await page
      .getByRole('link', { name: 'Upgrade Research Lab', exact: true })
      .click()
    await expect(pane.getByRole('button', { name: /Demolish/ })).toHaveCount(0)
    const row = pane.getByRole('group', { name: 'Required resources' })
    await expect(row).toContainText('200')
    await row
      .getByRole('button', { name: 'Deuterium details', exact: true })
      .click()
    await expect(
      page.getByRole('dialog', { name: 'Deuterium', exact: true }),
    ).toContainText('182')
    await page.keyboard.press('Escape')
    await expect(pane.getByLabel('Missing resources')).toContainText(
      /Missing\s*18/,
    )
    await expect(
      pane.getByRole('button', { name: 'Confirm upgrade', exact: true }),
    ).toBeDisabled()
    await expect(pane.locator('dl')).not.toContainText('Extra operating energy')
    await row.scrollIntoViewIfNeeded()
    await diagnosticScreenshot(page, {
      path: `test-results/building-quote-${width}.png`,
    })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
  })
}

for (const width of [320, 390, 1440]) {
  test(`storage details show cost before benefits and build action at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await buildingFixture(page)
    await page.goto(`/u/andromeda/b/${body.id}/resources`)
    await page
      .getByRole('link', { name: 'Upgrade Metal Storage', exact: true })
      .click()
    const pane = page.getByRole('region', { name: 'Progression quote' })
    const current = pane.getByLabel('Current level and benefit')
    const target = pane.getByLabel('Target level and benefit')
    await expect(current).toHaveCount(0)
    await expect(target.getByText('No Metal Storage', { exact: true })).toHaveCount(0)
    const firstBuild = target.getByRole('heading', { name: 'First Build', exact: true })
    await expect(firstBuild).toBeVisible()
    await expect(target.locator(':scope > :first-child')).toHaveText('First Build')
    await expect(target).toContainText('Metal capacity')
    await expect(target).toContainText('20,000')
    const button = target.getByRole('button', { name: 'Confirm upgrade' })
    await expect(button).toHaveText('Build Metal Storage')
    const cost = pane.getByRole('group', { name: 'Required resources' })
    await expect(
      cost.getByRole('button', { name: 'Deuterium details' }),
    ).toHaveCount(0)
    await expect(pane.getByRole('table')).toHaveCount(0)
    await expect(
      pane.getByRole('region', { name: 'Building requirements' }),
    ).toHaveCount(0)
    await expect(pane).not.toContainText('Construction possible')
    await expect(target.locator('dl > div').first()).toContainText('Build cost')
    const benefit = target
      .locator('dl > div')
      .filter({ has: page.getByText('Metal capacity', { exact: true }) })
    // Read every rectangle in the same browser task: route-focus scrolling
    // between separate boundingBox calls can mix viewport coordinate systems.
    const [headingBox, targetBox, costBox, benefitBox, buttonBox] =
      await page.evaluate(
        (elements) =>
          elements.map((element) => {
            if (!element) throw new Error('Missing storage layout element')
            const { y, height } = element.getBoundingClientRect()
            return { y, height }
          }),
        await Promise.all(
          [firstBuild, target, cost, benefit, button].map((locator) =>
            locator.elementHandle(),
          ),
        ),
      )
    expect(costBox.y).toBeGreaterThanOrEqual(targetBox.y)
    expect(headingBox.y).toBe(targetBox.y)
    expect(headingBox.y + headingBox.height).toBeLessThan(costBox.y)
    expect(costBox.y + costBox.height).toBeLessThanOrEqual(benefitBox.y)
    expect(buttonBox.y).toBeGreaterThanOrEqual(benefitBox.y + benefitBox.height)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await diagnosticScreenshot(pane, {
      path: `test-results/storage-detail-${width}.png`,
    })
    await pane.getByRole('link', { name: /^Back to / }).click()
    await page
      .getByRole('link', { name: 'Upgrade Crystal Mine', exact: true })
      .click()
    await expect(current).toContainText('22 / h')
    await expect(target).toContainText('48 / h')
    const teardown = pane.getByRole('button', { name: 'Demolish Crystal Mine' })
    expect((await teardown.boundingBox())!.y).toBeGreaterThanOrEqual(
      (await target
        .getByRole('button', { name: 'Confirm upgrade' })
        .boundingBox())!.y,
    )
  })
}

test('a pending building quote labels its disabled action as loading', async ({
  page,
}) => {
  await buildingFixture(page)
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/progression-options', async (route) => {
    await gate
    await route.fallback()
  })
  try {
    await page.goto(`/u/andromeda/b/${body.id}/resources/metal-mine`)
    const action = page.getByRole('button', {
      name: 'Confirm upgrade',
      exact: true,
    })
    await expect(action).toBeDisabled()
    await expect(action).toHaveText('Loading…')
    release()
    await expect(action).toBeEnabled()
    await expect(action).toHaveText('Build level 2')
  } finally {
    release()
  }
})

async function quickBuildFixture(page: Page) {
  await page.clock.install({ time: now })
  const planets = [
    structuredClone(body),
    {
      ...structuredClone(body),
      id: id(6),
      coordinates: { galaxy: 1, system: 2, position: 3 },
    },
  ]
  const constructions: S['Construction3'][] = []
  const sent: S['CommandEnvelopeV3'][] = []
  const blockers: S['BoundProgressionOptions3']['blockers'] = []
  let revision = 1
  let optionsGate: Promise<void> | null = null
  let commandGate: Promise<void> | null = null
  let rejected = false
  let failOptions = false
  let queries = 0
  await installGameFixture(page, {
    bodies: planets,
    constructions,
    viewerRevision: () => String(revision),
    sampledAt: now,
    catalog: [
      'MetalMine',
      'CrystalMine',
      'DeuteriumSynthesizer',
      'RoboticsFactory',
    ].map((building) => ({
      key: { kind: 'Building', id: building as S['BuildingId3'] },
      enabled: true,
      mobile: false,
      body_kinds: ['Planet'],
      requirements: [],
    })),
  })
  await page.route('**/progression-options', async (route) => {
    const { context, request } = route.request().postDataJSON()
    queries++
    const planet = planets.find((planet) => planet.id === request.body)!
    const source =
      planet.levels[request.building as keyof typeof planet.levels]!
    const quote: S['BoundProgressionOptions3'] = {
      protocol: 3,
      binding,
      request_id: context.request_id,
      viewer_revision: String(revision),
      sampled_at: now,
      as_of_ms: now,
      request,
      terms_hash: 'b'.repeat(64),
      estimates: null,
      blockers: structuredClone(blockers),
      terms: {
        type: 'Building',
        profile_hash: 'a'.repeat(64),
        body: planet.id,
        building: request.building,
        action: 'Upgrade',
        source_level: source,
        target_level: source + 1,
        paid: { metal: '60000000', crystal: '15000000', deuterium: '0' },
        duration_ms: 60000,
        formula: 'BuildingRedesign2011',
        facilities: [],
        required_energy: '0',
        reserve_fields: 1,
      },
    }
    if (optionsGate) await optionsGate
    if (failOptions) return route.abort()
    await route.fulfill({ json: quote })
  })
  await page.route('**/commands', async (route) => {
    const envelope: S['CommandEnvelopeV3'] = route.request().postDataJSON()
    sent.push(envelope)
    if (commandGate) await commandGate
    if (!rejected && envelope.command.type === 'StartUpgrade') {
      constructions.push({
        id: id(90),
        body: envelope.command.body,
        building: envelope.command.building,
        target_level:
          planets.find((p) => p.id === envelope.command.body)!.levels[
            envelope.command.building
          ]! + 1,
        due_at: now + 60000,
        paid: { metal: '60000000', crystal: '15000000', deuterium: '0' },
      })
      revision++
    }
    await route.fulfill({
      json: {
        protocol: 3,
        binding,
        command_id: envelope.command_id,
        admitted_at: now,
        executed_at: now,
        ...(rejected
          ? { status: 'Rejected', code: 'InsufficientResources' }
          : {
              status: 'Committed',
              result_ids: [id(90)],
              minimum_viewer_revision: String(revision),
            }),
      },
    })
  })
  return {
    planets,
    constructions,
    sent,
    blockers,
    queries: () => queries,
    gateOptions: (gate: Promise<void> | null) => {
      optionsGate = gate
    },
    gateCommand: (gate: Promise<void> | null) => {
      commandGate = gate
    },
    reject: () => {
      rejected = true
    },
    failOptions: (fail: boolean) => {
      failOptions = fail
    },
    refresh: async () => {
      revision++
      await refreshGame(page)
    },
  }
}

for (const [catalog, building] of [
  ['resources', 'Metal Mine'],
  ['facilities', 'Robotics Factory'],
] as const) {
  test(`quick build submits once from ${catalog} and retains progress and row navigation`, async ({
    page,
  }) => {
    const fixture = await quickBuildFixture(page)
    await page.clock.pauseAt(now + 1000)
    let release!: () => void
    fixture.gateCommand(
      new Promise<void>((resolve) => {
        release = resolve
      }),
    )
    try {
      await page.goto(`/u/andromeda/b/${body.id}/${catalog}`)
      const build = page.getByRole('button', {
        name: new RegExp(`^Build ${building} level`),
      })
      await expect(build).toBeEnabled()
      // Deliberately dispatch two activations within one browser task.
      await build.evaluate((button) => {
        ;(button as HTMLButtonElement).click()
        ;(button as HTMLButtonElement).click()
      })
      await expect.poll(() => fixture.sent.length).toBe(1)
      expect(fixture.sent[0].command).toMatchObject({
        type: 'StartUpgrade',
        body: body.id,
        building: building.replaceAll(' ', ''),
        expected_terms_hash: 'b'.repeat(64),
      })
      await expect(page).toHaveURL(new RegExp(`/${catalog}$`))
      const row = page.getByRole('link', {
        name: `Upgrade ${building}`,
        exact: true,
      })
      await expect(row.getByLabel('Construction progress')).toContainText(
        'Confirming',
      )
      await expect(build).toHaveCount(0)
      const control = page.getByRole('group', {
        name: `${building} quick build`,
      })
      await page.clock.runFor(250)
      await expect(
        control.getByRole('img', { name: 'Build requested; confirming' }),
      ).toHaveCSS('opacity', '1')
      for (const width of [390, 1440]) {
        await page.setViewportSize({
          width,
          height: width === 390 ? 844 : 1000,
        })
        await expect(control).toHaveAttribute('data-phase', 'check')
        await diagnosticScreenshot(page, {
          path: `test-results/${catalog}-quick-build-check-${width}.png`,
        })
      }
      release()
      await expect(
        page
          .getByRole('button', { name: 'Cancel construction', exact: true })
          .first(),
      ).toBeEnabled()
      await page.clock.runFor(3000)
      await expect(control).toHaveAttribute('data-phase', 'countdown')
      await expect(control.getByLabel(`${building} time remaining`)).toHaveCSS(
        'opacity',
        '1',
      )
      for (const width of [390, 1440]) {
        await page.setViewportSize({
          width,
          height: width === 390 ? 844 : 1000,
        })
        await diagnosticScreenshot(page, {
          path: `test-results/${catalog}-quick-build-countdown-${width}.png`,
        })
      }
      await row.click()
      await expect(
        page.getByRole('region', { name: 'Active construction' }),
      ).toBeVisible()
      expect(fixture.sent).toHaveLength(1)
    } finally {
      release()
    }
  })
}

test('quick build follows live affordability without requerying and confirmed completion', async ({
  page,
}) => {
  const fixture = await quickBuildFixture(page)
  fixture.planets[0].amounts.metal = '59999999'
  await page.goto(`/u/andromeda/b/${body.id}/resources`)
  const build = page.getByRole('button', {
    name: 'Build Metal Mine level 2',
    exact: true,
  })
  await expect(build).toBeDisabled()
  await expect(build).toHaveAccessibleDescription('Build requirements not met')
  await build.evaluate((button) => (button as HTMLButtonElement).click())
  await expect(page).toHaveURL(/\/resources$/)
  expect(fixture.sent).toHaveLength(0)
  const before = fixture.queries()
  fixture.planets[0].amounts.metal = '60000000'
  await fixture.refresh()
  await expect(build).toBeEnabled()
  expect(fixture.queries()).toBe(before)
  fixture.planets[0].amounts.metal = '0'
  await fixture.refresh()
  await expect(build).toBeDisabled()
  fixture.planets[0].amounts.metal = '1000000000'
  fixture.constructions.push({
    id: id(90),
    body: body.id,
    building: 'CrystalMine',
    target_level: 2,
    due_at: now + 60000,
    paid: { metal: '0', crystal: '0', deuterium: '0' },
  })
  await fixture.refresh()
  await expect(
    page.getByRole('button', { name: 'Build Metal Mine', exact: true }),
  ).toBeDisabled()
  fixture.constructions.length = 0
  fixture.planets[0].levels.CrystalMine = 2
  await fixture.refresh()
  await expect(build).toBeEnabled()
  await expect(
    page.getByRole('button', {
      name: 'Build Crystal Mine level 3',
      exact: true,
    }),
  ).toBeEnabled()
  expect(fixture.sent).toHaveLength(0)
})

for (const code of [
  'PrerequisiteMissing',
  'NoFreeField',
  'ActiveConstruction',
] as const) {
  test(`quick build explains server restriction ${code}`, async ({ page }) => {
    const fixture = await quickBuildFixture(page)
    fixture.blockers.push({
      code,
      requirement: null,
      required: null,
      actual: null,
      resource: null,
      unit: null,
    })
    await page.goto(`/u/andromeda/b/${body.id}/resources`)
    await expect(
      page.getByRole('button', { name: 'Build Metal Mine level 2' }),
    ).toBeDisabled()
    await page
      .getByRole('link', { name: 'Upgrade Metal Mine', exact: true })
      .click()
    await expect(
      page
        .getByRole('region', { name: 'Progression quote' })
        .getByLabel('Action blockers'),
    ).toContainText(code.replace(/([a-z])([A-Z])/g, '$1 $2'))
    expect(fixture.sent).toHaveLength(0)
  })
}

test('quick build discards delayed quotes after switching planets', async ({
  page,
}) => {
  const fixture = await quickBuildFixture(page)
  let release!: () => void
  fixture.gateOptions(
    new Promise<void>((resolve) => {
      release = resolve
    }),
  )
  try {
    await page.goto(`/u/andromeda/b/${body.id}/resources`)
    await expect.poll(fixture.queries).toBeGreaterThan(0)
    await selectBody(page, id(6))
    await expect(
      page.getByRole('button', { name: 'Build Metal Mine', exact: true }),
    ).toBeDisabled()
    fixture.gateOptions(null)
    release()
    const build = page.getByRole('button', {
      name: 'Build Metal Mine level 2',
      exact: true,
    })
    await expect(build).toBeEnabled()
    await build.click()
    await expect.poll(() => fixture.sent.length).toBe(1)
    expect(fixture.sent[0].command).toMatchObject({ body: id(6) })
    await expect(page).toHaveURL(new RegExp(`/b/${id(6)}/resources$`))
  } finally {
    release()
  }
})

test('quick build stays disabled on inspection failure and keeps server rejection visible', async ({
  page,
}) => {
  const fixture = await quickBuildFixture(page)
  fixture.failOptions(true)
  fixture.reject()
  await page.goto(`/u/andromeda/b/${body.id}/resources`)
  const build = page.getByRole('button', {
    name: 'Build Metal Mine',
    exact: true,
  })
  await expect(build).toBeDisabled()
  await expect(build).toHaveAccessibleDescription(
    'Unable to inspect this action. Check your connection and try again.',
  )
  await build.evaluate((button) => (button as HTMLButtonElement).click())
  expect(fixture.sent).toHaveLength(0)
  await page
    .getByRole('link', { name: 'Upgrade Metal Mine', exact: true })
    .click()
  const retry = page.getByRole('button', { name: 'Retry', exact: true })
  await expect(retry).toBeEnabled()
  fixture.failOptions(false)
  await retry.click()
  await expect(
    page.getByRole('button', { name: 'Confirm upgrade' }),
  ).toBeEnabled()
  await page.getByRole('link', { name: /^Back to / }).click()
  await page.getByRole('button', { name: 'Build Metal Mine level 2' }).click()
  await expect(
    page.getByRole('group', { name: 'Build problem' }),
  ).toContainText(/resources/i)
  await expect(
    page.getByRole('button', { name: 'Build Metal Mine level 2' }),
  ).toBeEnabled()
  await expect(page).toHaveURL(/\/resources$/)
  expect(fixture.sent).toHaveLength(1)
})

for (const width of [320, 390, 1440]) {
  test(`quick build stays inside the row with keyboard and touch-sized controls at ${width}px`, async ({
    page,
  }) => {
    const fixture = await quickBuildFixture(page)
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(`/u/andromeda/b/${body.id}/resources`)
    const row = page.getByRole('link', {
      name: 'Upgrade Metal Mine',
      exact: true,
    })
    const build = page.getByRole('button', { name: 'Build Metal Mine level 2' })
    await expect(build).toBeEnabled()
    await row.focus()
    await page.keyboard.press('Tab')
    await expect(build).toBeFocused()
    const box = (await build.boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.width).toBeGreaterThanOrEqual(44)
    await expect(build).toHaveText('')
    await expect(build).toHaveAccessibleName('Build Metal Mine level 2')
    await expect(build).toHaveAttribute('title', 'Build Metal Mine level 2')
    await expect(build).toHaveAttribute('data-button-variant', 'ghost')
    await expect(
      page.getByRole('button', { name: /build details/ }),
    ).toHaveCount(0)
    const rowBox = (await row.boundingBox())!
    expect(box.x).toBeGreaterThan(rowBox.x)
    expect(box.x + box.width).toBeLessThanOrEqual(rowBox.x + rowBox.width)
    expect(box.y).toBeGreaterThanOrEqual(rowBox.y)
    expect(box.y + box.height).toBeLessThanOrEqual(rowBox.y + rowBox.height)
    // A sibling action avoids invalid nested buttons/links and preserves tab order.
    await expect(row.getByRole('button')).toHaveCount(0)
    await page.keyboard.press('Tab')
    await expect(
      page.getByRole('link', { name: 'Upgrade Crystal Mine', exact: true }),
    ).toBeFocused()
    await diagnosticScreenshot(page, {
      path: `test-results/quick-build-${width}.png`,
    })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    // Even the blank far-right edge belongs to the full-row detail link.
    await row.click({ position: { x: rowBox.width - 3, y: rowBox.height / 2 } })
    await expect(
      page.getByRole('button', { name: 'Confirm upgrade' }),
    ).toBeEnabled()
    expect(fixture.sent).toHaveLength(0)
  })
}

test('quick build prevents competing row commands before the first receipt', async ({
  page,
}) => {
  const fixture = await quickBuildFixture(page)
  let release!: () => void
  fixture.gateCommand(
    new Promise<void>((resolve) => {
      release = resolve
    }),
  )
  try {
    await page.goto(`/u/andromeda/b/${body.id}/resources`)
    const first = page.getByRole('button', { name: 'Build Metal Mine level 2' })
    const second = page.getByRole('button', {
      name: 'Build Crystal Mine level 2',
    })
    await expect(first).toBeEnabled()
    await expect(second).toBeEnabled()
    await page.evaluate(
      ([one, two]) => {
        one!.click()
        two!.click()
      },
      [await first.elementHandle(), await second.elementHandle()],
    )
    await expect.poll(() => fixture.sent.length).toBe(1)
    await expect(
      page.getByRole('button', { name: 'Build Crystal Mine', exact: true }),
    ).toBeDisabled()
  } finally {
    release()
  }
})

test.describe('touch quick build', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } })
  test('tap the row for details and its ghost button to build', async ({
    page,
  }) => {
    const fixture = await quickBuildFixture(page)
    await page.goto(`/u/andromeda/b/${body.id}/resources`)
    const build = page.getByRole('button', { name: 'Build Metal Mine level 2' })
    await expect(build).toBeEnabled()
    await page
      .getByRole('link', { name: 'Upgrade Metal Mine', exact: true })
      .tap()
    await expect(
      page.getByRole('button', { name: 'Confirm upgrade' }),
    ).toBeEnabled()
    expect(fixture.sent).toHaveLength(0)
    await page.getByRole('link', { name: /^Back to / }).tap()
    await expect(build).toBeEnabled()
    await build.tap()
    await expect.poll(() => fixture.sent.length).toBe(1)
    await expect(page).toHaveURL(/\/resources$/)
  })
})

test('keyboard activation builds from the catalog', async ({ page }) => {
  const fixture = await quickBuildFixture(page)
  await page.goto(`/u/andromeda/b/${body.id}/resources`)
  const build = page.getByRole('button', { name: 'Build Metal Mine level 2' })
  await expect(build).toBeEnabled()
  await build.focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => fixture.sent.length).toBe(1)
  await expect(page).toHaveURL(/\/resources$/)
})

for (const response of ['early', 'late', 'rejected'] as const) {
  test(`quick build fades through a three-second acknowledgment with ${response} confirmation`, async ({
    page,
  }) => {
    const fixture = await quickBuildFixture(page)
    await page.clock.pauseAt(now + 1000)
    await page.setViewportSize({ width: 390, height: 844 })
    let release!: () => void
    fixture.gateCommand(
      new Promise<void>((resolve) => {
        release = resolve
      }),
    )
    if (response === 'rejected') fixture.reject()
    try {
      await page.goto(`/u/andromeda/b/${body.id}/resources`)
      const build = page.getByRole('button', {
        name: 'Build Solar Plant level 2',
        exact: true,
      })
      const control = page.getByRole('group', {
        name: 'Solar Plant quick build',
      })
      const row = page.getByRole('link', {
        name: 'Upgrade Solar Plant',
        exact: true,
      })
      await expect(build).toBeEnabled()
      await build.click()
      await expect(control).toHaveAttribute('data-phase', 'check')
      await expect.poll(() => fixture.sent.length).toBe(1)
      await expect(
        page.getByRole('button', { name: 'Build Metal Mine', exact: true }),
      ).toBeDisabled()
      await expect(
        page.getByRole('group', { name: 'Latest action result' }),
      ).toHaveCount(0)
      const target = row.getByLabel('Target level 2')
      await expect(target).toHaveText('Level 2')
      await expect(target).toHaveCSS('font-weight', '700')
      await expect(row.getByLabel('Construction progress')).toContainText(
        'Level 1 → Level 2',
      )
      const titleBox = (await row
        .getByText('Solar Plant', { exact: true })
        .boundingBox())!
      const targetBox = (await target.boundingBox())!
      expect(targetBox.y).toBeGreaterThan(titleBox.y)
      expect(targetBox.x).toBeGreaterThan(titleBox.x)
      const check = control.getByRole('img', {
        name: 'Build requested; confirming',
      })
      await expect(check).toHaveCSS('transition-duration', '0.18s')
      if (response === 'early') {
        release()
        await expect(
          control.getByRole('img', { name: 'Construction started' }),
        ).toBeVisible()
      }
      await page.clock.runFor(2750)
      await expect(control).toHaveAttribute('data-phase', 'check')
      await diagnosticScreenshot(page, {
        path: `test-results/quick-build-check-${response}.png`,
      })
      if (response === 'rejected') {
        release()
        await expect(control).toHaveAttribute('data-phase', 'hammer')
        await expect(
          page.getByRole('group', { name: 'Build problem' }),
        ).toContainText(/resources/i)
        await expect(build).toBeEnabled()
      } else {
        await page.clock.runFor(250)
        await expect(control).toHaveAttribute(
          'data-phase',
          response === 'late' ? 'pending' : 'countdown',
        )
        if (response === 'late') {
          await page.clock.runFor(5000)
          await expect(control).toHaveAttribute('data-phase', 'pending')
          await expect(
            page.getByRole('button', { name: 'Build Metal Mine', exact: true }),
          ).toBeDisabled()
          release()
          await expect(control).toHaveAttribute('data-phase', 'countdown')
        }
        await page.clock.runFor(250)
        await expect(
          control.getByLabel('Solar Plant time remaining'),
        ).toContainText(/\d+s/)
        await expect(
          control.getByLabel('Solar Plant time remaining'),
        ).toHaveCSS('opacity', '1')
        await expect(
          page.getByRole('link', { name: /^Solar Plant · Level 2/ }),
        ).toContainText(
          (await control
            .getByLabel('Solar Plant time remaining')
            .textContent())!,
        )
        await diagnosticScreenshot(page, {
          path: `test-results/quick-build-countdown-${response}.png`,
        })
        if (response === 'early') {
          await page.setViewportSize({ width: 1440, height: 1000 })
          await diagnosticScreenshot(page, {
            path: 'test-results/quick-build-countdown-desktop.png',
          })
        }
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await expect(
          control.getByLabel('Solar Plant time remaining'),
        ).toHaveCSS('transition-duration', '0s')
      }
      await expect(
        page.getByRole('group', { name: 'Latest action result' }),
      ).toHaveCount(0)
      expect(fixture.sent).toHaveLength(1)
    } finally {
      release()
    }
  })
}

// Authoritative server projections deliberately differ from rated output and
// from current live output, so swapping any of them is observable.
for (const width of [390, 1440]) {
  for (const scenario of ['fusion-first', 'fusion-fuel-limited', 'crystal-active', 'crystal-demolition'] as const) {
    test(`${scenario} preserves the target forecast at ${width}px`, async ({ page }) => {
      const height = width === 390 ? 844 : 1000
      await page.clock.install({ time: now })
      await page.setViewportSize({ width, height })
      const fusion = scenario.startsWith('fusion')
      const limited = scenario === 'fusion-fuel-limited'
      const demolition = scenario === 'crystal-demolition'
      const building = fusion ? 'FusionReactor' : 'CrystalMine'
      const planet = structuredClone(body)
      planet.capacity = { metal: '100000000000', crystal: '100000000000', deuterium: '100000000000' }
      planet.levels.FusionReactor = 0
      planet.levels.CrystalMine = 13
      planet.amounts = { metal: '50000000000', crystal: '50000000000', deuterium: limited ? '0' : '10000000000' }
      planet.energy = { supply: '100000000', demand: '134000000', utilization: '746268' }
      const targetLevel = fusion ? 1 : demolition ? 12 : 14
      const constructions: S['Construction3'][] = fusion ? [] : [{
        id: id(20), body: planet.id, building, target_level: targetLevel,
        due_at: now + 3000000,
        paid: { metal: '21617000000', crystal: '10808000000', deuterium: '0' },
      }]
      let revision = '1'
      await shellFixture(page, {
        protocol: 4, bodies: [planet], constructions, viewerRevision: () => revision,
        missions: { fleets: [], incoming: [], score_value_micro: '0', fleet_slots: '1' },
        catalog: [{ key: { kind: 'Building', id: building }, enabled: true, mobile: false, body_kinds: ['Planet'], requirements: [] }],
        production: [{
          body: planet.id, settings_revision: '1',
          settings: { metal_mine: 100, crystal_mine: 100, deuterium_synthesizer: 100, solar_plant: 100, fusion_reactor: limited ? 50 : 100, solar_satellite: 100 },
          editable: [], gross_per_hour: { metal: '1000000000', crystal: '2689000000', deuterium: '8000000' },
          fuel_deuterium_per_hour: '0', net_deuterium_per_hour: { sign: 'Nonnegative', magnitude: '8000000' },
          energy_supply: '100000000', energy_demand: '134000000', utilization: '746268', fuel_utilization: '1000000',
        }],
      })
      const requests: string[] = []
      await page.route('**/progression-options', async route => {
        const { context, request } = route.request().postDataJSON()
        requests.push(request.type)
        const current = {
          energy_supply: '100000000', energy_demand: '134000000', utilization: '746268',
          fusion_supply: '0', fuel_deuterium_per_hour: '0', fuel_utilization: '1000000',
          net_deuterium_per_hour: '8000000', metal_per_hour: '1000000000', crystal_per_hour: '2689000000',
        }
        const response: S['BoundProgressionOptions4'] = {
          protocol: 4, binding, request_id: context.request_id, viewer_revision: revision,
          sampled_at: now, as_of_ms: now, request, terms_hash: 'b'.repeat(64), estimates: null,
          blockers: constructions.length ? [{ code: 'ActiveConstruction', requirement: null, required: null, actual: null, resource: null, unit: null }] : [],
          terms: {
            type: 'Building', profile_hash: 'a'.repeat(64), body: planet.id, building, action: request.type,
            source_level: planet.levels[building]!, target_level: planet.levels[building]! + (request.type === 'Demolition' ? -1 : 1),
            paid: { metal: '900000000', crystal: '360000000', deuterium: '180000000' },
            duration_ms: 30000, formula: 'BuildingRedesign2011', facilities: [], required_energy: '0', reserve_fields: 1,
          },
          building_benefit: fusion ? { kind: 'Energy', current: '0', target: '32000000' } : { kind: 'CrystalPerHour', current: '2700000000', target: '3300000000' },
          building_energy: { current_consumption: fusion ? '0' : '100000000', target_consumption: fusion ? '0' : demolition ? '70000000' : '183000000' },
          building_production: { current, target: {
            ...current,
            energy_supply: fusion ? limited ? '108000000' : '132000000' : '100000000',
            energy_demand: fusion ? '134000000' : demolition ? '104000000' : '217000000',
            crystal_per_hour: fusion ? '2689000000' : demolition ? '2400000000' : '3045000000',
            fusion_supply: fusion ? limited ? '8000000' : '32000000' : '0',
            fuel_deuterium_per_hour: fusion ? limited ? '8000000' : '33000000' : '0',
            fuel_utilization: limited ? '500000' : '1000000',
          } },
        }
        await route.fulfill({ json: response })
      })
      await page.goto(`/u/andromeda/b/${planet.id}/resources/${fusion ? 'fusion-reactor' : 'crystal-mine'}`)
      const section = fusion ? page.getByLabel('Target level and benefit') : page.getByRole('region', { name: 'Active construction', exact: true })
      const energyLabel = fusion ? 'Energy after build' : demolition ? 'Energy after demolition' : 'Energy after upgrade'
      const energy = section.getByRole('button', { name: `${energyLabel} details`, exact: true })
      await expect(energy).toHaveText(fusion ? limited ? '-26 (+8)' : '-2 (+32)' : demolition ? '-4 (+30)' : '-117 (-83)')
      if (fusion) {
        const output = section.locator('dl > div').filter({ has: page.getByText('Energy supplied', { exact: true }) })
        await expect(output.getByTitle('New total', { exact: true })).toHaveText(limited ? '8' : '32')
        await expect(section.locator('dl > div').filter({ has: page.getByText('Deuterium fuel / hour', { exact: true }) })).toHaveText(limited ? /0 → 8/ : /0 → 33/)
      } else {
        await expect(section.getByRole('heading')).toHaveText(`${demolition ? 'Tearing down' : 'Upgrading'} to level ${targetLevel}`)
        const output = section.locator('dl > div').filter({ has: page.getByText('Planet output', { exact: true }) })
        await expect(output.getByTitle('Current output', { exact: true })).toHaveText('2,689 / h')
        await expect(output.getByTitle('New total', { exact: true })).toHaveText(demolition ? '2,400 / h' : '3,045 / h')
        await expect(page.getByLabel('Current level and benefit')).toContainText('Level 13')
        await expect(page.getByLabel('Current level and benefit')).toContainText('2,689 / h')
        await expect(section.getByRole('button', { name: 'Completion time details' })).toHaveText('50m')
        await expect(section.getByRole('button', { name: 'Cancel construction', exact: true })).toBeEnabled()
        await expect(page.getByRole('button', { name: 'Confirm upgrade', exact: true })).toHaveCount(0)
        expect(requests.at(-1)).toBe(demolition ? 'Demolition' : 'Upgrade')
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.clock.runFor(1000)
      await page.evaluate(() => window.scrollTo(0, 0))
      await diagnosticScreenshot(page, { path: `test-results/${scenario}-${width}x${height}.png` })
      await energy.click()
      const details = page.getByRole('dialog', { name: energyLabel, exact: true })
      await expect(details).toContainText('Current balance: -34')
      await diagnosticScreenshot(page, { path: `test-results/${scenario}-energy-details-${width}x${height}.png`, fullPage: false })
      await page.keyboard.press('Escape')
      if (!fusion) {
        await section.getByRole('button', { name: 'Cancel construction', exact: true }).click()
        await expect(page.getByRole('dialog', { name: 'Cancel construction?', exact: true })).toContainText(`Crystal Mine to level ${targetLevel}`)
        await diagnosticScreenshot(page, { path: `test-results/${scenario}-cancel-${width}x${height}.png`, fullPage: false })
        await page.keyboard.press('Escape')
        await expect(energy).toBeVisible()
        constructions.length = 0
        planet.levels.CrystalMine = targetLevel
        revision = '2'
        await refreshGame(page)
        await expect(section).toHaveCount(0)
        await expect(page.getByLabel('Current level and benefit')).toContainText(`Level ${targetLevel}`)
        await expect(page.getByRole('heading', { name: `Next · level ${targetLevel + 1}`, exact: true })).toBeVisible()
      }
    })
  }
}

for (const width of [390, 1440]) {
  test(`active forecast failure preserves cancellation and retries at ${width}px`, async ({ page }) => {
    const height = width === 390 ? 844 : 1000
    await page.setViewportSize({ width, height })
    await buildingFixture(page, true)
    const fail = (route: import('@playwright/test').Route) => route.fulfill({ status: 503 })
    await page.route('**/progression-options', fail)
    await page.goto(`/u/andromeda/b/${body.id}/resources/crystal-mine`)
    const active = page.getByRole('region', { name: 'Active construction', exact: true })
    await expect(active.getByRole('alert')).toContainText('Unable to inspect this action')
    await expect(active.getByRole('button', { name: 'Cancel construction', exact: true })).toBeEnabled()
    await expect(active.getByRole('button', { name: 'Completion time details', exact: true })).toBeVisible()
    await page.clock.runFor(1000)
    await page.evaluate(() => window.scrollTo(0, 0))
    await diagnosticScreenshot(page, { path: `test-results/crystal-active-error-${width}x${height}.png`, fullPage: false })
    await page.unroute('**/progression-options', fail)
    await active.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(active.getByRole('alert')).toHaveCount(0)
    await expect(active.getByRole('button', { name: 'Energy after upgrade details', exact: true })).toBeVisible()
  })
}

for (const width of [390, 1440]) {
  test(`active storage retains its capacity benefit at ${width}px`, async ({ page }) => {
    const height = width === 390 ? 844 : 1000
    await page.setViewportSize({ width, height })
    await buildingFixture(page, true, 'MetalStorage')
    await page.goto(`/u/andromeda/b/${body.id}/resources/metal-storage`)
    const active = page.getByRole('region', { name: 'Active construction', exact: true })
    await expect(active.getByRole('heading')).toHaveText('Upgrading to level 1')
    await expect(active.getByTitle('New total', { exact: true })).toHaveText('20,000')
    await page.clock.runFor(1000)
    await page.evaluate(() => window.scrollTo(0, 0))
    await diagnosticScreenshot(page, { path: `test-results/storage-active-${width}x${height}.png` })
  })
}

test('active facility inspection follows its actual target after direct navigation', async ({ page }) => {
  await buildingFixture(page, true, 'ResearchLab')
  const inspection = page.waitForRequest(request => request.url().endsWith('/progression-options') && request.postDataJSON().request.building === 'ResearchLab')
  await page.goto(`/u/andromeda/b/${body.id}/facilities/research-lab`)
  expect((await inspection).postDataJSON().request.type).toBe('Upgrade')
  const active = page.getByRole('region', { name: 'Active construction', exact: true })
  await expect(active.getByRole('heading')).toHaveText('Upgrading to level 1')
  await expect(active.getByRole('button', { name: 'Cancel construction', exact: true })).toBeEnabled()
  await expect(active.getByText('Completion forecast unavailable.', { exact: true })).toHaveCount(0)
})
