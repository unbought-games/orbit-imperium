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

async function buildingFixture(page: Page, active = false) {
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
          building: 'CrystalMine',
          target_level: 2,
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
      /Energy balance-14\s*→\s*\+13/,
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
      /Energy balance\+11\s*→\s*\+37/,
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
      release()
      await expect(
        page
          .getByRole('button', { name: 'Cancel construction', exact: true })
          .first(),
      ).toBeEnabled()
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
  await page
    .getByRole('button', { name: 'Metal Mine build details', exact: true })
    .click()
  await expect(
    page.getByRole('dialog', { name: 'Metal Mine build', exact: true }),
  ).toContainText('Need')
  await page.keyboard.press('Escape')
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
      .getByRole('button', { name: 'Metal Mine build details', exact: true })
      .click()
    await expect(
      page
        .getByRole('dialog', { name: 'Metal Mine build', exact: true })
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

test('quick build keeps inspection failures retryable and server rejection visible in the catalog', async ({
  page,
}) => {
  const fixture = await quickBuildFixture(page)
  fixture.failOptions(true)
  fixture.reject()
  await page.goto(`/u/andromeda/b/${body.id}/resources`)
  const retry = page.getByRole('button', {
    name: 'Retry Metal Mine build details',
  })
  await expect(retry).toBeEnabled()
  fixture.failOptions(false)
  await retry.click()
  await page.getByRole('button', { name: 'Build Metal Mine level 2' }).click()
  await expect(
    page.getByRole('group', { name: 'Latest action result' }),
  ).toContainText(/resources/i)
  await expect(
    page.getByRole('button', { name: 'Build Metal Mine level 2' }),
  ).toBeEnabled()
  await expect(page).toHaveURL(/\/resources$/)
  expect(fixture.sent).toHaveLength(1)
})

for (const width of [320, 390, 1440]) {
  test(`quick build keyboard, touch-sized controls and cost details at ${width}px`, async ({
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
    // The action word must remain a single line, including narrow phones.
    const textHeight = await build.evaluate((button) => {
      const text = Array.from(button.childNodes).find(
        (node) =>
          node.nodeType === Node.TEXT_NODE &&
          node.textContent?.includes('Build'),
      )!
      const range = document.createRange()
      range.selectNode(text)
      return range.getBoundingClientRect().height
    })
    expect(textHeight).toBeLessThan(25)
    await page.keyboard.press('Tab')
    const details = page.getByRole('button', {
      name: 'Metal Mine build details',
      exact: true,
    })
    await expect(details).toBeFocused()
    const popup = page.getByRole('dialog', {
      name: 'Metal Mine build',
      exact: true,
    })
    await expect(popup).toContainText('Build time')
    await expect(
      popup.getByRole('group', { name: 'Required resources' }),
    ).toContainText('60')
    await diagnosticScreenshot(page, {
      path: `test-results/quick-build-details-${width}.png`,
    })
    await page.keyboard.press('Escape')
    await expect(popup).toHaveCount(0)
    await diagnosticScreenshot(page, {
      path: `test-results/quick-build-${width}.png`,
    })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await row.click()
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
  test('tap details then build without leaving the catalog', async ({
    page,
  }) => {
    const fixture = await quickBuildFixture(page)
    await page.goto(`/u/andromeda/b/${body.id}/resources`)
    const build = page.getByRole('button', { name: 'Build Metal Mine level 2' })
    await expect(build).toBeEnabled()
    await page
      .getByRole('button', { name: 'Metal Mine build details', exact: true })
      .tap()
    await expect(
      page.getByRole('dialog', { name: 'Metal Mine build', exact: true }),
    ).toContainText('Build time')
    await page.getByRole('heading', { name: 'Resource buildings' }).tap()
    await expect(
      page.getByRole('dialog', { name: 'Metal Mine build', exact: true }),
    ).toHaveCount(0)
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
