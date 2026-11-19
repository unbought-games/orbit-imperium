import { test, expect } from './fixture'
import { body, id } from '../../src/test-support/empire'
import type {} from './report-triage.scenario'

test('the colonization reader selects Resources on the recorded owned colony', async ({
  page,
}) => {
  const coordinates = { galaxy: 1, system: 371, position: 8 }
  const colony = {
    ...body,
    id: id(90),
    coordinates,
    fields: 230,
    fields_used: 0,
    fields_reserved: 0,
    levels: Object.fromEntries(Object.keys(body.levels).map((key) => [key, 0])),
    inventories: [],
    colony: {
      diameter_km: 15191,
      min_temperature: 24,
      max_temperature: 64,
      created_at: 1000,
      profile: 'oi-redesign-reconstructed-v1' as const,
    },
  }
  const observation: NonNullable<Window['reportTriageColony']> = {
    body: colony,
    header: {
      id: id(81),
      kind: 'Colonized',
      observed_at: 1000,
      read: false,
      hidden: false,
    },
    payload: {
      kind: 'Colonized',
      body: colony.id,
      fleet: id(80),
      origin: body.id,
      destination_coordinates: coordinates,
      at: 1000,
      fields: 230,
      diameter_km: 15191,
      min_temperature: 24,
      max_temperature: 64,
      resources: { metal: '1500000000', crystal: '500000000', deuterium: '0' },
      return_at: null,
    },
  }
  await page.addInitScript((observation) => {
    window.reportTriageColony = observation
  }, observation)
  await page.goto('/?scenario=report-triage&details=1')
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'report-triage',
  )
  const reader = page.getByRole('region', { name: 'Report observation' })
  await expect(reader).toContainText('Colony established')
  await expect(reader).toContainText('230 fields')
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  }
  const open = page.getByRole('link', { name: 'Open colony resources' })
  await expect(open).toHaveAttribute(
    'href',
    `/u/andromeda/b/${colony.id}/resources`,
  )
  await open.click()
  await expect(page.getByLabel('Opened route')).toHaveText(
    `/u/andromeda/b/${colony.id}/resources`,
  )
})
