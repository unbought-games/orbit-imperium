import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'
import { test, expect } from './fixture'
import { id } from '../../src/test-support/bootstrap'

for (const width of [320, 390, 1440]) {
  test(`body selector preserves labels, keyboard, pointer and focus at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await mount('shell-worlds')
    const trigger = page.getByRole('combobox', { name: 'Selected body' })
    await expect(trigger).toContainText('Martialis')
    await expect(trigger).toHaveAttribute('data-value', id(5))
    await expect(
      page.getByRole('searchbox', { name: 'Search owned worlds' }),
    ).toHaveCount(0)
    await trigger.click()
    const list = page.getByRole('listbox')
    const options = page.getByRole('option')
    await expect(options).toHaveText([
      'Martialis [1:19:6]',
      'Moon [1:19:6]',
      'Nova Roma [1:1:3]',
      'A long planet name that wraps safely [1:1:4]',
    ])
    await expect(options.first()).toHaveAttribute('aria-selected', 'true')
    await expect(options.first().locator('svg')).toHaveClass(/lucide-check/)
    for (const option of await options.all()) {
      await expect(option.locator('img')).toBeVisible()
      await expect
        .poll(() =>
          option
            .locator('img')
            .evaluate((img: HTMLImageElement) => img.naturalWidth),
        )
        .toBeGreaterThan(0)
    }
    const box = (await list.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(width)
    expect(box.y + box.height).toBeLessThanOrEqual(900)
    await diagnosticScreenshot(page, {
      path: `test-results/shell-components/body-selector-open-${width}x900.png`,
    })
    await page.keyboard.press('Escape')
    await expect(list).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await expect(trigger).toHaveAttribute('data-value', id(5))
    await trigger.press('Enter')
    await expect(options.first()).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(trigger).toHaveAttribute('data-value', id(8))
    await trigger.click()
    await expect(options.nth(2)).toBeFocused()
    await page.keyboard.press('Home')
    await page.keyboard.press('n')
    await expect(options.nth(2)).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(trigger).toHaveAttribute('data-value', id(8))
    await trigger.click()
    await options.last().click()
    await expect(trigger).toHaveAttribute('data-value', id(9))
    await trigger.click()
    await expect(options.last()).toBeFocused()
    await page.mouse.click(width - 10, 800)
    await expect(list).toHaveCount(0)
    await expect(trigger).toHaveAttribute('data-value', id(9))
  })
}

test.describe('short touch roster', () => {
  test.use({
    viewport: { width: 320, height: 480 },
    isMobile: true,
    hasTouch: true,
  })
  test('body selector scrolls a large roster and selects by touch', async ({
    page,
    mount,
  }) => {
    await mount('shell-roster')
    const trigger = page.getByRole('combobox', { name: 'Selected body' })
    await trigger.tap()
    const list = page.getByRole('listbox')
    await expect(list).toBeVisible()
    const box = (await list.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(320)
    expect(box.y + box.height).toBeLessThanOrEqual(480)
    expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
      true,
    )
    const last = page.getByRole('option', {
      name: 'World 12 [1:1:12]',
      exact: true,
    })
    await last.scrollIntoViewIfNeeded()
    await last.tap()
    await expect(trigger).toHaveAttribute('data-value', id(31))
    await expect(list).toHaveCount(0)
  })
})

test('shrinking the account menu closes its portal and returns focus to the mobile menu', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mount('shell-default')
  const account = page.getByRole('button', {
    name: 'Account menu',
    exact: true,
  })
  await account.click()
  const popup = page.getByRole('menu', { name: 'Account menu', exact: true })
  await expect(popup).toBeVisible()
  await page.setViewportSize({ width: 390, height: 900 })
  await expect(popup).toBeHidden()
  await expect(
    page.getByRole('link', { name: 'Menu', exact: true }),
  ).toBeFocused()
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(account).toHaveAttribute('aria-expanded', 'false')
  await account.click()
  await expect(popup).toBeVisible()
})

test.describe('desktop touch controls', () => {
  test.use({ viewport: { width: 1024, height: 900 }, hasTouch: true })
  test('sidebar and account menu retain full touch targets', async ({
    page,
    mount,
  }) => {
    await mount('shell-default')
    const sidebar = page.getByRole('complementary', { name: 'Game navigation' })
    expect(
      await sidebar
        .locator('a, button')
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => node.getBoundingClientRect().height < 44)
            .map((node) => node.textContent),
        ),
    ).toEqual([])
    await sidebar
      .getByRole('button', { name: 'Account menu', exact: true })
      .tap()
    const menu = page.getByRole('menu', { name: 'Account menu', exact: true })
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('menuitem')).toHaveText([
      'My Orbit profile',
      'Settings',
      'Logout',
    ])
    await expect(
      menu.getByRole('menuitem', { name: 'My Orbit profile' }),
    ).toHaveAttribute('href', '/profile')
    for (const item of await menu.getByRole('menuitem').all())
      expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await menu.getByRole('menuitem', { name: 'Settings', exact: true }).tap()
    await expect(page.locator('main h1')).toHaveText('Settings')
    await expect(menu).toBeHidden()
    await sidebar.getByRole('link', { name: 'Facilities', exact: true }).tap()
    await expect(page.locator('main h1')).toHaveText('Facilities')
  })
})

for (const width of [390, 1440]) {
  test(`navigation renders work and blocked badges and clears alerts at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await mount('shell-badges')
    await page.getByRole('link', { name: 'Develop', exact: true }).click()
    const develop = page.getByRole('navigation', {
      name: 'Develop navigation',
      exact: true,
    })
    const active = develop.getByRole('link', { name: 'Resources', exact: true })
    const blocked = develop.getByRole('link', {
      name: 'Facilities',
      exact: true,
    })
    await expect(active).toHaveAttribute('aria-description', 'Work in progress')
    await expect(active).toHaveAttribute('title', 'Work in progress')
    await expect(active.locator('span[aria-hidden="true"]')).toHaveCSS(
      'background-color',
      'rgb(203, 182, 141)',
    )
    await expect(blocked).toHaveAttribute(
      'aria-description',
      'Blocked while a resource building is under construction',
    )
    await expect(blocked).toHaveAttribute(
      'title',
      'Blocked while a resource building is under construction',
    )
    await expect(blocked.locator('span[aria-hidden="true"]')).toHaveCSS(
      'background-color',
      'rgb(89, 97, 104)',
    )
    const alert = page
      .getByRole('navigation', { name: 'Main navigation', exact: true })
      .getByLabel('Unread reports', { exact: true })
    await expect(alert).toBeVisible()
    await blocked.click()
    await expect(page.locator('main h1')).toHaveText('Facilities')
    await page.getByRole('button', { name: 'Clear prepared alerts' }).click()
    await expect(alert).toHaveCount(0)
    await expect(active).not.toHaveAttribute('aria-description')
    await expect(active.locator('span[aria-hidden="true"]')).toHaveCount(0)
    await expect(blocked).not.toHaveAttribute('aria-description')
    await expect(blocked.locator('span[aria-hidden="true"]')).toHaveCount(0)
  })
}
