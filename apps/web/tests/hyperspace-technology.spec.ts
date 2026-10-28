import { readFileSync } from 'node:fs'
import { test, expect } from './fixtures/test'
import { shellFixture, body, binding, id } from './fixtures/game'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import type { components } from '../src/contracts'

type S = components['schemas']
const research = 'HyperspaceTechnology' as const
const definition = JSON.parse(
  readFileSync('rules/content/hyperspace-technology.json', 'utf8'),
)
const baseline = JSON.parse(readFileSync('rules/mvp-v1-slice-13.json', 'utf8'))
const cost = { metal: '0', crystal: '4000000000', deuterium: '2000000000' }
const detailPath = `/u/andromeda/b/${body.id}/research/hyperspace-technology`

async function setup(
  page: Parameters<typeof shellFixture>[0],
  { lab = 7, energy = 5, shielding = 5, enabled = true } = {},
) {
  const options: Parameters<typeof shellFixture>[1] = {
    protocol: 4,
    bodies: [{ ...body, levels: { ...body.levels, ResearchLab: lab } }],
    catalog: baseline.catalog.map((entry: S['CatalogEntry3']) =>
      entry.key.id === research
        ? {
            ...entry,
            enabled,
            requirements: definition.requirements,
            technical_data: {
              bonuses: [],
              facts: [
                {
                  label: 'Effect',
                  value:
                    'Prerequisite research. No additional per-level production, combat, cargo or construction bonus is implemented in this universe.',
                  subject: null,
                },
              ],
              storage_capacities: null,
              combat: null,
            },
          }
        : entry,
    ),
    research: [
      { research, level: 0 },
      { research: 'EnergyTechnology', level: energy },
      { research: 'ShieldingTechnology', level: shielding },
    ],
    viewerRevision: () => (options.researchOperation ? '2' : '1'),
  }
  await shellFixture(page, options)
  await page.route('**/progression-options', async (route) => {
    const { context, request } = route.request().postDataJSON()
    const entry = options.catalog!.find(
      (entry) =>
        entry.key.kind === 'Research' && entry.key.id === request.research,
    )
    const available = !!entry?.enabled
    const hyperspace = request.research === research
    const actual = (requirement: S['CatalogEntry3']['requirements'][number]) =>
      requirement.type === 'BodyBuilding'
        ? lab
        : requirement.research === 'EnergyTechnology'
          ? energy
          : shielding
    const missing = hyperspace
      ? definition.requirements.filter(
          (requirement: S['CatalogEntry3']['requirements'][number]) =>
            actual(requirement) < requirement.level,
        )
      : []
    const base = baseline.progression.research[request.research]?.base ?? [
      0, 0, 0,
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
        terms: available
          ? {
              type: 'Research',
              profile_hash: 'a'.repeat(64),
              host: body.id,
              research: request.research,
              source_level: 0,
              target_level: 1,
              paid: hyperspace
                ? cost
                : Object.fromEntries(
                    ['metal', 'crystal', 'deuterium'].map((key, index) => [
                      key,
                      String(base[index] * 1_000_000),
                    ]),
                  ),
              duration_ms: 360000,
              formula: 'ResearchClassic',
              labs: [{ body: body.id, level: lab }],
              effective_lab: String(lab),
              required_energy: '0',
            }
          : null,
        terms_hash: available ? 'b'.repeat(64) : null,
        blockers: available
          ? missing.map(
              (requirement: S['CatalogEntry3']['requirements'][number]) => ({
                code: 'PrerequisiteMissing',
                requirement,
                required: String(requirement.level),
                actual: String(actual(requirement)),
                resource: null,
                unit: 'Level',
              }),
            )
          : [
              {
                code: 'UnavailableContent',
                requirement: null,
                required: null,
                actual: null,
                resource: null,
                unit: null,
              },
            ],
        estimates: null,
      },
    })
  })
  return options
}

for (const width of [390, 1440]) {
  test(`Hyperspace Technology can be inspected and researched without enabling its drive at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    const options = await setup(page)
    const capture = async (state: string) => {
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: 'instant' }),
      )
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
      await page.locator('main img, dialog img').evaluateAll((images) => {
        for (const image of images)
          (image as HTMLImageElement).loading = 'eager'
      })
      await expect
        .poll(() =>
          page
            .locator('main img, dialog img')
            .evaluateAll((images) =>
              images.every(
                (image) =>
                  (image as HTMLImageElement).complete &&
                  (image as HTMLImageElement).naturalWidth > 0,
              ),
            ),
        )
        .toBe(true)
      await page
        .locator('main img, dialog img')
        .evaluateAll((images) =>
          Promise.all(
            images.map((image) => (image as HTMLImageElement).decode()),
          ),
        )
      await diagnosticScreenshot(page, {
        path: testInfo.outputPath(`${state}-${width}x900.png`),
        fullPage: state !== 'technology-tree',
      })
    }
    await page.goto(`/u/andromeda/b/${body.id}/research`)
    const tile = page.getByRole('link', {
      name: 'Research Hyperspace Technology',
      exact: true,
    })
    await expect(tile).not.toContainText('unavailable')
    await expect(tile.locator('img')).toHaveAttribute(
      'src',
      /hyperspace-technology/,
    )
    await expect
      .poll(() =>
        tile
          .locator('img')
          .evaluate((image) => (image as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0)
    await capture('research-catalog')
    await tile.click()
    const pane = page.getByRole('region', { name: 'Progression quote' })
    await expect(pane).toContainText(
      'Unlocks Destroyers at level 5',
    )
    await expect(
      pane.getByRole('button', { name: 'Crystal details' }),
    ).toContainText('4,000')
    await expect(
      pane.getByRole('button', { name: 'Deuterium details' }),
    ).toContainText('2,000')
    const submit = pane.getByRole('button', {
      name: 'Confirm research',
      exact: true,
    })
    await expect(submit).toBeEnabled()
    await pane.getByText('Technical data', { exact: true }).click()
    await expect(pane).toContainText('No additional per-level')
    await expect(
      pane.getByRole('list', { name: 'Prerequisites' }).first(),
    ).toContainText('Research Lab 7')
    await capture('research-ready')
    await pane
      .getByRole('button', { name: 'Technology tree', exact: true })
      .click()
    const tree = page.getByRole('dialog', {
      name: 'Technology — Hyperspace Technology',
      exact: true,
    })
    await expect(tree).toContainText('7 / 7 · Met')
    await expect(tree).toContainText('5 / 5 · Met')
    await capture('technology-tree')
    await tree.getByRole('button', { name: 'Close technology' }).click()
    let sent: unknown
    await page.route('**/commands', async (route) => {
      const pair = route.request().postDataJSON()
      sent = pair.gameplay.command
      options.researchOperation = {
        id: id(80),
        host: body.id,
        research,
        source_level: 0,
        target_level: 1,
        paid: cost,
        started_at: Date.now(),
        due_at: Date.now() + 360000,
        labs: [{ body: body.id, level: 7 }],
        effective_lab: '7',
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
    await submit.click()
    await expect
      .poll(() => sent)
      .toEqual({
        type: 'StartResearch',
        host: body.id,
        research,
        expected_terms_hash: 'b'.repeat(64),
      })
    await expect(
      pane.getByRole('button', { name: 'Cancel research', exact: true }),
    ).toBeEnabled()
    await capture('research-active')
    await page.goto(`/u/andromeda/b/${body.id}/research/hyperspace-drive`)
    await expect(pane).toContainText('Unavailable in this universe.')
    await expect(
      pane.getByRole('button', { name: 'Confirm research', exact: true }),
    ).toBeDisabled()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  })

  test(`Hyperspace Technology shows unmet prerequisites at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await setup(page, { lab: 6, energy: 4, shielding: 4 })
    await page.goto(detailPath)
    const pane = page.getByRole('region', { name: 'Progression quote' })
    await expect(
      pane.getByRole('button', { name: 'Confirm research', exact: true }),
    ).toBeDisabled()
    const blockers = pane.getByLabel('Action blockers')
    for (const label of [
      'Research Lab',
      'Energy Technology',
      'Shielding Technology',
    ]) {
      await expect(blockers).toContainText(label)
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    await diagnosticScreenshot(page, {
      path: testInfo.outputPath(`research-locked-${width}x900.png`),
      fullPage: true,
    })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  })
}

test('Hyperspace Technology remains unavailable before universe activation', async ({
  page,
}) => {
  await setup(page, { enabled: false })
  await page.goto(detailPath)
  const pane = page.getByRole('region', { name: 'Progression quote' })
  await expect(pane).toContainText('Unavailable in this universe.')
  await expect(
    pane.getByRole('button', { name: 'Confirm research', exact: true }),
  ).toBeDisabled()
})
