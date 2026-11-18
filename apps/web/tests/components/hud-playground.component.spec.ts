import { expect, test } from './fixture'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'
const output = 'test-results/hud'
test('mobile HUD events, priority, reports, slots, and reset work without game requests', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install({ time: new Date('2026-10-27T12:00:00Z') })
  await mount('hud-playground')
  const orb = page.getByTestId('hud-orb')
  await expect(orb).toHaveAttribute('data-tone', 'champagne')
  await expect(orb).toHaveAccessibleName('3 unread messages. Open command HUD')
  await diagnosticScreenshot(page, { path: `${output}/signin-390x844.png` })
  await page.clock.runFor(8000)
  await expect(orb).toHaveAttribute('data-tone', 'champagne')
  await orb.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await diagnosticScreenshot(page, { path: `${output}/inbox-390x844.png` })
  await page.getByRole('button', { name: 'Close HUD' }).click()
  await expect(orb).toHaveAttribute('data-tone', 'ice')
  await diagnosticScreenshot(page, { path: `${output}/idle-390x844.png` })
  await page.getByRole('button', { name: 'Incoming spy', exact: true }).click()
  await page.getByRole('button', { name: 'Build mine', exact: true }).click()
  await expect(orb).toHaveAttribute('data-tone', 'red')
  await orb.click()
  await expect(
    page.getByRole('heading', { name: 'Enemy probes detected' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Acknowledge threats' }).click()
  await expect(orb).toHaveAttribute('data-tone', 'green')
  await page.clock.runFor(8000)
  await expect(orb).toHaveAttribute('data-tone', 'ice')
  await page
    .getByRole('button', { name: 'Receive report', exact: true })
    .click()
  await page
    .getByRole('button', { name: /Espionage report.*Tap to decrypt/ })
    .click()
  await expect(page.getByRole('dialog').getByText('842,500')).toBeVisible()
  await expect(
    page.getByRole('dialog').getByRole('img', { name: 'Metal', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('dialog').locator('img')).toHaveJSProperty(
    'complete',
    true,
  )
  await diagnosticScreenshot(page, {
    path: `${output}/report-open-390x844.png`,
  })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page
    .getByRole('button', { name: 'Receive message', exact: true })
    .click()
  await page
    .getByRole('button', { name: /Alliance transmission.*Tap to read/ })
    .click()
  await expect(page.getByRole('dialog')).toContainText('Alliance transmission')
  await page.getByRole('button', { name: 'Close HUD' }).click()
  await page
    .getByRole('button', { name: 'Incoming attack', exact: true })
    .click()
  await orb.click()
  await expect(
    page.getByRole('heading', { name: 'Hostile fleet inbound' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Acknowledge threats' }).click()
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  for (let i = 0; i < 3; i++)
    await page.getByRole('button', { name: 'Send probe', exact: true }).click()
  await expect(
    page.getByLabel('Recent events').getByRole('button'),
  ).toHaveCount(3)
  if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
    await page.evaluate(() => window.scrollTo(0, 0))
    await diagnosticScreenshot(page, { path: `${output}/stack-390x844.png` })
  }
  for (let i = 0; i < 3; i++)
    await page.getByRole('button', { name: 'Send probe', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Send probe', exact: true }),
  ).toBeDisabled()
  await page.clock.runFor(85000)
  await expect(
    page.getByLabel('Recent events').getByRole('button'),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Send probe', exact: true }),
  ).toBeEnabled()
  await page
    .getByRole('button', { name: 'Simulate sign-in', exact: true })
    .click()
  await expect(orb).toHaveAccessibleName('3 unread messages. Open command HUD')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})

test('normal motion animates the orb and opens a fully opaque readable report', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mount('hud-playground')
  const orb = page.getByTestId('hud-orb')
  expect(
    await orb.evaluate(
      (node) => getComputedStyle(node, '::before').animationName,
    ),
  ).not.toBe('none')
  await page
    .getByRole('button', { name: 'Receive report', exact: true })
    .click()
  await page
    .getByRole('button', { name: /Espionage report.*Tap to decrypt/ })
    .click()
  await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1')
  await diagnosticScreenshot(page, {
    path: `${output}/report-motion-390x844.png`,
  })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Queue ships', exact: true }).click()
  await expect(orb).toHaveAttribute('data-tone', 'green')
  const toast = page.getByRole('button', {
    name: /Shipyard order accepted.*Queue/,
  })
  await expect(toast).toHaveCSS('opacity', '1')
  if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
    await page.evaluate(() => window.scrollTo(0, 0))
    await diagnosticScreenshot(page, {
      path: `${output}/animated-success-390x844.png`,
    })
  }
})

test('swiping dismisses individual toasts, short drags settle, and taps still open reports', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mount('hud-playground')
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await page.getByRole('button', { name: 'Send probe', exact: true }).click()
  await page
    .getByRole('button', { name: 'Receive report', exact: true })
    .click()
  await page.evaluate(() => window.scrollTo(0, 0))
  const report = page.getByRole('button', {
    name: /Espionage report.*Tap to decrypt/,
  })
  await expect(report).toHaveCSS('opacity', '1')
  let box = (await report.boundingBox())!
  const origin = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.move(origin.x, origin.y)
  await page.mouse.down()
  await page.mouse.move(origin.x + 10, origin.y, { steps: 5 })
  await page.mouse.up()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(report).toBeVisible()
  await expect(page.getByTestId('swipeable-toast').first()).toHaveCSS(
    'transform',
    'none',
  )
  box = (await report.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 95, box.y + box.height / 2, {
    steps: 10,
  })
  await diagnosticScreenshot(page, { path: `${output}/swipe-drag-390x844.png` })
  await page.mouse.up()
  await expect(report).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Probe away/ })).toBeVisible()
  await expect(page.getByTestId('hud-orb')).toHaveAccessibleName(
    '1 unread messages. Open command HUD',
  )
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await diagnosticScreenshot(page, {
    path: `${output}/swipe-dismissed-390x844.png`,
  })
  const probe = page.getByRole('button', { name: /Probe away/ })
  box = (await probe.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 - 100, box.y + box.height / 2, {
    steps: 10,
  })
  await page.mouse.up()
  await expect(probe).toHaveCount(0)
  await page
    .getByRole('button', { name: 'Receive report', exact: true })
    .click()
  await page
    .getByRole('button', { name: /Espionage report.*Tap to decrypt/ })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Espionage report', exact: true }),
  ).toBeVisible()
})

test('native touch swipes dismiss without acknowledging threats; vertical gestures retain scrolling', async ({
  page,
  context,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mount('hud-playground')
  await page
    .getByRole('button', { name: 'Incoming attack', exact: true })
    .click()
  await page.evaluate(() => window.scrollTo(0, 0))
  const toast = page.getByRole('button', {
    name: /Hostile fleet inbound.*18 ships/,
  })
  const box = (await toast.boundingBox())!
  const touch = await context.newCDPSession(page)
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y }],
  })
  for (let i = 1; i <= 6; i++)
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + i * 18, y }],
    })
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  })
  await expect(toast).toHaveCount(0)
  await expect(page.getByTestId('hud-orb')).toHaveAttribute('data-tone', 'red')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page
    .getByRole('button', { name: 'Receive message', exact: true })
    .click()
  const message = page.getByRole('button', {
    name: /Alliance transmission.*Tap to read/,
  })
  const rect = (await message.boundingBox())!
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: rect.x + 100, y: rect.y + 20 }],
  })
  for (let i = 1; i <= 6; i++)
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: rect.x + 100, y: rect.y + 20 - i * 20 }],
    })
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  })
  await expect(message).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0)
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await touch.detach()
})
