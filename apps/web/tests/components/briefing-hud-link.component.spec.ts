import { test, expect } from './fixture'
import { mountHud } from './mount-hud'
import { tutorialFixture } from '../../src/test-support/tutorial'
import { id } from '../../src/test-support/bootstrap'

test('the actual HUD heading keeps a funded Briefing link until final tutorial completion', async ({
  page,
  mount,
}) => {
  await mountHud(page, mount)
  const replace = async (completed: boolean) =>
    page.evaluate(
      ({ data, body }) => {
        const scene = window.hudScene
        data.homeworld = body
        scene.model.store.setState({
          tutorial: {
            data,
            loading: false,
            error: null,
            revision: scene.view.viewer_revision,
          },
        })
      },
      { data: tutorialFixture(completed), body: id(5) },
    )
  await replace(false)
  await page.getByTestId('command-orb').click()
  const panel = page.getByRole('dialog', {
    name: 'Command uplink',
    exact: true,
  })
  const link = panel.getByRole('link', { name: 'Briefing', exact: true })
  await expect(link).toHaveAttribute('href', `/u/andromeda/b/${id(5)}/briefing`)
  await expect(link).toHaveAttribute('data-button-variant', 'secondary')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    const first = await panel
      .getByRole('heading', { name: 'Command uplink', exact: true })
      .elementHandle()
    const next = await link.elementHandle()
    const bounds = await page.evaluate(
      ([heading, anchor]) => {
        const h = heading!.getBoundingClientRect(),
          a = anchor!.getBoundingClientRect()
        return {
          gap: a.left - h.right,
          overlap: Math.min(h.bottom, a.bottom) - Math.max(h.top, a.top),
        }
      },
      [first, next],
    )
    expect(bounds.gap).toBeGreaterThanOrEqual(0)
    expect(bounds.overlap).toBeGreaterThan(0)
  }
  await replace(true)
  await expect(link).toHaveCount(0)
  await expect(panel).toBeVisible()
})
