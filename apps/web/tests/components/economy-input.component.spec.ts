import { expect, test, type Page } from './fixture'
import type {} from './resources.scenarios'

async function expectOneUpgrade(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => window.resourceScene.sent.map((e) => e.command)),
    )
    .toEqual([
      {
        type: 'StartUpgrade',
        body: '00000000-0000-4000-8000-000000000005',
        building: 'MetalMine',
        expected_terms_hash: 'b'.repeat(64),
      },
    ])
  await expect(
    page.getByRole('region', { name: 'Resource buildings' }),
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Progression quote' }),
  ).toHaveCount(0)
}

test('Enter on the catalog quick-build button starts exactly one upgrade and keeps the list', async ({
  page,
  mount,
}) => {
  await mount('resources')
  const build = page.getByRole('button', {
    name: 'Build Metal Mine level 2',
    exact: true,
  })
  await expect(build).toBeEnabled()
  await build.focus()
  await page.keyboard.press('Enter')
  await expectOneUpgrade(page)
})
test.describe('native touch economy controls', () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  })
  test('tap inspects a row without ordering, Back returns to it, and tapping its ghost action builds', async ({
    page,
    mount,
  }) => {
    await mount('resources')
    const build = page.getByRole('button', {
      name: 'Build Metal Mine level 2',
      exact: true,
    })
    await expect(build).toBeEnabled()
    await page
      .getByRole('link', { name: 'Upgrade Metal Mine', exact: true })
      .tap()
    const quote = page.getByRole('region', { name: 'Progression quote' })
    await expect(
      quote.getByRole('button', { name: 'Confirm upgrade' }),
    ).toBeEnabled()
    expect(await page.evaluate(() => window.resourceScene.sent)).toEqual([])
    await quote.getByRole('link', { name: 'Back to Resources' }).tap()
    await expect(build).toBeEnabled()
    await build.tap()
    await expectOneUpgrade(page)
  })
  test('a touchscreen tap at the slider midpoint saves metal production at fifty percent once', async ({
    page,
  }) => {
    await page.goto('/?scenario=resources&page=production')
    await expect(page.locator('html')).toHaveAttribute(
      'data-component-ready',
      'resources',
    )
    const panel = page.getByRole('region', { name: 'Production controls' })
    const metal = panel.getByRole('slider', { name: 'metal mine production' })
    await metal.scrollIntoViewIfNeeded()
    const box = (await metal.boundingBox())!
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
    await expect(metal).toHaveValue('50')
    await expect(panel.getByRole('status')).toHaveText(
      'All changes saved automatically.',
    )
    const commands = await page.evaluate(() =>
      window.resourceScene.sent.map((e) => e.command),
    )
    expect(commands).toHaveLength(1)
    expect(commands[0]).toMatchObject({
      type: 'SetProduction',
      settings: { metal_mine: 50 },
    })
  })
})
