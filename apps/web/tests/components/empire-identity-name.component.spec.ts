import {
  installObservedEmpire,
  loaded,
  isCurrentObservation,
} from '../fixtures/observed-empire'
import { test, expect } from './fixture'
import { withFixtureResponse } from '../fixtures/responses'
import { body } from '../../src/test-support/empire'
import type {} from './empire.scenarios'
for (const width of [1440, 390]) {
  test.describe(`overview name ${width}px`, () => {
    test.use({ hasTouch: width === 390 })
    test('the name editor preserves profile fields, updates the observed heading and returns focus', async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      const f = await installObservedEmpire(page)
      await page.addInitScript((b) => {
        window.empireInput = {
          bodies: [b],
          manufacturing: [],
          constructions: [],
          researchOperation: null,
          missions: {
            incoming: [],
            fleets: [],
            score_value_micro: '0',
            fleet_slots: '8',
          },
        }
      }, body)
      await withFixtureResponse(page, isCurrentObservation, () =>
        page.goto('/?scenario=empire&profile-source=live'),
      )
      await expect(page.locator('html')).toHaveAttribute(
        'data-component-ready',
        'empire',
      )
      const overview = page.getByRole('region', {
        name: 'Empire overview',
        exact: true,
      })
      const heading = overview.getByRole('heading', {
        name: 'Roman Empire',
        exact: true,
      })
      const pencil = page.getByRole('button', {
        name: 'Rename empire',
        exact: true,
      })
      await expect(heading).toBeVisible()
      if (width === 1440) {
        await expect(pencil).toHaveCSS('opacity', '0')
        await heading.hover()
        await expect(pencil).toHaveCSS('opacity', '0.5')
      } else {
        await expect(pencil).toHaveCSS('opacity', '0.5')
        const target = await pencil.boundingBox()
        expect(target?.width).toBeGreaterThanOrEqual(44)
        expect(target?.height).toBeGreaterThanOrEqual(44)
      }
      await loaded(page, () => pencil.click())
      const dialog = page.getByRole('dialog', {
        name: 'What should we call our empire, Consul?',
      })
      const input = dialog.getByRole('textbox', { name: 'Empire name' })
      await expect(input).toBeFocused()
      await expect(input).toHaveValue('Roman Empire')
      await expect(
        dialog.getByText('Empire name', { exact: true }),
      ).toHaveCount(0)
      const cancelBox = await dialog
        .getByRole('button', { name: 'Cancel', exact: true })
        .boundingBox()
      const saveBox = await dialog
        .getByRole('button', { name: 'Save name', exact: true })
        .boundingBox()
      expect(cancelBox!.x + cancelBox!.width).toBeLessThan(saveBox!.x)
      await input.fill('A draft to discard')
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
      await expect(pencil).toBeFocused()
      await expect(heading).toBeVisible()
      await loaded(page, () => pencil.click())
      await expect(input).toHaveValue('Roman Empire')
      await input.fill('Celestial Commonwealth')
      await withFixtureResponse(
        page,
        (r) => isCurrentObservation(r),
        () => dialog.getByRole('button', { name: 'Save name' }).click(),
      )
      await expect(dialog).toHaveCount(0)
      await expect(pencil).toBeFocused()
      await expect(
        overview.getByRole('heading', {
          name: 'Celestial Commonwealth',
          exact: true,
        }),
      ).toBeVisible()
      expect(f.data.identity).toEqual({
        name: 'Celestial Commonwealth',
        tagline: 'Many worlds. One people.',
        title_id: 'consul',
      })
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)

      if (width === 390) {
        f.data.identity!.name =
          'The Celestial Commonwealth of the Distant Outer Stars'
        await withFixtureResponse(
          page,
          (r) => isCurrentObservation(r),
          () => page.reload(),
        )
        await expect(
          overview.getByRole('heading', {
            name: f.data.identity!.name,
            exact: true,
          }),
        ).toBeVisible()
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true)
      }
      if (width === 1440) {
        await loaded(page, () => pencil.click())
        await input.fill('x'.repeat(61))
        await expect(dialog.getByRole('alert')).toContainText('up to 60')
        await expect(
          dialog.getByRole('button', { name: 'Save name' }),
        ).toBeDisabled()
        await input.fill('')
        f.data.revision++
        await dialog.getByRole('button', { name: 'Save name' }).click()
        await expect(dialog.getByRole('alert')).toContainText('another window')
        await expect(input).toHaveValue('')
        await loaded(page, () =>
          dialog.getByRole('button', { name: 'Refresh', exact: true }).click(),
        )
        await dialog
          .getByRole('button', { name: 'Use refreshed version' })
          .click()
        await withFixtureResponse(
          page,
          (r) => isCurrentObservation(r),
          () => dialog.getByRole('button', { name: 'Save name' }).click(),
        )
        await expect(dialog).toHaveCount(0)
        await expect(
          overview.getByRole('heading', { name: 'Empire', exact: true }),
        ).toBeVisible()
      }
    })
  })
}
