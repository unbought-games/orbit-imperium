import { expect, type Page } from '@playwright/test'

export async function openNavigation(page: Page) {
  const menu = page.getByRole('dialog', { name: 'Navigation', exact: true })
  if (await menu.isVisible()) return menu
  await page.getByRole('navigation', { name: 'Main navigation', exact: true }).waitFor({ state: 'visible' })
  const sidebar = page.getByRole('complementary', { name: 'Game navigation' })
  if (await sidebar.isVisible()) return sidebar
  if (!(await menu.isVisible()))
    await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await expect(menu).toBeVisible()
  return menu
}

export async function menuDestination(page: Page, name: string) {
  const navigation = await openNavigation(page)
  const sidebar = page.getByRole('complementary', { name: 'Game navigation' })
  if (await sidebar.isVisible()) {
    if (name === 'Resource settings')
      return page.getByRole('link', { name: 'Energy — resource settings', exact: true })
    if (name === 'Dispatch') {
      await navigate(page, 'Fleets')
      return page.getByRole('link', { name: 'Dispatch Fleet', exact: true })
    }
    return sidebar.getByRole('link', { name, exact: false })
  }
  return navigation.getByRole('link', { name, exact: false })
}

export async function navigate(page: Page, name: string) {
  const title = name[0].toUpperCase() + name.slice(1)
  if (await page.getByRole('dialog', { name: 'Navigation', exact: true }).isVisible()) {
    await (await menuDestination(page, title)).click()
    return
  }
  await page.getByRole('navigation', { name: 'Main navigation', exact: true }).waitFor({ state: 'visible' })
  const primary = ({ Overview: 'Empire', Empire: 'Empire', Resources: 'Develop', Galaxy: 'Galaxy', Fleets: 'Fleets' } as Record<string, string>)[title]
  const secondary = 'Develop navigation'
  const direct = primary
    ? page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: primary, exact: true })
    : page.getByRole('navigation', { name: secondary, exact: true }).getByRole('link', { name: title, exact: true })
  if (await direct.isVisible()) await direct.click()
  else await (await menuDestination(page, title)).click()
}

export async function signOut(page: Page) {
  await (await openNavigation(page)).getByRole('button', { name: 'Sign out', exact: true }).click()
}

// Healthy delivery is event-driven. Explicit foregrounding exercises its public
// refresh trigger after a fixture changes SQL or intercepts the next snapshot.
export async function foreground(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
}
