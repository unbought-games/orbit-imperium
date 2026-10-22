import { expect, type Page } from '@playwright/test'

export async function menuDestination(page: Page, name: string) {
  const menu = page.getByRole('dialog', { name: 'Navigation', exact: true })
  if (!(await menu.isVisible())) {
    await page.getByRole('button', { name: 'Menu', exact: true }).click()
  }
  await expect(menu).toBeVisible()
  return menu.getByRole('link', { name, exact: false })
}

export async function navigate(page: Page, name: string) {
  const title = name[0].toUpperCase() + name.slice(1)
  const primary = ({ Overview: 'Empire', Empire: 'Empire', Resources: 'Build', Fleets: 'Fleet' } as Record<string, string>)[title]
  const direct = primary
    ? page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: primary, exact: true })
    : page.getByRole('navigation', { name: 'Build navigation', exact: true }).getByRole('link', { name: title, exact: true })
  if (await direct.isVisible()) await direct.click()
  else await (await menuDestination(page, title)).click()
}

export async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('dialog', { name: 'Navigation', exact: true })
    .getByRole('button', { name: 'Sign out', exact: true }).click()
}

// Healthy delivery is event-driven. Explicit foregrounding exercises its public
// refresh trigger after a fixture changes SQL or intercepts the next snapshot.
export async function foreground(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
}
