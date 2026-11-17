import { test, expect, type Locator, type Page } from './fixture'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'
import type {} from './shipyard.scenarios'

const body = '00000000-0000-4000-8000-000000000005'
const fighterPath = `/u/andromeda/b/${body}/shipyard/light-fighter`
const cargoPath = `/u/andromeda/b/${body}/shipyard/small-cargo`

async function loadedImage(image: Locator) {
  await expect(image).toBeVisible()
  await expect
    .poll(() =>
      image.evaluate((node) => {
        const image = node as HTMLImageElement
        return image.complete && image.naturalWidth > 0
      }),
    )
    .toBe(true)
}

async function noPageOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
}

// Unique browser risk: the new layout must preserve actual quantity/order handlers
// while persistent selection drives the canonical memory router and launch target.
test('Shipyard submits an order and selects another craft through canonical links', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await mount('shipyard')
  const order = page.getByRole('region', { name: 'New order', exact: true })
  const quantity = order.getByRole('textbox', { name: 'Shipyard quantity' })
  const build = order.getByRole('button', { name: 'Build', exact: true })
  await expect(build).toBeEnabled()
  await expect(page.getByLabel('Current route')).toHaveText(fighterPath)
  const customize = page.getByRole('button', { name: 'Customize', exact: true })
  await expect(customize).toBeVisible()
  await customize.click()
  await expect(page.getByLabel('Customization target')).toHaveText(
    'LightFighter',
  )
  await quantity.fill('4')
  await expect(order).toContainText('4 × Light Fighter')
  await expect(build).toBeEnabled()
  await page.evaluate(() => window.shipyardScene.progression.holdOrder())
  try {
    await build.click()
    await expect(build).toHaveText('Confirming')
    await expect(build).toBeDisabled()
    await expect(
      page.getByRole('group', { name: 'Latest action result' }),
    ).toContainText('Submitting action.')
  } finally {
    await page.evaluate(() =>
      window.shipyardScene.progression.finishOrder('Committed'),
    )
  }
  await expect(
    page.getByRole('group', { name: 'Latest action result' }),
  ).toContainText('Last submitted: 4 × Light Fighter')
  await expect(
    page.getByRole('group', { name: 'Latest action result' }),
  ).toContainText('Order confirmed.')
  await expect(quantity).toHaveValue('0')
  expect(
    await page.evaluate(() =>
      window.shipyardScene.progression.sent.map((item) => item.command),
    ),
  ).toEqual([
    {
      type: 'StartManufacture',
      body,
      item: { kind: 'Ship', id: 'LightFighter' },
      quantity: '4',
      expected_terms_hash: 'b'.repeat(64),
    },
  ])
  const rail = page.getByRole('navigation', { name: 'Choose a ship' })
  const cargo = rail.getByRole('link', {
    name: 'Build Small Cargo',
    exact: true,
  })
  await expect(cargo).toHaveAttribute('href', cargoPath)
  await cargo.focus()
  await cargo.press('Enter')
  await expect(page.getByLabel('Current route')).toHaveText(cargoPath)
  await expect(cargo).toHaveAttribute('aria-current', 'page')
  await expect(
    page.getByRole('heading', { name: 'Small Cargo', exact: true }),
  ).toBeVisible()
  await expect(build).toBeEnabled()
  await expect(customize).toHaveCount(0)
  await page
    .getByRole('link', {
      name: 'Build more Light Fighter in Shipyard',
      exact: true,
    })
    .click()
  await expect(page.getByLabel('Current route')).toHaveText(fighterPath)
  await expect(customize).toBeVisible()
  await expect(
    page.getByRole('group', { name: 'Latest action result' }),
  ).toContainText('Last submitted: 4 × Light Fighter')
})

// One display integration case: both consumers must keep usable artwork while a
// render is pending and reject another empire's snapshot, not just one helper.
test('Shipyard and owner inventory share current artwork and binding-safe fallbacks', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await mount('shipyard')
  const hero = page
    .getByRole('figure', { name: 'Light Fighter illustration' })
    .locator('img')
  const inventory = page.getByRole('region', {
    name: 'Owner inventory preview',
  })
  const thumbnail = inventory
    .getByRole('link', {
      name: 'Build more Light Fighter in Shipyard',
      exact: true,
    })
    .locator('img')
  for (const image of [hero, thumbnail]) {
    await expect(image).toHaveAttribute('src', /fixture=equipped/)
    await loadedImage(image)
  }
  await diagnosticScreenshot(page, {
    path: 'test-results/shipyard-equipped-1280x1000.png',
    fullPage: true,
  })
  await page.evaluate(() => window.shipyardScene.setAppearance('rendering'))
  for (const image of [hero, thumbnail])
    await expect(image).toHaveAttribute('src', /fixture=equipped/)
  await page.evaluate(() => window.shipyardScene.setAppearance('foreign'))
  await expect(
    page.getByRole('button', { name: 'Customize', exact: true }),
  ).toHaveCount(0)
  for (const image of [hero, thumbnail]) {
    await expect(image).toHaveAttribute(
      'src',
      /\/art\/atlas\/objects\/light-fighter-\d+\.webp$/,
    )
    await loadedImage(image)
  }
  await page.evaluate(() => window.shipyardScene.setAppearance('missing'))
  await expect(
    page.getByRole('button', { name: 'Customize', exact: true }),
  ).toBeVisible()
  for (const image of [hero, thumbnail])
    await expect(image).toHaveAttribute(
      'src',
      /\/art\/atlas\/objects\/light-fighter-\d+\.webp$/,
    )
  await expect(
    inventory
      .getByRole('row')
      .filter({
        has: page.getByRole('link', {
          name: 'Build more Light Fighter in Shipyard',
          exact: true,
        }),
      })
      .getByRole('cell'),
  ).toHaveText(['3', '3', '0', '0'])
})

// Mobile has a horizontally scrolling selection rail and a different detail grid.
// Keep this geometry risk separate from the desktop command/state permutations.
test('mobile Shipyard keeps selection, Customize and ordering within the viewport', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mount('shipyard')
  const build = page.getByRole('button', { name: 'Build', exact: true })
  await expect(build).toBeEnabled()
  await loadedImage(
    page
      .getByRole('figure', { name: 'Light Fighter illustration' })
      .locator('img'),
  )
  await noPageOverflow(page)
  const rail = page.getByRole('navigation', { name: 'Choose a ship' })
  expect(
    await rail.evaluate((element) => element.scrollWidth > element.clientWidth),
  ).toBe(true)
  const customize = page.getByRole('button', { name: 'Customize', exact: true })
  await customize.scrollIntoViewIfNeeded()
  await customize.click()
  await expect(page.getByLabel('Customization target')).toHaveText(
    'LightFighter',
  )
  const quantity = page.getByRole('textbox', { name: 'Shipyard quantity' })
  await quantity.fill('2')
  await expect(build).toBeEnabled()
  await expect(
    page.getByRole('region', { name: 'New order', exact: true }),
  ).toContainText('2 × Light Fighter')
  await noPageOverflow(page)
  await diagnosticScreenshot(page, {
    path: 'test-results/shipyard-order-mobile-390x844.png',
    fullPage: true,
  })
  await rail
    .getByRole('link', { name: 'Build Small Cargo', exact: true })
    .click()
  await expect(page.getByLabel('Current route')).toHaveText(cargoPath)
  await expect(
    page.getByRole('heading', { name: 'Small Cargo', exact: true }),
  ).toBeVisible()
  await expect(customize).toHaveCount(0)
  await expect(build).toBeEnabled()
  await noPageOverflow(page)
})
