import { expect, test } from './fixture'
import { body } from '../../src/test-support/empire'
import { tutorialFixture } from '../../src/test-support/tutorial'
import type {} from './empire.scenarios'

for (const width of [390]) {
  test.describe(`Empire briefing at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, hasTouch: width === 390 })
    test('the unread icon fits between the real Empire heading and ledger and native activation acknowledges this progress', async ({
      page,
      mount,
    }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await mount('empire')
      const data = tutorialFixture()
      const deliver = () =>
        page.evaluate((data) => {
          const { model, view } = window.empireScene
          data.homeworld = view.bodies[0].id
          model.store.setState({
            tutorial: {
              data,
              loading: false,
              error: null,
              revision: view.viewer_revision,
            },
          })
        }, data)
      await deliver()
      const heading = page.getByRole('heading', { name: 'Empire', exact: true })
      const ledger = page.getByLabel('Empire resource totals', { exact: true })
      const unread = page.getByRole('link', {
        name: 'Open briefing — unread updates',
        exact: true,
      })
      await expect(unread).toHaveAttribute('data-attention', 'true')
      const href = `/u/andromeda/b/${body.id}/briefing`
      await expect(unread).toHaveAttribute('href', href)
      const geometry = await page.evaluate(
        ([name, book, resources]) => {
          const h = name!.getBoundingClientRect(),
            i = book!.getBoundingClientRect(),
            r = resources!.getBoundingClientRect()
          return {
            gap: r.top - h.bottom,
            afterHeading: i.left - h.right,
            aboveLedger: r.top - i.bottom,
            width: i.width,
            height: i.height,
          }
        },
        [
          await heading.elementHandle(),
          await unread.elementHandle(),
          await ledger.elementHandle(),
        ],
      )
      expect(geometry.gap).toBeGreaterThanOrEqual(0)
      expect(geometry.gap).toBeLessThanOrEqual(16)
      expect(geometry.afterHeading).toBeGreaterThanOrEqual(0)
      expect(geometry.aboveLedger).toBeGreaterThanOrEqual(0)
      expect(
        await unread.evaluate(
          (n) => getComputedStyle(n, '::before').animationName,
        ),
      ).toBe('none')
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      expect(
        await unread.evaluate(
          (n) => getComputedStyle(n, '::before').animationName,
        ),
      ).not.toBe('none')
      expect(
        await unread
          .locator('span > span')
          .first()
          .evaluate((n) => n.getAnimations({ subtree: true }).length),
      ).toBeGreaterThan(0)
      expect(
        await unread
          .locator('span > span')
          .first()
          .evaluate((n) => getComputedStyle(n, '::before').animationName),
      ).not.toBe('none')

      expect(geometry.width).toBeGreaterThanOrEqual(44)
      expect(geometry.height).toBeGreaterThanOrEqual(44)
      await unread.tap()
      await expect(
        page.getByLabel('Scene destination', { exact: true }),
      ).toHaveText(href)
      await expect(
        page.getByRole('link', { name: 'Open briefing', exact: true }),
      ).toHaveAttribute('data-attention', 'false')
      const objective = data.chapters
        .flatMap((c) => c.objectives)
        .find((o) => o.id === 'metal-1')!
      objective.completed = true
      await deliver()
      await expect(unread).toBeVisible()
      await page.setViewportSize({ width: 320, height: 900 })
      expect(
        await unread.evaluate((el) => {
          const animations = el.getAnimations({ subtree: true })
          const glow = animations.find(
            (a): a is CSSAnimation =>
              a instanceof CSSAnimation && a.animationName.includes('breathe'),
          )!
          const peak = Number(glow.effect!.getTiming().duration) / 2
          for (const a of animations) {
            a.pause()
            a.currentTime = peak
          }
          return document.documentElement.scrollWidth - innerWidth
        }),
      ).toBe(0)
      await unread.tap()
      await expect(
        page.getByRole('link', { name: 'Open briefing', exact: true }),
      ).toHaveAttribute('data-attention', 'false')
    })
  })
}
