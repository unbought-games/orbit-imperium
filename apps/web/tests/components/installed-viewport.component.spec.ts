import { test, expect } from './fixture'
test.use({
  isMobile: true,
  hasTouch: true,
  viewport: { width: 390, height: 844 },
})

for (const mode of ['ios-installed', 'ios-browser', 'other-browser'] as const) {
  test(`${mode} applies zoom prevention only to the iOS Home Screen app`, async ({
    page,
    context,
    browserName,
    mount,
  }) => {
    await page.addInitScript((mode) => {
      if (mode !== 'other-browser') {
        Object.defineProperty(navigator, 'standalone', {
          value: mode === 'ios-installed',
        })
      }
    }, mode)
    await mount('installed-viewport')
    const installed = mode === 'ios-installed'
    const viewport = await page
      .locator('meta[name="viewport"]')
      .getAttribute('content')
    if (installed) {
      expect(viewport).toContain('maximum-scale=1')
      expect(viewport).toContain('user-scalable=no')
    } else {
      expect(viewport).toBe('width=device-width, initial-scale=1')
    }
    await expect(page.locator('html')).toHaveCSS(
      'touch-action',
      installed ? 'pan-x pan-y' : 'auto',
    )
    // Chromium serializes `none` as its equivalent computed value, `100%`.
    await expect(page.locator('html')).toHaveCSS(
      '-webkit-text-size-adjust',
      installed ? '100%' : 'auto',
    )
    // Exercise the WebKit gesture fallback without cancelling ordinary touch input.
    for (const type of [
      'gesturestart',
      'gesturechange',
      'touchstart',
      'touchmove',
      'touchend',
    ]) {
      const cancelled = await page.locator('main').evaluate((element, type) => {
        const event = new Event(type, { bubbles: true, cancelable: true })
        element.dispatchEvent(event)
        return event.defaultPrevented
      }, type)
      expect(cancelled).toBe(installed && type.startsWith('gesture'))
    }
    // Chromium can inject two-finger input; WebKit's driver only exposes taps.
    if (browserName === 'chromium') {
      const session = await context.newCDPSession(page)
      await session.send('Emulation.setTouchEmulationEnabled', {
        enabled: true,
        maxTouchPoints: 2,
      })
      for (let step = 0; step <= 10; step++) {
        await session.send('Input.dispatchTouchEvent', {
          type: step === 0 ? 'touchStart' : 'touchMove',
          touchPoints: [
            { id: 0, x: 150 - step * 6, y: 350 },
            { id: 1, x: 240 + step * 6, y: 350 },
          ],
        })
        await page.evaluate(() => new Promise(requestAnimationFrame))
      }
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      })
      const scale = () => page.evaluate(() => window.visualViewport!.scale)
      if (installed) await expect.poll(scale).toBe(1)
      else await expect.poll(scale).toBeGreaterThan(1)
      await session.detach()
    }
  })
}
