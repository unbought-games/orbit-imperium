import { test, expect } from './fixtures/test'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { installGameFixture, body, id } from './fixtures/game'

import { withBootstrapResponse } from './fixtures/responses'


import {now,fleet} from './fixtures/mission-traffic'


async function interactiveFixture(
  page: import('@playwright/test').Page,
  screen: 'fleets' | 'overview',
) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.setFixedTime(now)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => {} },
    })
  })
  await installGameFixture(page, {
    protocol: 4,
    sampledAt: now,
    bodies: [{ ...body, name: 'Hades' }],
    missions: {
      fleets: [fleet(31, 'Attack', 600000)],
      incoming: [],
      fleet_slots: '8',
      score_value_micro: '0',
    },
  })
  const path = `/u/andromeda/b/${body.id}/${screen}`
  await withBootstrapResponse(page, () => page.goto(path))
  const row = page.getByRole(screen === 'fleets' ? 'article' : 'listitem', {
    name: 'Attack fleet',
    exact: true,
  })
  await expect(row).toBeVisible()
  await row.evaluate((el) =>
    window.scrollBy(0, el.getBoundingClientRect().top - 80),
  )
  return { row, path, details: `/u/andromeda/b/${body.id}/fleets/${id(31)}` }
}

for (const screen of ['fleets'] as Array<'fleets' | 'overview'>) {
  for (const width of [1280]) {
    test(`${screen} row opens details without stealing controls at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      const { row, path, details } = await interactiveFixture(page, screen)
      const link = row.getByRole('link', {
        name: 'View Attack outbound fleet',
        exact: true,
      })
      const toggle = row.getByRole('button', {
        name: 'Attack ship composition: 13 ships',
      })
      await expect(
        row.getByText('Mission details', { exact: true }),
      ).toHaveCount(0)
      await expect(link).toHaveAttribute('href', details)
      if (screen === 'overview') await page.evaluate(() => scrollTo(0, 0))
      await diagnosticScreenshot(page, {
        path: `test-results/${screen}-clickable-default-${width}x900.png`,
        animations: 'disabled',
      })
      await page.mouse.move(0, 0)
      const idle = await row.evaluate((el) => ({
        border: getComputedStyle(el).borderColor,
        background: getComputedStyle(el).backgroundColor,
      }))
      const box = (await row.boundingBox())!
      const blank = { x: box.width / 2, y: 4 }
      await row.hover({ position: blank })
      await expect
        .poll(() => row.evaluate((el) => getComputedStyle(el).backgroundColor))
        .not.toBe(idle.background)
      await diagnosticScreenshot(page, {
        path: `test-results/${screen}-clickable-hover-${width}x900.png`,
        animations: 'disabled',
      })
      await row.hover({ position: blank })
      await page.mouse.down()
      const toggleBox = (await toggle.boundingBox())!
      await page.mouse.move(
        toggleBox.x + toggleBox.width / 2,
        toggleBox.y + toggleBox.height / 2,
      )
      await page.mouse.up()
      await expect(page).toHaveURL(path)
      await expect(toggle).toHaveAttribute('aria-expanded', 'false')
      await toggle.hover()
      await expect
        .poll(() => row.evaluate((el) => getComputedStyle(el).backgroundColor))
        .toBe(idle.background)
      const coordinate = row.getByRole('link', {
        name: 'View destination [1:15:7] in galaxy',
        exact: true,
      })
      await expect(toggle).toHaveAttribute('aria-expanded', 'false')
      await coordinate.click({ button: 'right' })
      await diagnosticScreenshot(page, {
        path: `test-results/${screen}-coordinate-menu-${width}x900.png`,
      })
      await page
        .getByRole('menuitem', { name: 'Copy coordinates', exact: true })
        .click()
      await expect(row.getByRole('status')).toHaveText('Coordinates copied.')
      await expect(page).toHaveURL(path)
      await coordinate.click({ button: 'right' })
      await page
        .getByRole('menuitem', { name: 'Copy location link', exact: true })
        .click()
      await expect(page.getByRole('menu')).toHaveCount(0)
      await expect(page).toHaveURL(path)
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      await expect(page).toHaveURL(path)
      await row
        .getByRole('button', { name: 'Review recall', exact: true })
        .click()
      await expect(
        row.getByRole('region', { name: 'Review recall' }),
      ).toBeVisible()
      await expect(page).toHaveURL(path)
      await row.getByRole('button', { name: 'Keep mission' }).click()
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-expanded', 'false')

      // Selecting ordinary row text is not a request to navigate.
      const cargo = row.getByRole('group', { name: 'Carried resources' })
      await cargo.dispatchEvent('pointerdown', {
        button: 0,
        pointerType: 'mouse',
      })
      await cargo.evaluate((el) => {
        const selection = window.getSelection()!
        const range = document.createRange()
        range.selectNodeContents(el)
        selection.removeAllRanges()
        selection.addRange(range)
      })
      await cargo.dispatchEvent('pointerup', {
        button: 0,
        pointerType: 'mouse',
      })
      await cargo.dispatchEvent('click', { button: 0 })
      await expect(page).toHaveURL(path)
      await page.evaluate(() => window.getSelection()?.removeAllRanges())

      if (width === 1280) {
        // A modified row click retains native link/new-tab behavior.
        // The popup contract is native tab creation at the exact fleet URL.
        // The Enter action below separately renders and verifies this detail.
        await page.context().route(url => url.pathname === details, route =>
          route.request().resourceType() === 'document' && route.request().method() === 'GET'
            ? route.fulfill({ contentType: 'text/html', body: '<title>Fleet destination</title>' })
            : route.fallback(), { times: 1 })
        const before = page.context().pages().length
        await row.click({ position: blank, modifiers: ['ControlOrMeta'] })
        await expect.poll(() => page.context().pages().length).toBe(before + 1)
        const extra = page
          .context()
          .pages()
          .find((candidate) => candidate !== page)!
        await expect(extra).toHaveURL(details)
        await extra.close()
        await expect(page).toHaveURL(path)
      }

      await link.focus()
      await page.keyboard.press('Tab')
      await page.keyboard.press('Shift+Tab')
      await expect(link).toBeFocused()
      await expect(row).toHaveCSS('outline-style', 'solid')
      await diagnosticScreenshot(page, {
        path: `test-results/${screen}-clickable-focus-${width}x900.png`,
        animations: 'disabled',
      })
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(details)
      await expect(
        page.getByRole('article', { name: 'Attack fleet' }),
      ).not.toHaveAttribute('data-clickable')
      await page.goBack()
      await expect(page).toHaveURL(path)
      await expect(row).toBeVisible()
      // Verify history focus, then move focus into the row before the pointer
      // gesture. This keeps a deferred heading-reveal callback from scrolling
      // the target away between hover and mouse-down on a busy runner.
      await expect(page.locator('main h1')).toBeFocused()
      await link.focus()
      await expect(link).toBeFocused()
      await row.evaluate((el) =>
        window.scrollBy(0, el.getBoundingClientRect().top - 80),
      )
      await row.getByRole('img', { name: /^Outbound:/ }).hover()
      await page.mouse.down()
      await expect(row).toHaveAttribute('data-pressed', 'true')
      await expect(row).not.toHaveCSS('border-color', idle.border)
      await diagnosticScreenshot(page, {
        path: `test-results/${screen}-clickable-pressed-${width}x900.png`,
        animations: 'disabled',
      })
      await page.mouse.up()
      await expect(page).toHaveURL(details)
    })
  }
}

// The Overview journey retains actual HUD embedding; shared card behavior is isolated.
