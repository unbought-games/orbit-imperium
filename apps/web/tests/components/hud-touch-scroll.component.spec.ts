import { test, expect } from './fixture'
import { mountHud } from './mount-hud'
import { id } from '../../src/test-support/bootstrap'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'
const output = 'test-results/hud'
test.describe('HUD touch scroll ownership', () => {
  test.use({ hasTouch: true, isMobile: true })
  test('report and long message capture gestures; backdrop and boundaries cannot move the game', async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mountHud(page, mount, {
      reports: 1,
      conversations: [
        {
          contact: {
            player: id(99),
            username: 'Nova',
            blocked: false,
            request: null,
            requested_by: null,
            accepted: false,
          },
          latest: {
            id: id(851),
            sequence: '1',
            sender: id(99),
            body: Array.from(
              { length: 30 },
              (_, i) => `Field update ${i + 1}: Scouts are ready.`,
            ).join('\n\n'),
            sent_at: 1793120000000,
          },
          unread: true,
        },
      ],
    })
    const orb = page.getByTestId('command-orb')
    await expect(orb).toHaveAttribute('data-tone', 'champagne')
    await page.evaluate(() => window.scrollTo(0, 150))
    const originalY = await page.evaluate(() => scrollY)
    expect(originalY).toBeGreaterThan(0)
    await orb.click()
    const panel = page.getByRole('dialog')
    await panel.getByRole('button', { name: /Espionage report/ }).click()
    await expect(
      panel.getByRole('group', { name: 'Resource amounts' }),
    ).toBeVisible()
    expect(
      await panel.evaluate((el) => el.scrollHeight > el.clientHeight),
    ).toBe(true)
    const frozen = await page.evaluate(() => ({
      position: document.body.style.position,
      top: document.body.style.top,
      y: scrollY,
    }))
    expect(frozen.position).toBe('fixed')
    expect(frozen.top).toBe(`${-originalY}px`)
    const cdp = await page.context().newCDPSession(page)
    try {
      async function swipe(x: number, from: number, to: number) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x, y: from }],
        })
        for (let i = 1; i <= 8; i++)
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x, y: from + ((to - from) * i) / 8 }],
          })
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchEnd',
          touchPoints: [],
        })
      }
      // Touch end and wheel delivery do not mean compositor scrolling has ended.
      // Register the completion boundary before each gesture or programmatic move.
      async function scrollGesture(action: () => Promise<unknown>) {
        await panel.evaluate((el) => {
          el.setAttribute('data-test-scroll-pending', '')
          el.addEventListener(
            'scrollend',
            () => el.removeAttribute('data-test-scroll-pending'),
            { once: true },
          )
        })
        await action()
        await expect(panel).not.toHaveAttribute('data-test-scroll-pending', '')
      }
      async function setScroll(edge: 'start' | 'end') {
        await panel.evaluate(async (el, edge) => {
          const top = edge === 'start' ? 0 : el.scrollHeight - el.clientHeight
          if (Math.abs(el.scrollTop - top) < 1) return
          await new Promise<void>((resolve) => {
            el.addEventListener('scrollend', () => resolve(), { once: true })
            el.scrollTop = top
          })
        }, edge)
      }
      await setScroll('start')
      await page.mouse.move(190, 400)
      await scrollGesture(() => page.mouse.wheel(0, 300))
      await expect
        .poll(() => panel.evaluate((el) => el.scrollTop))
        .toBeGreaterThan(0)
      await setScroll('start')
      await scrollGesture(() => swipe(190, 620, 300))
      await expect
        .poll(() => panel.evaluate((el) => el.scrollTop))
        .toBeGreaterThan(0)
      await diagnosticScreenshot(page, {
        path: `${output}/report-scrolled-390x844.png`,
      })
      await setScroll('end')
      await expect
        .poll(() =>
          panel.evaluate((el) =>
            Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop),
          ),
        )
        .toBeLessThan(2)
      await swipe(190, 620, 300)
      await page.mouse.move(4, 400)
      await page.mouse.wheel(0, 600)
      await swipe(4, 620, 300)
      expect(
        await page.evaluate(() => ({
          position: document.body.style.position,
          top: document.body.style.top,
          y: scrollY,
        })),
      ).toEqual(frozen)
      await page.keyboard.press('Escape')
      await expect(panel).not.toBeVisible()
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(originalY)
      expect(await page.evaluate(() => document.body.style.position)).toBe('')
      await orb.click()
      await panel.getByRole('button', { name: /Message received/ }).click()
      await expect(panel).toContainText('Field update 30')
      await setScroll('start')
      await scrollGesture(() => swipe(190, 620, 300))
      await expect
        .poll(() => panel.evaluate((el) => el.scrollTop))
        .toBeGreaterThan(0)
      await diagnosticScreenshot(page, {
        path: `${output}/message-scrolled-390x844.png`,
      })
      // Resizing preserves the open detail and its scroll lock until dismissed.
      await page.setViewportSize({ width: 1440, height: 900 })
      await expect(panel).toBeVisible()
      await expect(panel).toContainText('Field update 30')
      await page.keyboard.press('Escape')
      await expect(panel).toHaveCount(0)
      expect(await page.evaluate(() => document.body.style.position)).toBe('')
      await diagnosticScreenshot(page, {
        path: `${output}/scroll-restored-desktop-1440x900.png`,
      })
    } finally {
      await cdp.detach()
    }
  })
})
