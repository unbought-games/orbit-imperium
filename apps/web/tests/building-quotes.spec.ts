import { expect, test, type Page } from '@playwright/test'
import type { components } from '../src/contracts'
import { binding, body, id, shellFixture } from './fixtures/game'

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
    const building = request.building as keyof typeof planet.levels
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
    await expect(pane.locator('dl')).toContainText(
      'Additional operating energy (100%):13',
    )
    await expect(
      pane.getByRole('button', { name: 'Confirm upgrade', exact: true }),
    ).toBeEnabled()
    await page.screenshot({ path: `test-results/building-energy-${width}.png` })
    await pane
      .getByRole('button', { name: 'Demolish Crystal Mine', exact: true })
      .click()
    await expect(pane.locator('dl')).toContainText(
      'Operating energy saved (100%):11',
    )
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
    await expect(row).toContainText('Need 18 more')
    await expect(
      pane.getByRole('button', { name: 'Confirm upgrade', exact: true }),
    ).toBeDisabled()
    await expect(pane.locator('dl')).not.toContainText(
      'Additional operating energy',
    )
    await row.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `test-results/building-quote-${width}.png` })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
  })
}

for (const width of [320, 390, 1440]) {
  test(`storage details prioritize benefits and build action at ${width}px`, async ({
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
    await expect(current).toContainText('Level 0')
    await expect(current).toContainText('10,000 metal capacity')
    await expect(target).toContainText('20,000 metal capacity')
    const button = target.getByRole('button', { name: 'Confirm upgrade' })
    await expect(button).toHaveText('Build level 1')
    const cost = pane.getByRole('group', { name: 'Required resources' })
    await expect(
      cost.getByRole('button', { name: 'Deuterium details' }),
    ).toHaveCount(0)
    await expect(pane.getByRole('table')).toHaveCount(0)
    await expect(
      pane.getByRole('region', { name: 'Building requirements' }),
    ).toHaveCount(0)
    await expect(pane).not.toContainText('Construction possible')
    const currentBox = (await current.boundingBox())!
    const targetBox = (await target.boundingBox())!
    const costBox = (await cost.boundingBox())!
    expect(currentBox.y + currentBox.height).toBeLessThanOrEqual(targetBox.y)
    expect(targetBox.y + targetBox.height).toBeLessThanOrEqual(costBox.y)
    const benefitBox = (await target.locator(':scope > span').boundingBox())!
    const buttonBox = (await button.boundingBox())!
    expect(benefitBox.x).toBeGreaterThanOrEqual(buttonBox.x + buttonBox.width)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await pane.screenshot({ path: `test-results/storage-detail-${width}.png` })
    await pane.getByRole('link', { name: /^Back to / }).click()
    await page
      .getByRole('link', { name: 'Upgrade Crystal Mine', exact: true })
      .click()
    await expect(current).toContainText('22 crystal / hour')
    await expect(target).toContainText('48 crystal / hour')
    const teardown = pane.getByRole('button', { name: 'Demolish Crystal Mine' })
    const terms = pane.locator('details')
    expect((await teardown.boundingBox())!.y).toBeGreaterThanOrEqual(
      (await terms.boundingBox())!.y + (await terms.boundingBox())!.height,
    )
  })
}
