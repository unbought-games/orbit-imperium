import { expect, test } from './fixture'
import { id } from '../../src/test-support/bootstrap'
import type {} from './resources.scenarios'

test('native middle-click on the Metal Mine opens its funded item link without selecting or buying in the catalog', async ({
  context,
  page,
  mount,
}) => {
  await mount('resources')
  const list = page.getByRole('region', { name: 'Resource buildings' })
  const tile = list.getByRole('link', {
    name: 'Upgrade Metal Mine',
    exact: true,
  })
  const parent = `/u/andromeda/b/${id(5)}/resources`
  const detail = parent + '/metal-mine'
  await expect(tile).toHaveAttribute('href', detail)
  // Only the address and independent opener are the modified-click contract.
  // A real server document is exercised in explicit routing acceptance.
  await context.route(
    (url) => url.pathname === detail,
    (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<title>Catalog target</title>',
      }),
  )
  const opened = context.waitForEvent('page')
  await tile.click({ button: 'middle' })
  const tab = await opened
  try {
    await expect(tab).toHaveURL(detail)
    await expect(list).toBeVisible()
    await expect(
      page.getByRole('region', { name: 'Progression quote' }),
    ).toHaveCount(0)
    expect(await page.evaluate(() => window.resourceScene.sent)).toEqual([])
  } finally {
    await tab.close()
  }
  // Exercise the actual detail control separately at the same funded body.
  await tile.click()
  const quote = page.getByRole('region', { name: 'Progression quote' })
  await expect(
    quote.getByRole('heading', { name: 'Metal Mine', exact: true }),
  ).toBeVisible()
  await expect(
    quote.getByRole('link', { name: 'Back to Resources' }),
  ).toHaveAttribute('href', parent)
  expect(await page.evaluate(() => window.resourceScene.sent)).toEqual([])
})
