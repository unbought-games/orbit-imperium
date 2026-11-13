import { readFileSync } from 'node:fs'
import { test, expect } from './fixtures/test'
import { shellFixture, body, binding, id } from './fixtures/game'
import { routeProgressionOptions } from './fixtures/progression-options'
import { withProgressionResponse } from './fixtures/responses'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import type { components } from '../src/contracts'

type S = components['schemas']
const research = 'IntergalacticResearchNetwork' as const
const definition = JSON.parse(
  readFileSync('rules/content/intergalactic-research-network.json', 'utf8'),
)
const baseline = JSON.parse(readFileSync('rules/mvp-v1-slice-13.json', 'utf8'))
const remote = {
  ...body,
  id: id(6),
  name: 'Kepler',
  coordinates: { galaxy: 2, system: 10, position: 8 },
  levels: { ...body.levels, ResearchLab: 12 },
}
const cost = {
  metal: '480000000000',
  crystal: '800000000000',
  deuterium: '320000000000',
}

async function setup(page: Parameters<typeof shellFixture>[0], locked = false) {
  const home = {
    ...body,
    name: 'Home',
    levels: { ...body.levels, ResearchLab: locked ? 9 : 10 },
    amounts: {
      metal: '10000000000000',
      crystal: '10000000000000',
      deuterium: '10000000000000',
    },
  }
  const options: Parameters<typeof shellFixture>[1] = {
    protocol: 4,
    bodies: [home, remote],
    fleets: [],
    missions: {
      fleets: [],
      incoming: [],
      score_value_micro: '0',
      fleet_slots: '1',
    },
    catalog: baseline.catalog.map((entry: S['CatalogEntry3']) =>
      entry.key.id === research
        ? { ...entry, enabled: true, requirements: definition.requirements }
        : entry.key.id === 'ResearchLab'
          ? {
              ...entry,
              technical_data: {
                bonuses: [],
                storage_capacities: null,
                combat: null,
                facts: [
                  {
                    label: 'Research time',
                    subject: null,
                    value:
                      'Research duration is divided by (1 + the sum of contributing lab levels), rounded down to whole seconds with a one-second minimum. Each completed Intergalactic Research Network level links one additional eligible planet. Every lab must individually meet the research requirement. Lab upgrades and demolition anywhere in your empire cannot overlap research.',
                  },
                ],
              },
            }
          : entry,
    ),
    research: [
      { research, level: 1 },
      { research: 'ComputerTechnology', level: 8 },
      { research: 'HyperspaceTechnology', level: 8 },
    ],
    viewerRevision: () => (options.researchOperation ? '2' : '1'),
  }
  await shellFixture(page, options)
  await routeProgressionOptions(page, async (route) => {
    const { context, request } = route.request().postDataJSON()
    if (request.type === 'Upgrade' || request.type === 'Demolition') {
      return route.fulfill({
        json: {
          protocol: 4,
          binding,
          request_id: context.request_id,
          viewer_revision: options.viewerRevision!(),
          sampled_at: Date.now(),
          as_of_ms: Date.now(),
          request,
          terms_hash: 'b'.repeat(64),
          estimates: null,
          blockers: [],
          terms: {
            type: 'Building',
            profile_hash: 'a'.repeat(64),
            body: home.id,
            building: request.building,
            action: request.type,
            source_level: 10,
            target_level: request.type === 'Upgrade' ? 11 : 9,
            paid: {
              metal: '204800000000',
              crystal: '409600000000',
              deuterium: '204800000000',
            },
            duration_ms: 884736000,
            formula:
              request.type === 'Upgrade'
                ? 'BuildingRedesign2011'
                : 'DemolitionClassic',
            facilities: [
              { building: 'RoboticsFactory', level: 0 },
              { building: 'NaniteFactory', level: 0 },
            ],
            required_energy: '0',
            reserve_fields: request.type === 'Upgrade' ? 1 : 0,
          },
        },
      })
    }
    const host = request.host === remote.id ? remote : home
    const labs = [
      { body: host.id, level: host.levels.ResearchLab },
      {
        body: host.id === home.id ? remote.id : home.id,
        level: host.id === home.id ? 12 : home.levels.ResearchLab,
      },
    ]
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: context.request_id,
        viewer_revision: options.viewerRevision!(),
        sampled_at: Date.now(),
        as_of_ms: Date.now(),
        request,
        terms: {
          type: 'Research',
          profile_hash: 'a'.repeat(64),
          host: host.id,
          research: request.research,
          source_level: request.research === research ? 1 : 0,
          target_level: request.research === research ? 2 : 1,
          paid: cost,
          duration_ms: 20034000,
          formula: 'ResearchClassic',
          labs,
          effective_lab: String(labs.reduce((sum, lab) => sum + lab.level, 0)),
          required_energy: '0',
        },
        terms_hash: 'b'.repeat(64),
        estimates: null,
        blockers: locked
          ? [
              {
                code: 'PrerequisiteMissing',
                requirement: definition.requirements[0],
                required: '10',
                actual: '9',
                unit: 'Level',
                resource: null,
              },
            ]
          : [],
      },
    })
  })
  return options
}

for (const width of [390]) {
  // Regression: linked-lab disclosure, command wiring and the one player-wide
  // operation must survive navigation from its origin to a contributing colony.
  test(`research network preserves linked labs across submission and planet navigation at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    const options = await setup(page)
    const capture = async (state: string) => {
      if (process.env.ORBIT_TEST_SCREENSHOTS !== '1') return
      await page.emulateMedia({ reducedMotion: 'reduce' })
      const toast = page.getByTestId('swipeable-toast').getByRole('button')
      if (await toast.isVisible()) {
        await toast.press('Escape')
        await expect(toast).toBeHidden()
      }
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: 'instant' }),
      )
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
      await page
        .locator('main img')
        .evaluateAll((images) =>
          Promise.all(
            images.map((image) => (image as HTMLImageElement).decode()),
          ),
        )
      await diagnosticScreenshot(page, {
        path: testInfo.outputPath(`${state}-${width}x900.png`),
        fullPage: width !== 390,
        animations: 'disabled',
      })
    }
    await withProgressionResponse(
      page,
      (request) => request.type === 'Research' && request.research === research,
      () =>
        page.goto(
          `/u/andromeda/b/${body.id}/research/intergalactic-research-network`,
        ),
    )
    const pane = page.getByRole('region', { name: 'Progression quote' })
    await expect(pane).toContainText('Remote lab capacity')
    await expect(pane).toContainText('1 → 2')
    await pane
      .getByText('Contributing laboratories · 2', { exact: true })
      .click()
    await expect(pane).toContainText('Home [1:371:12] · Origin')
    await expect(pane).toContainText('Kepler [2:10:8]')
    await expect(pane).toContainText('Lab 12')
    await expect(
      pane.getByRole('button', { name: 'Confirm research', exact: true }),
    ).toBeEnabled()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await capture('network-ready')
    let sent: unknown
    await page.route('**/commands', async (route) => {
      const pair = route.request().postDataJSON()
      sent = pair.gameplay.command
      options.researchOperation = {
        id: id(80),
        host: body.id,
        research,
        source_level: 1,
        target_level: 2,
        paid: cost,
        started_at: Date.now(),
        due_at: Date.now() + 20034000,
        labs: [
          { body: body.id, level: 10 },
          { body: remote.id, level: 12 },
        ],
        effective_lab: '22',
        can_cancel: true,
      }
      await route.fulfill({
        json: {
          protocol: 4,
          binding,
          command_id: pair.gameplay.command_id,
          admitted_at: Date.now(),
          executed_at: Date.now(),
          status: 'Committed',
          result_ids: [id(80)],
          minimum_viewer_revision: '2',
        },
      })
    })
    await pane
      .getByRole('button', { name: 'Confirm research', exact: true })
      .click()
    await expect(
      pane.getByRole('button', { name: 'Cancel research', exact: true }),
    ).toBeEnabled()
    expect(sent).toEqual({
      type: 'StartResearch',
      host: body.id,
      research,
      expected_terms_hash: 'b'.repeat(64),
    })
    await pane
      .getByText('Contributing laboratories · 2', { exact: true })
      .click()
    await expect(pane).toContainText('fixed when research started')
    await capture('network-active')
    await withProgressionResponse(
      page,
      (request) => request.type === 'Research' && request.host === remote.id,
      () =>
        pane
          .getByRole('link', { name: 'Kepler [2:10:8]', exact: true })
          .click(),
    )
    await expect(page).toHaveURL(new RegExp(`/b/${remote.id}/research$`))
    // The player-wide active operation was delivered before navigation. Opening
    // its inspector deliberately issues no new quote (TechnologyInspector).
    await page
      .getByRole('link', {
        name: 'Research Intergalactic Research Network',
        exact: true,
      })
      .click()
    await expect(
      pane.getByRole('button', { name: 'Cancel research', exact: true }),
    ).toBeEnabled()
    await pane
      .getByText('Contributing laboratories · 2', { exact: true })
      .click()
    await expect(pane).toContainText('Home [1:371:12] · Origin')
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await capture('network-remote-active')
  })

  test(`Research Lab links to its new network unlock at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await setup(page)
    await withProgressionResponse(
      page,
      (request) =>
        request.type === 'Upgrade' && request.building === 'ResearchLab',
      () => page.goto(`/u/andromeda/b/${body.id}/facilities/research-lab`),
    )
    const pane = page.getByRole('region', { name: 'Progression quote' })
    await pane.getByText('Technical data', { exact: true }).click()
    await expect(pane).toContainText('sum of contributing lab levels')
    const unlock = pane.getByRole('link', {
      name: 'Intergalactic Research Network',
      exact: true,
    })
    await expect(unlock).toBeVisible()
    if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: 'instant' }),
      )
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
      await page
        .locator('main img')
        .evaluateAll((images) =>
          Promise.all(
            images.map((image) => (image as HTMLImageElement).decode()),
          ),
        )
      await diagnosticScreenshot(page, {
        path: testInfo.outputPath(`research-lab-${width}x900.png`),
        fullPage: width !== 390,
        animations: 'disabled',
      })
    }
    await withProgressionResponse(
      page,
      (request) => request.type === 'Research' && request.research === research,
      () => unlock.click(),
    )
    await expect(
      pane.getByRole('button', { name: 'Confirm research', exact: true }),
    ).toBeEnabled()
  })

  test(`research network cannot bypass the origin lab requirement at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await setup(page, true)
    await withProgressionResponse(
      page,
      (request) => request.type === 'Research' && request.research === research,
      () =>
        page.goto(
          `/u/andromeda/b/${body.id}/research/intergalactic-research-network`,
        ),
    )
    const pane = page.getByRole('region', { name: 'Progression quote' })
    await expect(
      pane.getByRole('button', { name: 'Confirm research', exact: true }),
    ).toBeDisabled()
    await expect(pane.getByLabel('Action blockers')).toContainText(
      'Research Lab',
    )
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: 'instant' }),
      )
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
      await page
        .locator('main img')
        .evaluateAll((images) =>
          Promise.all(
            images.map((image) => (image as HTMLImageElement).decode()),
          ),
        )
      await diagnosticScreenshot(page, {
        path: testInfo.outputPath(`network-locked-${width}x900.png`),
        fullPage: width !== 390,
        animations: 'disabled',
      })
    }
  })
}
