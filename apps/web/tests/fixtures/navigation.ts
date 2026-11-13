import { expect, type Page } from '@playwright/test'

async function leaveContextNavigation(page: Page) {
  const back = page
    .getByRole('complementary', { name: 'Section sidebar' })
    .getByRole('link', { name: 'Back to game', exact: true })
  if (await back.isVisible()) await back.click()
}

export async function openNavigation(page: Page) {
  await leaveContextNavigation(page)
  await page
    .getByRole('navigation', { name: 'Main navigation', exact: true })
    .waitFor({ state: 'visible' })
  const sidebar = page.getByRole('complementary', { name: 'Game navigation' })
  if (await sidebar.isVisible()) return sidebar
  const menu = page.getByRole('main')
  if (
    !(await page
      .getByRole('navigation', { name: 'Menu destinations' })
      .isVisible())
  )
    await page.getByRole('link', { name: 'Menu', exact: true }).click()
  await expect(
    page.getByRole('navigation', { name: 'Menu destinations' }),
  ).toBeVisible()
  return menu
}

export async function menuDestination(page: Page, name: string) {
  if (name === 'Resource settings')
    return page.getByRole('link', {
      name: 'Energy — resource settings',
      exact: true,
    })
  if (name === 'Dispatch') {
    await navigate(page, 'Fleets')
    return page.getByRole('link', { name: 'Dispatch Fleet', exact: true })
  }
  if (
    ['Resources', 'Facilities', 'Research', 'Shipyard', 'Defense'].includes(
      name,
    )
  ) {
    const develop = page.getByRole('navigation', {
      name: 'Develop navigation',
      exact: true,
    })
    if (!(await develop.isVisible())) await navigate(page, 'Resources')
    return develop.getByRole('link', { name, exact: true })
  }
  const navigation = await openNavigation(page)
  const sidebar = page.getByRole('complementary', { name: 'Game navigation' })
  if ((await sidebar.isVisible()) && name === 'Settings') {
    await sidebar
      .getByRole('button', { name: 'Account menu', exact: true })
      .click()
    return page.getByRole('menuitem', { name: 'Settings', exact: true })
  }
  // Settings must not also match Resource settings in the mobile menu.
  return navigation.getByRole('link', { name, exact: name === 'Settings' })
}

export async function navigate(page: Page, name: string) {
  await leaveContextNavigation(page)
  const title = name[0].toUpperCase() + name.slice(1)
  await page
    .getByRole('navigation', { name: 'Main navigation', exact: true })
    .waitFor({ state: 'visible' })
  const primary = (
    {
      Overview: 'Empire',
      Empire: 'Empire',
      Resources: 'Develop',
      Galaxy: 'Galaxy',
      Fleets: 'Fleets',
    } as Record<string, string>
  )[title]
  const secondary = 'Develop navigation'
  const direct = primary
    ? page
        .getByRole('navigation', { name: 'Main navigation', exact: true })
        .getByRole('link', { name: primary, exact: true })
    : page
        .getByRole('navigation', { name: secondary, exact: true })
        .getByRole('link', { name: title, exact: true })
  if (await direct.isVisible()) await direct.click()
  else await (await menuDestination(page, title)).click()
}

export async function signOut(page: Page) {
  const navigation = await openNavigation(page)
  const account = navigation.getByRole('button', {
    name: 'Account menu',
    exact: true,
  })
  if (await account.isVisible()) {
    await account.click()
    await page.getByRole('menuitem', { name: 'Logout', exact: true }).click()
  } else {
    await navigation
      .getByRole('button', { name: 'Log out', exact: true })
      .click()
  }
}

// Healthy delivery is event-driven. Explicit foregrounding exercises its public
// refresh trigger after a fixture changes SQL or intercepts the next snapshot.
export async function foreground(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
}
