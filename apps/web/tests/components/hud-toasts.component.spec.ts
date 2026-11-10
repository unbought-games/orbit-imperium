import { expect, test, type Locator, type Page } from './fixture'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'

const stack = (page: Page) => page.getByLabel('Recent game events')
const cards = (page: Page) => stack(page).getByTestId('swipeable-toast')
const top = (page: Page) => stack(page).getByRole('button')
const opened = (page: Page) =>
  page.getByLabel('Opened notices', { exact: true })
const dismissed = (page: Page) =>
  page.getByLabel('Dismissed notices', { exact: true })
const translation = (card: Locator) =>
  card.evaluate((element) => {
    const transform = getComputedStyle(element).transform
    return transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m41
  })

// These contracts concern native input, focus and geometry. Reduced motion
// disables decorative notice lifetime CSS; no expiry timers or animations are
// intercepted. Motion still drives the actual drag transform before release.
test.beforeEach(async ({ page, mount }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mount('hud-toasts')
  await expect(cards(page)).toHaveCount(3)
  await expect(top(page)).toHaveAccessibleName(/^Construction started/)
})

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`covered toast cards stay compact and cannot receive focus or pointer input at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await expect(top(page)).toBeInViewport()
    await top(page).focus()
    for (const depth of [1, 2]) {
      const covered = stack(page).locator(`[data-toast-depth="${depth}"]`)
      await expect(covered).toHaveAttribute('inert', '')
      await expect(covered).toHaveAttribute('aria-hidden', 'true')
      await expect(covered).toHaveCSS('pointer-events', 'none')
      await covered
        .locator('button')
        .evaluate((button: HTMLButtonElement) => button.focus())
      await expect(top(page)).toBeFocused()
    }
    await page.keyboard.press('Tab')
    await expect(
      page.getByRole('button', { name: 'After notifications', exact: true }),
    ).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(top(page)).toBeFocused()

    const boxes = await stack(page)
      .locator('[data-toast-depth]')
      .evaluateAll((items) =>
        items.map((item) => {
          const box = item.getBoundingClientRect()
          return {
            top: box.top,
            bottom: box.bottom,
            left: box.left,
            right: box.right,
            height: box.height,
          }
        }),
      )
    expect(Math.min(...boxes.map((box) => box.top))).toBeGreaterThanOrEqual(
      boxes[0].top - 12,
    )
    expect(Math.max(...boxes.map((box) => box.bottom))).toBeLessThanOrEqual(
      boxes[0].bottom + 1,
    )
    expect(boxes[0].left).toBeGreaterThanOrEqual(0)
    expect(boxes[0].right).toBeLessThanOrEqual(viewport.width)
    expect(
      await top(page).evaluate((button) => {
        const box = button.getBoundingClientRect()
        return (
          document
            .elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
            ?.closest('button') === button
        )
      }),
    ).toBe(true)
    await expect(opened(page)).toHaveText('none')
    await diagnosticScreenshot(page, {
      path: `test-results/hud-components/stack-${viewport.width}x${viewport.height}.png`,
    })
  })
}

test('keyboard dismissal promotes focus and the final dismissal invokes the supplied focus fallback', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await top(page).focus()
  const names = [/^Espionage report/, /^Message received/]
  for (const [index, name] of names.entries()) {
    await page.keyboard.press('Escape')
    await expect(cards(page)).toHaveCount(2 - index)
    await expect(top(page)).toHaveAccessibleName(name)
    await expect(top(page)).toBeFocused()
    await expect(page.getByLabel('Fallback calls')).toHaveText('0')
  }
  await page.keyboard.press('Escape')
  await expect(cards(page)).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Return to commands', exact: true }),
  ).toBeFocused()
  await expect(page.getByLabel('Fallback calls')).toHaveText('1')
  await expect(dismissed(page)).toHaveText(
    'command:build, report:report, conversation:message',
  )
  await expect(opened(page)).toHaveText('none')
})

test('fresh native keyboard activation opens once after a canceled pointer and does not dismiss', async ({
  page,
}) => {
  await top(page).focus()
  // Deliver cancellation to the actual wired capture handlers, then exercise
  // native Enter. No keydown handler synthesizes an extra activation.
  await top(page).dispatchEvent('pointerdown', {
    pointerId: 7,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    clientX: 100,
    clientY: 100,
  })
  await top(page).dispatchEvent('pointercancel', {
    pointerId: 7,
    pointerType: 'mouse',
    isPrimary: true,
  })
  await page.keyboard.press('Enter')
  await expect(opened(page)).toHaveText('command:build')
  await expect(dismissed(page)).toHaveText('none')
  await expect(cards(page)).toHaveCount(3)
})

async function mouseDrag(page: Page, distance: number) {
  const card = cards(page).first()
  const box = (await top(page).boundingBox())!
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  try {
    await page.mouse.move(x + distance, y, { steps: 4 })
    await expect.poll(() => translation(card)).toBeGreaterThan(distance - 1)
  } finally {
    await page.mouse.up()
  }
}

test('mouse short drag never opens, native click opens, and deliberate swipe dismisses once', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mouseDrag(page, 12)
  await expect.poll(() => translation(cards(page).first())).toBeCloseTo(0, 1)
  await expect(opened(page)).toHaveText('none')
  await expect(dismissed(page)).toHaveText('none')
  await top(page).click()
  await expect(opened(page)).toHaveText('command:build')
  await mouseDrag(page, 96)
  await expect(cards(page)).toHaveCount(2)
  await expect(top(page)).toHaveAccessibleName(/^Espionage report/)
  await expect(dismissed(page)).toHaveText('command:build')
  await expect(opened(page)).toHaveText('command:build')
})
