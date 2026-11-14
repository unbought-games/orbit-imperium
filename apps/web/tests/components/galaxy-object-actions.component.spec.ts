import { test, expect, type Locator, type Page } from './fixture'

async function clickSurface(page: Page, surface: Locator) {
  const bounds = (await surface.boundingBox())!
  await page.mouse.click(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  )
}

for (const width of [320, 1280]) {
  test(`object menus preserve planet/moon targets and independent player profiles at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await mount('galaxy-traffic')
    const row = page.getByRole('article').first()
    const planet = row.getByRole('button', {
      name: 'Actions for [1:371:2]',
      exact: true,
    })
    const planetMenu = page.getByRole('menu', {
      name: 'Missions to [1:371:2]',
      exact: true,
    })
    // The image and title are passive content above a native sibling menu trigger.
    // Physical hit testing proves the planet surface works without nesting links in buttons.
    await clickSurface(page, row.locator('img').first())
    await expect(planetMenu).toBeVisible()
    await expect(planetMenu).toContainText(
      'Andromeda listening post with a very long name',
    )
    await expect(
      planetMenu.getByRole('menuitem', { name: 'Spy', exact: true }),
    ).toBeEnabled()
    await page.keyboard.press('Escape')
    await clickSurface(
      page,
      row.getByText('Andromeda listening post with a very long name', {
        exact: true,
      }),
    )
    await expect(planetMenu).toBeVisible()
    await planetMenu
      .getByRole('menuitem', { name: 'Spy with…', exact: true })
      .click()
    await expect(page.getByLabel('Requested mission')).toHaveText(
      '2 Espionage planet',
    )
    await expect(planetMenu).toBeHidden()
    await expect(planet).toBeFocused()

    const moon = row.getByRole('button', {
      name: 'Actions for moon [1:371:2]',
      exact: true,
    })
    await moon.press('Enter')
    const moonMenu = page.getByRole('menu', {
      name: 'Missions to moon [1:371:2]',
      exact: true,
    })
    await expect(moonMenu).toContainText('8,500 km')
    await moonMenu
      .getByRole('menuitem', { name: 'Spy with…', exact: true })
      .click()
    await expect(page.getByLabel('Requested mission')).toHaveText(
      '2 Espionage moon',
    )
    await expect(moon).toBeFocused()

    const profile = row.getByRole('link', {
      name: 'commander_andromeda_1234567890 profile details',
      exact: true,
    })
    // Measure the clipped, interactive name surface, not its overflowing text span.
    const profileBox = (await profile.boundingBox())!
    const moonBox = (await moon.boundingBox())!
    expect(moonBox.x).toBeGreaterThanOrEqual(profileBox.x + profileBox.width)
    expect(moonBox.width).toBeGreaterThanOrEqual(44)
    expect(moonBox.height).toBeGreaterThanOrEqual(44)
    await profile.hover()
    await expect(
      page.getByText('EMPIRE DOSSIER', { exact: true }),
    ).toBeVisible()
    await expect(planetMenu).toBeHidden()
    await expect(moonMenu).toBeHidden()
    await expect(profile).toHaveAttribute('href', /\/profiles\/empire\//)
    await page.keyboard.press('Escape')
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width)
    await page
      .getByRole('button', { name: 'Block missions', exact: true })
      .click()
    await planet.press('Enter')
    await expect(planetMenu).toBeVisible()
    await expect(
      planetMenu.getByRole('menuitem', { name: 'Spy', exact: true }),
    ).toBeDisabled()
    await expect(
      planetMenu.getByRole('menuitem', { name: 'Transport', exact: true }),
    ).toBeDisabled()
    await expect(planetMenu).toContainText('This player is in vacation mode')
  })
}
