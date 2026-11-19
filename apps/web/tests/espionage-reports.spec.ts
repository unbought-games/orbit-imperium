import { test, expect } from './fixtures/test'
import { shellFixture, binding, id } from './fixtures/game'
import { withReportResponse } from './fixtures/responses'
import { reportPath } from './fixtures/report-path'
import { expandedEspionage } from '../src/test-support/espionage-observation'

test('authenticated espionage toolbar and target actions fit the shell', async ({
  page,
}) => {
  await shellFixture(page, {
    protocol: 4,
    extraCapabilities: ['Reports', 'Attack'],
    missions: {
      fleets: [],
      incoming: [],
      score_value_micro: '0',
      fleet_slots: '1',
    },
  })
  const header = {
    id: id(63),
    kind: 'Espionage',
    observed_at: Date.now() - 60_000,
    read: true,
    hidden: false,
  }
  const payload = expandedEspionage
  await page.route(
    `**/api/v4/universes/${binding.universe}/reports/${header.id}`,
    async (route) => {
      const request = route.request().postDataJSON()
      await route.fulfill({
        json: {
          protocol: 4,
          binding,
          request_id: (request.context ?? request).request_id,
          viewer_revision: '1',
          sampled_at: Date.now(),
          as_of_ms: Date.now(),
          data: {
            header,
            payload,
            player_names: { [payload.target.owner]: 'Commander Vega' },
          },
        },
      })
    },
  )
  await withReportResponse(page, header.id, () =>
    page.goto(reportPath(header.id)),
  )
  const report = page.getByRole('region', { name: 'Report observation' })
  await expect(
    report.getByRole('heading', { name: 'Buildings', exact: true }),
  ).toBeVisible()
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })

    // The pinned header's ResizeObserver repositions the work area at the
    // navigation breakpoint. Sample each related rectangle in one layout.
    const [back, title, remove, timestamp, observation] = await page.evaluate(
      (els) =>
        els.map((el) => {
          const { x, y, width, height } = el.getBoundingClientRect()
          return { x, y, width, height }
        }),
      await Promise.all(
        [
          page.getByRole('link', { name: 'Back to reports' }),
          page.getByRole('heading', { name: 'Espionage', exact: true }),
          page.getByRole('button', { name: 'Archive report', exact: true }),
          page.getByRole('button', { name: 'Report time details' }),
          report,
        ].map((l) => l.elementHandle()),
      ),
    )
    expect(title.x).toBeGreaterThan(back.x + back.width)
    expect(title.y).toBeLessThan(back.y + back.height)
    expect(timestamp.x).toBe(title.x)
    expect(timestamp.y - title.y - title.height).toBeGreaterThanOrEqual(0)
    expect(timestamp.y - title.y - title.height).toBeLessThanOrEqual(2)
    expect(timestamp.height).toBeLessThanOrEqual(24)
    const reportTop = observation.y
    expect(
      reportTop -
        Math.max(timestamp.y + timestamp.height, back.y + back.height),
    ).toBeLessThanOrEqual(8)
    expect(remove.x).toBeGreaterThan(title.x + title.width)
    const target = page.getByLabel('Espionage target', { exact: true })
    await expect(
      target.getByRole('heading', { name: 'Target', exact: true }),
    ).toBeVisible()
    await expect(target).toHaveCSS('border-bottom-width', '1px')
    expect((await target.boundingBox())!.height).toBeLessThanOrEqual(76)
    const [player, locationBox, imageBox, attackBox] = await page.evaluate(
      (els) =>
        els.map((el) => {
          const { x, y, width, height } = el.getBoundingClientRect()
          return { x, y, width, height }
        }),
      await Promise.all(
        [
          target.getByText('Commander Vega', { exact: true }),
          target.getByRole('link', { name: /View target/ }),
          target.locator('img'),
          target.getByRole('button', { name: 'Attack', exact: true }),
        ].map((l) => l.elementHandle()),
      ),
    )
    expect(locationBox.y - player.y - player.height).toBeLessThanOrEqual(5)
    expect(locationBox.height).toBeLessThanOrEqual(20)
    await expect(target).toContainText('Commander Vega')
    await expect(target).toContainText('Nova Roma')
    await expect(target.locator('img')).toBeVisible()
    const attack = target.getByRole('button', { name: 'Attack', exact: true })
    await expect(attack).toBeVisible()
    expect(attackBox.x).toBeGreaterThan(imageBox.x + 36)
    const amounts = report.getByRole('group', { name: 'Resource amounts' })
    const icons = amounts.locator('svg')
    await expect(icons).toHaveCount(3)
    const iconTops = await icons.evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect().y),
    )
    expect(new Set(iconTops).size).toBe(1)
    for (const [index, resource] of [
      'metal',
      'crystal',
      'deuterium',
    ].entries()) {
      const icon = icons.nth(index)
      await expect(icon).toHaveAccessibleName(
        resource[0].toUpperCase() + resource.slice(1),
      )
      const color = await page.evaluate((resource) => {
        const probe = document.createElement('span')
        probe.style.color = `var(--resource-${resource})`
        document.body.append(probe)
        const color = getComputedStyle(probe).color
        probe.remove()
        return color
      }, resource)
      await expect(icon).toHaveCSS('color', color)
    }
    expect(
      await amounts.evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true)
    await expect(amounts).toContainText('18,763')
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width)
  }
})
