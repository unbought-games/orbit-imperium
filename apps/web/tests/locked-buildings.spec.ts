import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { shellFixture, body, binding, refreshGame } from './fixtures/game'
import type { components } from '../src/contracts'

type S = components['schemas']
const rules = JSON.parse(readFileSync('rules/mvp-v1-slice-5.json', 'utf8')) as {
  catalog: S['CatalogEntry3'][]
}
const path = (page: string) => `/u/andromeda/b/${body.id}/${page}`

for (const width of [1440, 390, 320]) {
  test.describe(`locked buildings at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, hasTouch: width < 600 })

    test('unavailable facilities and resource buildings remain inspectable without construction requests', async ({
      page,
    }) => {
      await shellFixture(page, { catalog: rules.catalog })
      const requests: string[] = []
      page.on('request', (request) => {
        if (request.url().endsWith('/progression-options'))
          requests.push(request.postDataJSON().request.building)
        if (request.url().endsWith('/commands')) requests.push('COMMAND')
      })
      // An unavailable item must be explained from the catalog, even offline.
      await page.route('**/progression-options', (route) => route.abort())
      for (const [destination, id, title] of [
        ['facilities', 'NaniteFactory', 'Nanite Factory'],
        ['facilities', 'Terraformer', 'Terraformer'],
        ['facilities', 'MissileSilo', 'Missile Silo'],
        ['resources', 'FusionReactor', 'Fusion Reactor'],
      ]) {
        await page.goto(path(destination))
        const tile = page.getByRole('link', {
          name: `Upgrade ${title}`,
          exact: true,
        })
        await expect(tile).toBeEnabled()
        await expect(tile).toContainText('Unavailable · Inspect details')
        if (width < 600) await tile.tap()
        else {
          await tile.focus()
          await page.keyboard.press('Enter')
        }
        const pane = page.getByRole('region', { name: 'Progression quote' })
        await expect(pane).toBeVisible()
        await expect(
          pane.getByRole('heading', { name: title, exact: true }),
        ).toBeVisible()
        await expect(
          pane.getByRole('region', { name: 'Building requirements' }),
        ).toContainText('Unavailable in this universe.')
        await expect(
          pane.getByText('No prerequisites listed in this universe’s catalog.'),
        ).toHaveCount(0)
        await expect(
          pane.getByRole('button', { name: 'Confirm upgrade' }),
        ).toHaveCount(0)
        await expect(
          page.getByRole('button', {
            name: `Start upgrade ${title}`,
            exact: true,
          }),
        ).toHaveCount(0)
        await expect(pane.getByRole('alert')).toHaveCount(0)
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true)
        if (id === 'NaniteFactory')
          await pane.screenshot({
            path: `test-results/locked-unavailable-${width}.png`,
            animations: 'disabled',
          })
        await page.getByRole('link', { name: /^Back to / }).click()
        await expect(pane).toBeHidden()
        await expect(tile).toBeFocused()
        expect(requests).not.toContain(id)
      }
      expect(requests).not.toContain('COMMAND')
    })

    test('prerequisites show current levels and server blockers prevent construction in both building lists', async ({
      page,
    }) => {
      const planet = structuredClone(body)
      const catalog = structuredClone(rules.catalog)
      const requirements: S['CatalogEntry3']['requirements'] = [
        { type: 'BodyBuilding', building: 'RoboticsFactory', level: 2 },
        { type: 'PlayerResearch', research: 'EnergyTechnology', level: 3 },
      ]
      for (const entry of catalog) {
        if (entry.key.id === 'Shipyard' || entry.key.id === 'MetalMine')
          entry.requirements = requirements
      }
      await shellFixture(page, {
        catalog,
        bodies: [planet],
        research: [{ research: 'EnergyTechnology', level: 1 }],
      })
      const sent: unknown[] = []
      await page.route('**/commands', (route) => {
        sent.push(route.request().postDataJSON())
        return route.abort()
      })
      await page.route('**/progression-options', (route) => {
        const { context, request } = route.request().postDataJSON()
        return route.fulfill({
          json: {
            protocol: 3,
            binding,
            request_id: context.request_id,
            viewer_revision: '1',
            sampled_at: Date.now(),
            as_of_ms: Date.now(),
            request,
            terms_hash: 'b'.repeat(64),
            estimates: null,
            blockers: [
              {
                code: 'PrerequisiteMissing',
                requirement: requirements[1],
                required: '3',
                actual: '1',
                resource: null,
                unit: 'Level',
              },
            ],
            terms: {
              type: 'Building',
              profile_hash: 'a'.repeat(64),
              body: body.id,
              building: request.building,
              action: request.type,
              source_level:
                planet.levels[request.building as keyof typeof planet.levels],
              target_level:
                planet.levels[request.building as keyof typeof planet.levels] +
                1,
              paid: { metal: '60000000', crystal: '15000000', deuterium: '0' },
              duration_ms: 76000,
              formula: 'BuildingRedesign2011',
              facilities: [],
              required_energy: '0',
              reserve_fields: 1,
            },
          },
        })
      })
      for (const [destination, title] of [
        ['facilities', 'Shipyard'],
        ['resources', 'Metal Mine'],
      ]) {
        await page.goto(path(destination))
        const tile = page.getByRole('link', {
          name: `Upgrade ${title}`,
          exact: true,
        })
        await expect(tile).toContainText('Prerequisites required')
        if (width < 600) await tile.tap()
        else {
          await tile.focus()
          await page.keyboard.press('Enter')
        }
        const pane = page.getByRole('region', { name: 'Progression quote' })
        const prerequisites = pane.getByRole('list', { name: 'Prerequisites' })
        await expect(
          prerequisites
            .getByRole('listitem')
            .filter({ hasText: 'Robotics Factory 2' }),
        ).toContainText('current 0 · required')
        await expect(
          prerequisites
            .getByRole('listitem')
            .filter({ hasText: 'Energy Technology 3' }),
        ).toContainText('current 1 · required')
        await expect(
          pane.getByRole('button', { name: 'Confirm upgrade' }),
        ).toBeDisabled()
        await expect(
          page.getByRole('button', {
            name: `Start upgrade ${title}`,
            exact: true,
          }),
        ).toHaveCount(0)
        await expect(pane.getByLabel('Action blockers')).toContainText(
          'requires 3; current 1',
        )
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true)
        if (destination === 'facilities')
          await pane.screenshot({
            path: `test-results/locked-requirements-${width}.png`,
            animations: 'disabled',
          })
        planet.levels.RoboticsFactory = 2
        await refreshGame(page)
        await expect(
          prerequisites
            .getByRole('listitem')
            .filter({ hasText: 'Robotics Factory 2' }),
        ).toContainText('current 2 · met')
        await expect(
          pane.getByRole('button', { name: 'Confirm upgrade' }),
        ).toBeDisabled()
        planet.levels.RoboticsFactory = 0
        await page.getByRole('link', { name: /^Back to / }).click()
        await expect(tile).toBeFocused()
      }
      expect(sent).toEqual([])
    })
  })
}

test('body restrictions remain inspectable from facility and resource cards', async ({
  page,
}) => {
  const catalog = structuredClone(rules.catalog)
  for (const entry of catalog) {
    if (entry.key.id === 'RoboticsFactory' || entry.key.id === 'MetalMine')
      entry.body_kinds = ['Moon']
  }
  await shellFixture(page, { catalog })
  await page.route('**/progression-options', (route) => route.abort())
  for (const [destination, title] of [
    ['facilities', 'Robotics Factory'],
    ['resources', 'Metal Mine'],
  ]) {
    await page.goto(path(destination))
    const tile = page.getByRole('link', {
      name: `Upgrade ${title}`,
      exact: true,
    })
    if (destination === 'facilities') {
      await expect(tile).toHaveCount(0)
      await page.goto(`${path(destination)}/robotics-factory`)
    } else await tile.click()
    const pane = page.getByRole('region', { name: 'Progression quote' })
    await expect(pane).toContainText('Unavailable on this planet.')
    await expect(
      pane.getByRole('button', { name: 'Confirm upgrade' }),
    ).toHaveCount(0)
    await page.getByRole('link', { name: /^Back to / }).click()
    if (destination === 'resources') await expect(tile).toBeFocused()
    else await expect(page).toHaveURL(path(destination))
  }
})
