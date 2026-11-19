import { test, expect } from './fixture'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'
test('supporter preview compares identities without a session or game requests', async ({
  page,
  mount,
}) => {
  const apiRequests: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/'))
      apiRequests.push(request.url())
  })
  await mount('supporter-preview')
  const account = page.getByRole('region', { name: 'Account preview' })
  const galaxy = page.getByRole('region', { name: 'Galaxy preview' })
  await expect(
    account.getByRole('img', { name: 'Supporter · $25 / month USD' }),
  ).toBeVisible()
  await expect(galaxy.getByRole('img', { name: /Supporter/ })).toHaveCount(3)
  await expect(galaxy.getByText('Wayfarer', { exact: true })).toBeVisible()
  await page
    .getByLabel('03 / Try your name')
    .fill('ACommanderWithAnExtraordinarilyLongName')
  await page
    .getByRole('button', { name: 'Preview $100 / month', exact: true })
    .click()
  await expect(
    account.getByRole('img', { name: 'Supporter · $100 / month USD' }),
  ).toBeVisible()
  const name = account.getByText('ACommanderWithAnExtraordinarilyLongName', {
    exact: true,
  })
  await expect(name.locator('..')).toHaveCSS('color', 'rgb(242, 187, 131)')
  await page.getByRole('button', { name: /Aurora/ }).click()
  await expect(name.locator('..')).toHaveCSS('color', 'rgb(240, 203, 122)')
  await page.getByRole('button', { name: /Celestial/ }).click()
  await page.getByRole('button', { name: /Signature star/ }).click()
  await expect(
    page.getByRole('button', { name: /Signature star/ }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(
    account
      .getByRole('img', { name: 'Supporter · $100 / month USD' })
      .locator('svg'),
  ).toHaveClass(/lucide-star/)
  await galaxy
    .getByRole('button', { name: /^Actions for \[/ })
    .first()
    .press('Enter')
  await page.getByRole('menuitem', { name: 'Transport', exact: true }).click()
  await expect(page.getByRole('status')).toContainText(
    'No mission has been sent',
  )
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  }
  expect(apiRequests).toEqual([])
  await page.getByLabel('03 / Try your name').fill('StellarNomad')
  await page.getByRole('button', { name: /Starlight/ }).click()
  await page.getByRole('button', { name: /Signature star/ }).click()
  await page
    .getByRole('button', { name: 'Preview $25 / month', exact: true })
    .click()
  await page.setViewportSize({ width: 1440, height: 1200 })
  await diagnosticScreenshot(page, {
    path: 'test-results/supporter-preview-desktop.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await diagnosticScreenshot(page, {
    path: 'test-results/supporter-preview-mobile.png',
    fullPage: true,
  })
})
