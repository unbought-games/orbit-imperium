import { test, expect, type Page } from '@playwright/test'
import { shellFixture, binding, body, id } from './fixtures/game'
import observation from '../../../contracts/fixtures/espionage-expanded.json' with { type: 'json' }
import schema from '../../../contracts/openapi.json' with { type: 'json' }

async function reports(page: Page, payload: () => unknown, status = () => 200) {
  await page.route('**/api/**/reports**', async route => {
    if (status() !== 200) return route.fulfill({ status: status(), json: { code: 'Unavailable' } })
    const request = route.request().postDataJSON()
    await route.fulfill({ json: {
      protocol: 4, binding, request_id: (request.context ?? request).request_id,
      viewer_revision: '1', sampled_at: Date.now(), as_of_ms: Date.now(),
      data: {
        header: { id: id(62), kind: 'Espionage', observed_at: observation.observed_at, read: false, hidden: false },
        payload: payload(), player_names: { [observation.target.owner]: '12345678901234567890' },
      },
    } })
  })
}
const reportUrl = `/u/andromeda/reports/${id(62)}?body=${body.id}`

test('expanded espionage survives direct navigation, reload and historical observations on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await shellFixture(page, { protocol: 4, extraCapabilities: ['Reports'] })
  let historical = false
  await reports(page, () => historical ? {
    ...observation, research: { visibility: 'Unknown' },
  } : observation)
  await page.goto(reportUrl)
  const report = page.getByRole('region', { name: 'Report observation' })
  await expect(report).toContainText('Astrophysics')
  await expect(report).toContainText('Impulse Drive')
  await expect(report).toContainText('12345678901234567890')
  await page.reload()
  await expect(report).toContainText('Astrophysics')
  historical = true
  await page.reload()
  await expect(report).toContainText('this observation did not reveal this section')
  await expect(report).not.toContainText('Astrophysics')
})

for (const protocol of [3, 4] as const) {
  test(`protocol ${protocol} game opens with expanded buildings`, async ({ page }) => {
    const levels = { ...body.levels, ...Object.fromEntries(schema.components.schemas.BuildingId3.enum.map(key => [key, 0])) }
    await shellFixture(page, { protocol, bodies: [{ ...body, levels }] })
    await page.goto(`/u/andromeda/overview?body=${body.id}`)
    await expect(page.getByRole('heading', { name: /^Empire/, level: 1 })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: /^Empire/, level: 1 })).toBeVisible()
  })
}

test('incompatible report data offers an explicit reload instead of blaming permissions', async ({ page }) => {
  await shellFixture(page, { protocol: 4, extraCapabilities: ['Reports'] })
  let fixed = false
  await reports(page, () => fixed ? observation : { ...observation, research: { visibility: 'Known', value: { ...observation.research.value, FutureResearch: 0 } } })
  await page.goto(reportUrl)
  await expect(page.getByRole('alert')).toContainText('data this version cannot read')
  await expect(page.getByRole('button', { name: 'Retry reports' })).toHaveCount(0)
  fixed = true
  await page.getByRole('button', { name: 'Reload app' }).click()
  await expect(page.getByRole('region', { name: 'Report observation' })).toContainText('Astrophysics')
})

test('transient report failures can still retry without reloading', async ({ page }) => {
  await shellFixture(page, { protocol: 4, extraCapabilities: ['Reports'] })
  let status = 503
  await reports(page, () => observation, () => status)
  await page.goto(reportUrl)
  await expect(page.getByRole('alert')).toContainText('Unable to load reports')
  status = 200
  await page.getByRole('button', { name: 'Retry reports' }).click()
  await expect(page.getByRole('region', { name: 'Report observation' })).toContainText('Astrophysics')
})
