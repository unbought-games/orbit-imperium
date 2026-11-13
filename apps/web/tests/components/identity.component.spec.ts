import { test, expect } from './fixture'
import {
  capCenterOffset,
  inlineBaselines,
  textLineMetrics,
} from '../fixtures/identity-typography'
import { focusPlayerDetails } from '../fixtures/profile-navigation'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'

for (const width of [1440, 390, 320]) {
  test(`identity text retains baselines, paragraph rhythm and keyboard details at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    // This dev harness supplies immutable profiles synchronously; no lazy API data.
    await page.goto('/identity-playground')
    await expect(
      page.getByRole('heading', {
        name: 'Player identity typography',
        exact: true,
      }),
    ).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    for (const sample of await page
      .locator('[data-baseline], [data-paragraph], [data-heading]')
      .all()) {
      const { lineHeight, tops } = await sample.evaluate(textLineMetrics)
      expect(tops.length).toBeGreaterThan(0)
      for (let i = 1; i < tops.length; i++) {
        expect(
          Math.abs(tops[i] - tops[i - 1] - lineHeight),
          (await sample.textContent()) ?? '',
        ).toBeLessThan(0.15)
      }
    }
    const marks = page.locator(
      ':is([data-baseline], [data-paragraph], [data-heading]) :is([data-shape], [role="img"][aria-label^="Supporter"])',
    )
    await expect(marks.first()).toBeVisible()
    for (const mark of await marks.all())
      expect(Math.abs(await mark.evaluate(capCenterOffset))).toBeLessThan(0.15)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    for (const sample of await page.locator('[data-paragraph]').all()) {
      const overflow = await sample.evaluate((p) => {
        const b = p.getBoundingClientRect()
        return [...p.querySelectorAll('a, span, svg')]
          .flatMap((el) => [...el.getClientRects()])
          .some((r) => r.left < b.left - 1 || r.right > b.right + 1)
      })
      expect(overflow).toBe(false)
    }
    for (const label of ['Short text', 'Paragraphs', 'Headings and rows']) {
      await diagnosticScreenshot(
        page.getByRole('region', { name: label, exact: true }),
        {
          path: `test-results/identity-type-${label.toLowerCase().replaceAll(' ', '-')}-${width}x1000.png`,
        },
      )
    }
    const link = page
      .getByRole('region', { name: 'Short text', exact: true })
      .getByRole('link', { name: 'Aurelia profile details' })
      .first()
    await focusPlayerDetails(page, link)
    await expect(
      page.getByRole('tooltip', { name: 'Aurelia profile', exact: true }),
    ).toBeVisible()
    const dossier = page.getByRole('tooltip', {
      name: 'Aurelia profile',
      exact: true,
    })
    const affiliation = dossier
      .getByRole('link', {
        name: 'Alliance Starward Accord [STAR]',
        exact: true,
      })
      .locator('..')
    const baselines = await affiliation
      .locator(':scope > *')
      .evaluateAll(inlineBaselines)
    expect(baselines.length).toBeGreaterThan(1)
    expect(Math.max(...baselines) - Math.min(...baselines)).toBeLessThan(0.15)
    await diagnosticScreenshot(dossier, {
      path: `test-results/identity-type-dossier-${width}x1000.png`,
    })
    await page.keyboard.press('Escape')
    await expect(
      page.getByRole('tooltip', { name: 'Aurelia profile', exact: true }),
    ).toHaveCount(0)
    await expect(link).toBeFocused()
    await expect(link).toHaveAttribute(
      'href',
      '/profiles/empire/00000000-0000-4000-8000-000000000001',
    )
    const badge = page.getByRole('button', {
      name: 'Supporter · $25 / month USD',
      exact: true,
    })
    await badge.focus()
    await expect(page.getByRole('tooltip', { name: /Supporter/ })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('tooltip', { name: /Supporter/ })).toHaveCount(
      0,
    )
  })
}
