import { expect, test } from './fixture'
import { id } from '../../src/test-support/bootstrap'

test('keyboard opens each full stockpile warning on its own storage link', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mount('shell-large-stocks')
  const strip = page.getByRole('group', {
    name: 'Planet and resources',
    exact: true,
  })
  for (const [name, slug] of [
    ['Metal', 'metal-storage'],
    ['Crystal', 'crystal-storage'],
    ['Deuterium', 'deuterium-tank'],
  ]) {
    const trigger = strip.getByRole('button', {
      name: `${name} details`,
      exact: true,
    })
    await trigger.focus()
    await trigger.press('Escape')
    await trigger.press('Enter')
    const dialog = page.getByRole('dialog', { name, exact: true })
    const link = dialog.getByRole('link', { name: 'Storage full', exact: true })
    await expect(link).toHaveAttribute(
      'href',
      `/u/andromeda/b/${id(5)}/resources/${slug}`,
    )
    await page.keyboard.press('Tab')
    await expect(link).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  }
})

test('enlarged resource queue and detail keep their cancellation control and refund readable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 })
  await page.goto('/?scenario=resources&mode=active')
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'resources',
  )
  await page.addStyleTag({
    content:
      'html { font-size: 200% !important } * { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; }',
  })
  const queue = page.getByRole('region', { name: 'Buildings', exact: true })
  await queue.scrollIntoViewIfNeeded()
  await expect(queue).toBeInViewport()
  await page
    .getByRole('link', { name: 'Upgrade Metal Mine', exact: true })
    .click()
  const quote = page.getByRole('region', { name: 'Progression quote' })
  const cancel = quote.getByRole('button', {
    name: 'Cancel construction',
    exact: true,
  })
  await cancel.scrollIntoViewIfNeeded()
  await expect(cancel).toBeEnabled()
  await expect(cancel).toBeInViewport()
  await expect(
    quote.getByText('Refund on cancel', { exact: true }),
  ).toHaveCount(1)
  await expect(quote).not.toContainText('A quote reserves nothing')
})

test('resource catalog exposes the funded Settings link at compact and desktop widths', async ({
  page,
}) => {
  await page.goto('/?scenario=resources')
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'resources',
  )
  const link = page
    .getByRole('region', { name: 'Resource buildings', exact: true })
    .getByRole('link', { name: 'Resource settings', exact: true })
  await expect(link).toHaveAttribute(
    'href',
    `/u/andromeda/b/${id(5)}/resource-settings`,
  )
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(link).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  }
  await link.focus()
  await expect(link).toBeFocused()
})
