import { expect, test } from './fixture'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'
import { body, id } from '../../src/test-support/empire'
import { mountHud } from './mount-hud'

const output = 'test-results/live-hud'
const baseTime = 1793120000000

test('orb boots from its center, types the complete label and clears it without moving', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.clock.install()
  await mountHud(page, mount)
  const orb = page.getByTestId('command-orb')
  await expect(orb).toBeVisible()
  const caption = page.getByTestId('orb-caption')
  await expect(caption).toHaveText('Welcome, Commander.')
  // Sample the real CSS animation at explicit times rather than wall-clock sleeps.
  const frames = await orb.evaluate((el) => {
    const animation = el.getAnimations()[0]
    animation.pause()
    animation.currentTime = 0
    const start = {
      opacity: getComputedStyle(el).opacity,
      transform: getComputedStyle(el).transform,
    }
    animation.currentTime = 700
    const midpoint = Number(getComputedStyle(el).opacity)
    animation.currentTime = 1400
    return {
      start,
      midpoint,
      end: {
        opacity: getComputedStyle(el).opacity,
        transform: getComputedStyle(el).transform,
      },
      origin: getComputedStyle(el).transformOrigin,
    }
  })
  expect(frames.start.opacity).toBe('0')
  expect(frames.start.transform).toBe('matrix(0.15, 0, 0, 0.15, 0, 0)')
  expect(frames.midpoint).toBeCloseTo(0.5, 2)
  expect(frames.end.opacity).toBe('1')
  if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
    await orb.evaluate((el) => {
      el.getAnimations()[0].currentTime = 700
    })
    await diagnosticScreenshot(page, {
      path: `${output}/startup-midpoint-390x844.png`,
    })
    await orb.evaluate((el) => {
      el.getAnimations()[0].currentTime = 1400
    })
  }
  expect(frames.origin).toBe('37px 37px')
  const text = caption.locator('span')
  const textFrames = await text.evaluate((el) => {
    const animations = el.getAnimations()
    if (!animations.length)
      throw new Error('Expected the active caption reveal')
    for (const animation of animations) animation.pause()
    return [0, 150, 400, 1000, 1600].map((time) => {
      for (const animation of animations) animation.currentTime = time
      const rect = el.getBoundingClientRect()
      return { width: rect.width, height: rect.height }
    })
  })
  for (const frame of textFrames) expect(frame).toEqual(textFrames.at(-1))
  expect(await text.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  )
  await diagnosticScreenshot(page, {
    path: `${output}/startup-complete-390x844.png`,
  })
  const before = await orb.boundingBox()
  await page.clock.fastForward(6000)
  await expect(caption).toHaveCount(0)
  expect(await orb.boundingBox()).toEqual(before)
  await diagnosticScreenshot(page, {
    path: `${output}/startup-cleared-390x844.png`,
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(orb).toBeVisible()
  await diagnosticScreenshot(page, {
    path: `${output}/startup-desktop-1440x900.png`,
  })
})

test('the first signal glitch visibly distorts the live orb and stops when reduced motion is enabled', async ({
  page,
  mount,
}) => {
  await page.clock.pauseAt(baseTime)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await mountHud(page, mount)
  const face = page.getByTestId('command-orb').locator('[data-orb-face]')
  await expect(face).toBeVisible()
  await expect(face).toHaveCSS('animation-name', 'none')
  await expect(face).toHaveCSS('transform', 'none')
  await page.clock.runFor(1850)
  await expect
    .poll(() =>
      face.evaluate((el) => {
        const animation = el.getAnimations()[0]
        if (!animation || getComputedStyle(el).animationPlayState !== 'running')
          return false
        animation.pause()
        animation.currentTime = 350
        return !new DOMMatrix(getComputedStyle(el).transform).isIdentity
      }),
    )
    .toBe(true)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(face).toHaveCSS('transform', 'none')
  await expect(face).toHaveCSS('animation-name', 'none')
})

test('every orb surface blends through the shared palette, including rapid retargets and reduced motion', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mountHud(page, mount, { reports: 1 })
  const orb = page.getByTestId('command-orb')
  await expect(orb).toHaveAttribute('data-tone', 'champagne')
  await expect(page.getByTestId('unread-count')).toHaveText('1')
  // Finish only the entrance so color captures show the fully formed orb.
  await orb.evaluate((el) => {
    for (const a of el.getAnimations())
      if (a.effect?.getTiming().iterations === 1) a.finish()
  })
  const palette = {
    ice: [164, 219, 239],
    champagne: [236, 211, 159],
    green: [135, 242, 187],
    red: [255, 125, 131],
  }
  for (const tone of ['red', 'green', 'ice', 'champagne'] as const) {
    const frames = await orb.evaluate(async (el, tone) => {
      const dock = el.parentElement!
      const outer = el.querySelector(
          '[data-orb-face] [data-orb-part="outer"]',
        )!,
        inner = el.querySelector('[data-orb-face] [data-orb-part="inner"]')!,
        core = el.querySelector('[data-orb-face] [data-orb-part="core"]')!
      const shimmer = core.querySelector('[data-orb-part="shimmer"]')!,
        icon = core.querySelector('svg')!
      const badge = el.querySelector('[data-testid="unread-count"]')!
      const slots = el.nextElementSibling!
      const style = (node: Element, pseudo?: string) =>
        getComputedStyle(node, pseudo)
      const sample = () => ({
        channels: ['red', 'green', 'blue'].map((channel) =>
          Number(style(dock).getPropertyValue(`--command-orb-${channel}`)),
        ),
        parts: {
          orb: style(el).color,
          caption: style(dock.querySelector('[data-testid="orb-caption"]')!)
            .color,
          outer: style(outer).borderTopColor,
          inner: style(inner).borderTopColor,
          core: style(core).backgroundImage,
          coreShadow: style(core).boxShadow,
          coreBorder: style(core).borderColor,
          shimmer: style(shimmer).backgroundImage,
          icon: style(icon).color,
          iconGlow: style(icon).filter,
          aura: style(el, '::before').backgroundImage,
          ripple: style(el, '::after').borderColor,
          spark: style(outer, '::after').backgroundColor,
          sparkGlow: style(outer, '::after').boxShadow,
          badge: style(badge).backgroundColor,
          badgeBorder: style(badge).borderColor,
          badgeGlow: style(badge).boxShadow,
          slots: style(slots).color,
          slotsBorder: style(slots).borderColor,
          slotsBackground: style(slots).backgroundColor,
        },
      })
      const before = sample()
      dock.dataset.tone = tone
      el.setAttribute('data-tone', tone)
      // Force the style change, then sample the actual CSS transitions at known times.
      style(dock).getPropertyValue('--command-orb-red')
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      )
      const transitions = dock
        .getAnimations()
        .filter((a) => a instanceof CSSTransition)
      for (const animation of transitions) {
        animation.pause()
        animation.currentTime = 0
      }
      const start = sample()
      for (const animation of transitions) animation.currentTime = 350
      const middle = sample()
      for (const animation of transitions) animation.currentTime = 700
      const end = sample()
      for (const animation of transitions) animation.finish()
      return { before, start, middle, end, count: transitions.length }
    }, tone)
    expect(frames.count).toBe(3)
    expect(frames.start.channels).toEqual(frames.before.channels)
    expect(frames.end.channels).toEqual(palette[tone])
    for (let i = 0; i < 3; i++)
      expect(frames.middle.channels[i]).toBeCloseTo(
        (frames.before.channels[i] + palette[tone][i]) / 2,
        0,
      )
    for (const part of Object.keys(
      frames.end.parts,
    ) as (keyof typeof frames.end.parts)[]) {
      expect(
        frames.middle.parts[part],
        `${tone}: ${part} must leave its old color`,
      ).not.toBe(frames.before.parts[part])
      expect(
        frames.middle.parts[part],
        `${tone}: ${part} must not snap to its new color`,
      ).not.toBe(frames.end.parts[part])
    }
    await diagnosticScreenshot(page, {
      path: `${output}/orb-palette-${tone}-390x844.png`,
    })
  }
  const interrupted = await orb.evaluate(async (el) => {
    const dock = el.parentElement!
    const channels = () =>
      ['red', 'green', 'blue'].map((c) =>
        Number(getComputedStyle(dock).getPropertyValue(`--command-orb-${c}`)),
      )
    dock.dataset.tone = 'red'
    el.setAttribute('data-tone', 'red')
    channels()
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    for (const animation of dock.getAnimations()) {
      animation.pause()
      animation.currentTime = 350
    }
    const before = channels()
    dock.dataset.tone = 'ice'
    el.setAttribute('data-tone', 'ice')
    const after = channels()
    return { before, after }
  })
  for (let i = 0; i < 3; i++)
    expect(interrupted.after[i]).toBeCloseTo(interrupted.before[i], 0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await orb.evaluate((el) => {
    el.parentElement!.dataset.tone = 'green'
    el.setAttribute('data-tone', 'green')
  })
  expect(await orb.evaluate((el) => getComputedStyle(el).color)).toBe(
    'rgb(135, 242, 187)',
  )
  expect(
    await orb.evaluate(
      (el) => getComputedStyle(el.parentElement!).transitionProperty,
    ),
  ).toBe('none')
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(orb).toBeVisible()
  await diagnosticScreenshot(page, {
    path: `${output}/orb-palette-desktop-1440x900.png`,
  })
})

test('orb hover charges every layer, preserves its hit area and palette, and supports keyboard and reduced motion', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mountHud(page, mount)
  const orb = page.getByTestId('command-orb')
  await expect(orb).toBeVisible()
  await orb.evaluate((el) => {
    for (const a of el.getAnimations())
      if (a.effect?.getTiming().iterations === 1) a.finish()
  })
  const bounds = await orb.boundingBox()
  const channel = (name: string) =>
    orb.evaluate(
      (el, name) =>
        Number(
          getComputedStyle(el.parentElement!).getPropertyValue(
            `--command-orb-${name}`,
          ),
        ),
      name,
    )
  await expect.poll(() => channel('charge')).toBe(0)
  const idleAura = await orb.evaluate(
    (el) => getComputedStyle(el, '::before').backgroundImage,
  )
  await diagnosticScreenshot(page, { path: `${output}/hover-idle-390x844.png` })
  await orb.hover()
  await expect.poll(() => channel('charge')).toBe(1)
  await expect(page.getByTestId('orb-charge')).toHaveCSS('opacity', '1')
  expect(await orb.boundingBox()).toEqual(bounds)
  expect(
    await orb.evaluate((el) =>
      Number(
        getComputedStyle(
          el.querySelector('[data-orb-face] [data-orb-part="outer"]')!,
        ).scale,
      ),
    ),
  ).toBeGreaterThan(1)
  expect(
    await orb.evaluate((el) =>
      Number(
        getComputedStyle(
          el.querySelector('[data-orb-face] [data-orb-part="core"]')!,
        ).scale,
      ),
    ),
  ).toBeGreaterThan(1)
  expect(
    await orb.evaluate(
      (el) => getComputedStyle(el, '::before').backgroundImage,
    ),
  ).not.toBe(idleAura)
  await diagnosticScreenshot(page, {
    path: `${output}/hover-charged-390x844.png`,
  })
  await page.evaluate(
    async (incoming) => {
      window.hudScene.view.missions.incoming.push(incoming)
      await window.hudScene.refresh()
    },
    {
      sender: id(99),
      origin: { galaxy: 1, system: 372, position: 3 },
      target: body.id,
      mission: 'Attack' as const,
      arrival_at: baseTime + 180000,
      ships: { visibility: 'Unknown' as const },
    },
  )
  await expect(orb).toHaveAttribute('data-tone', 'red')
  await expect(orb).toHaveCSS('color', 'rgb(255, 125, 131)')
  await expect.poll(() => channel('charge')).toBe(1)
  await diagnosticScreenshot(page, { path: `${output}/hover-red-390x844.png` })
  await page.mouse.down()
  await expect.poll(() => channel('press')).toBe(1)
  expect(
    await orb.evaluate((el) =>
      Number(
        getComputedStyle(
          el.querySelector('[data-orb-face] [data-orb-part="core"]')!,
        ).scale,
      ),
    ),
  ).toBeLessThan(1)
  expect(await orb.boundingBox()).toEqual(bounds)
  await diagnosticScreenshot(page, {
    path: `${output}/hover-pressed-390x844.png`,
  })
  await page.mouse.up()
  await expect(
    page.getByRole('dialog', { name: 'Command uplink' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Close command HUD' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.mouse.move(5, 5)
  await expect.poll(() => channel('charge')).toBe(0)
  await expect.poll(() => channel('press')).toBe(0)
  await page.keyboard.press('Tab')
  await orb.focus()
  expect(await orb.evaluate((el) => el.matches(':focus-visible'))).toBe(true)
  await expect.poll(() => channel('charge')).toBe(1)
  await diagnosticScreenshot(page, {
    path: `${output}/hover-keyboard-390x844.png`,
  })
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('dialog', { name: 'Command uplink' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Close command HUD' }).click()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await orb.hover()
  await expect.poll(() => channel('charge')).toBe(1)
  expect(
    await orb.evaluate(
      (el) =>
        getComputedStyle(
          el.querySelector('[data-orb-face] [data-orb-part="core"]')!,
        ).scale,
    ),
  ).toBe('1')
  expect(
    await orb.evaluate(
      (el) =>
        getComputedStyle(
          el.querySelector('[data-orb-face] [data-orb-part="core"]')!,
        ).translate,
    ),
  ).toBe('none')
  expect(
    await orb.evaluate(
      (el) => getComputedStyle(el.parentElement!).transitionProperty,
    ),
  ).toBe('none')
  await expect(page.getByTestId('orb-charge')).toHaveCSS(
    'animation-name',
    'none',
  )
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(orb).toBeVisible()
  await diagnosticScreenshot(page, {
    path: `${output}/hover-desktop-1440x900.png`,
  })
})

test.describe('orb touch feedback', () => {
  test.use({ hasTouch: true, isMobile: true })
  test('touch press compresses then releases without sticky hover or lost taps', async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mountHud(page, mount)
    const orb = page.getByTestId('command-orb')
    await expect(orb).toBeVisible()
    expect(
      await page.evaluate(
        () => matchMedia('(hover: hover) and (pointer: fine)').matches,
      ),
    ).toBe(false)
    await orb.evaluate((el) => {
      for (const a of el.getAnimations())
        if (a.effect?.getTiming().iterations === 1) a.finish()
    })
    const channel = (name: string) =>
      orb.evaluate(
        (el, name) =>
          Number(
            getComputedStyle(el.parentElement!).getPropertyValue(
              `--command-orb-${name}`,
            ),
          ),
        name,
      )
    const bounds = (await orb.boundingBox())!
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
      ],
    })
    await expect.poll(() => channel('press')).toBe(1)
    expect(
      await orb.evaluate((el) =>
        Number(
          getComputedStyle(
            el.querySelector('[data-orb-face] [data-orb-part="core"]')!,
          ).scale,
        ),
      ),
    ).toBeLessThan(1)
    await diagnosticScreenshot(page, {
      path: `${output}/hover-touch-390x844.png`,
    })
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchCancel',
      touchPoints: [],
    })
    await expect.poll(() => channel('press')).toBe(0)
    await expect.poll(() => channel('charge')).toBe(0)
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
      ],
    })
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    })
    await expect(
      page.getByRole('dialog', { name: 'Command uplink' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Close command HUD' }).tap()
    await expect.poll(() => channel('press')).toBe(0)
    await expect.poll(() => channel('charge')).toBe(0)
    await expect(page.getByTestId('orb-charge')).toHaveCSS('opacity', '0')
    await cdp.detach()
  })
})

for (const [width, height] of [
  [390, 844],
  [1440, 900],
]) {
  test(`HUD back button is a ghost with hover, focus and pressed states at ${width}x${height}`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mountHud(page, mount, { reports: 1 })
    await page.getByTestId('command-orb').click()
    const panel = page.getByRole('dialog')
    await panel.getByRole('button', { name: /Espionage report/ }).click()
    await expect(
      panel.getByRole('button', { name: 'Attack', exact: true }),
    ).toBeVisible()
    const back = panel.getByRole('button', {
      name: 'Back to list',
      exact: true,
    })
    async function expectCompactHeaderControl() {
      const buttonBounds = (await back.boundingBox())!
      const headerBounds = (await back.locator('..').boundingBox())!
      expect(buttonBounds.height).toBeLessThanOrEqual(28)
      expect(buttonBounds.y).toBeGreaterThanOrEqual(headerBounds.y + 4)
      expect(buttonBounds.y + buttonBounds.height).toBeLessThanOrEqual(
        headerBounds.y + headerBounds.height - 4,
      )
    }
    await page.mouse.move(0, 0)
    await expect(back).toHaveAttribute('data-button-variant', 'ghost')
    await expect(back).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await expectCompactHeaderControl()
    await diagnosticScreenshot(page, {
      path: `${output}/back-ghost-idle-${width}x${height}.png`,
    })

    await back.hover()
    await expect(back).toHaveCSS(
      'background-color',
      'rgba(255, 255, 255, 0.08)',
    )
    await expectCompactHeaderControl()
    await diagnosticScreenshot(page, {
      path: `${output}/back-ghost-hover-${width}x${height}.png`,
    })
    await page.mouse.move(0, 0)
    await panel
      .getByRole('heading', { name: 'Espionage report', exact: true })
      .focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Shift+Tab')
    await expect(back).toBeFocused()
    await expect(back).toHaveCSS(
      'background-color',
      'rgba(255, 255, 255, 0.08)',
    )
    await expect(back).toHaveCSS('outline-style', 'solid')
    await expectCompactHeaderControl()
    const focusOutset = await back.evaluate((el) => {
      const style = getComputedStyle(el)
      return parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth)
    })
    expect(focusOutset).toBeLessThanOrEqual(0)
    await diagnosticScreenshot(page, {
      path: `${output}/back-ghost-focus-${width}x${height}.png`,
    })
    await panel.evaluate((el) => {
      el.scrollTop = el.scrollHeight
    })
    await expectCompactHeaderControl()
    await diagnosticScreenshot(page, {
      path: `${output}/back-ghost-scrolled-focus-${width}x${height}.png`,
    })
    await panel.evaluate((el) => {
      el.scrollTop = 0
    })

    await back.hover()
    await page.mouse.down()
    await expect(back).toHaveCSS(
      'background-color',
      'rgba(255, 255, 255, 0.14)',
    )
    await expectCompactHeaderControl()
    await diagnosticScreenshot(page, {
      path: `${output}/back-ghost-pressed-${width}x${height}.png`,
    })
    await page.mouse.up()
    await expect(panel).toHaveAccessibleName('Command uplink')
  })
}

for (const initialViewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`HUD list infinitely loads past the badge cap, retries in place, and restores the list after detail at ${initialViewport.width}px`, async ({
    page,
    mount,
  }) => {
    // Native scrolling, retry controls and detail/list scroll restoration need a
    // browser. Callback races and page-intent permutations live in inbox-pagination.test.ts.
    await page.setViewportSize(initialViewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const lastCursor = id(4099)
    await mountHud(page, mount, { reports: 130 })
    await page.evaluate((cursor) => window.hudScene.fail(cursor), lastCursor)
    const requests = () =>
      page.evaluate(
        (cursor) => window.hudScene.calls.filter((c) => c === cursor).length,
        lastCursor,
      )
    await expect(page.getByTestId('unread-count')).toHaveText('99')
    await page.getByTestId('command-orb').click()
    const panel = page.getByRole('dialog')
    const list = panel.getByLabel('Intelligence list')
    const entries = list.getByRole('button')
    await expect(entries).toHaveCount(20)
    await expect(list).toHaveAttribute('aria-busy', 'false')
    await diagnosticScreenshot(page, {
      path: `${output}/infinite-first-${initialViewport.width}x${initialViewport.height}.png`,
    })
    for (const count of [40, 60, 80, 100]) {
      await panel.evaluate((el) => {
        el.scrollTop = el.scrollHeight
      })
      await expect(entries).toHaveCount(count)
      await expect(list).toHaveAttribute('aria-busy', 'false')
    }
    expect(await requests()).toBe(0)
    await panel.evaluate((el) => {
      el.scrollTop = el.scrollHeight
    })
    await expect(
      panel.getByRole('button', { name: 'Retry loading' }),
    ).toBeVisible()
    await expect(entries).toHaveCount(100)
    expect(await requests()).toBe(1)
    await diagnosticScreenshot(page, {
      path: `${output}/infinite-retry-${initialViewport.width}x${initialViewport.height}.png`,
    })
    await page.evaluate((cursor) => {
      window.hudScene.fail()
      window.hudScene.hold(cursor)
    }, lastCursor)
    // Two retry gestures before React commits the loading state must join one
    // request and reveal only the next batch, including observer callbacks.
    await panel
      .getByRole('button', { name: 'Retry loading' })
      .evaluate((button) => {
        ;(button as HTMLButtonElement).click()
        ;(button as HTMLButtonElement).click()
      })
    await expect(
      panel.getByRole('status').filter({ hasText: 'Loading intelligence…' }),
    ).toBeVisible()
    await diagnosticScreenshot(page, {
      path: `${output}/infinite-loading-${initialViewport.width}x${initialViewport.height}.png`,
    })
    await expect.poll(requests).toBe(2)
    await page.evaluate(() => window.hudScene.release())
    await expect(entries).toHaveCount(120)
    expect(await requests()).toBe(2)
    // Opening an already loaded row must not throw away the loaded pages or position.
    await entries.nth(95).scrollIntoViewIfNeeded()
    const position = await panel.evaluate((el) => el.scrollTop)
    await entries.nth(95).click()
    await expect(
      panel.getByRole('button', { name: 'Attack', exact: true }),
    ).toBeVisible()
    await expect(list).toHaveAttribute('aria-busy', 'false')
    await panel.getByRole('button', { name: 'Back to list' }).click()
    await expect(panel).toHaveAccessibleName('Command uplink')
    await expect(entries).toHaveCount(120)
    expect(
      Math.abs((await panel.evaluate((el) => el.scrollTop)) - position),
    ).toBeLessThan(5)
    await diagnosticScreenshot(page, {
      path: `${output}/infinite-return-${initialViewport.width}x${initialViewport.height}.png`,
    })
    expect(await page.evaluate(() => document.body.style.position)).toBe(
      'fixed',
    )
    await panel.evaluate((el) => {
      el.scrollTop = el.scrollHeight
    })
    await expect(entries).toHaveCount(129)
    await expect(
      panel.getByRole('status').filter({ hasText: 'You’re all caught up.' }),
    ).toBeVisible()
    await expect(
      panel.getByRole('button', { name: 'Load more intelligence' }),
    ).toHaveCount(0)
    if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
      await panel
        .getByRole('status')
        .filter({ hasText: 'You’re all caught up.' })
        .scrollIntoViewIfNeeded()
      await diagnosticScreenshot(page, {
        path: `${output}/infinite-end-390x844.png`,
      })
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(page.getByTestId('command-orb')).toBeVisible()
    await expect(panel).toBeVisible()
    await diagnosticScreenshot(page, {
      path: `${output}/infinite-end-1440x900.png`,
    })
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    expect(await page.evaluate(() => document.body.style.position)).toBe('')
    await diagnosticScreenshot(page, {
      path: `${output}/infinite-desktop-1440x900.png`,
    })
  })
}

test('a missing report cursor offers retry without an observer render loop', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install()
  await mountHud(page, mount, { invalidCursor: true })
  const requests = () => page.evaluate(() => window.hudScene.calls.length)
  await page.getByTestId('command-orb').click()
  const panel = page.getByRole('dialog')
  await expect(
    panel.getByRole('button', { name: 'Retry intelligence' }),
  ).toBeVisible()
  await expect(
    panel.getByRole('button', { name: 'Load more intelligence' }),
  ).toHaveCount(0)
  await expect(
    panel.getByText('No new intelligence. All channels clear.'),
  ).toHaveCount(0)
  await expect(panel.getByText('Loading intelligence…')).toHaveCount(0)
  const before = await requests()
  await page.clock.runFor(1000)
  expect(await requests()).toBe(before)
  await panel.getByRole('button', { name: 'Retry intelligence' }).click()
  await expect.poll(requests).toBeGreaterThan(before)
  await expect(
    panel.getByRole('button', { name: 'Retry intelligence' }),
  ).toBeVisible()
})

test('HUD dismissal keeps exiting content inert and modal, then restores focus and scroll', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await mountHud(page, mount)
  const orb = page.getByTestId('command-orb')
  const panel = page.getByRole('dialog', {
    name: 'Command uplink',
    exact: true,
  })
  await expect(orb).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 150))
  const originalY = await page.evaluate(() => scrollY)
  for (const dismissal of ['button', 'escape', 'backdrop'] as const) {
    await orb.click()
    await expect(panel).toBeVisible()
    await expect
      .poll(() => panel.evaluate((el) => getComputedStyle(el).opacity))
      .toBe('1')
    await expect(panel).toContainText(
      'No new intelligence. All channels clear.',
    )
    if (dismissal === 'button')
      await diagnosticScreenshot(page, {
        path: `${output}/popup-open-390x844.png`,
      })
    // Observe the semantic exit commit, not compositor/JS animation frames.
    // Opacity and transform need not advance together on a busy runner.
    const exit = await panel.evaluateHandle((el) => {
      const dialog = el as HTMLDialogElement
      type ExitSnapshot = {
        connected: boolean
        modal: boolean
        locked: boolean
        inert: boolean
        content: string | null
      }
      const state = {
        snapshot: null as ExitSnapshot | null,
        stop: () => observer.disconnect(),
      }
      const observer = new MutationObserver(() => {
        if (!dialog.hasAttribute('data-closing')) return
        state.snapshot = {
          connected: dialog.isConnected,
          modal: dialog.matches(':modal'),
          locked: document.body.style.position === 'fixed',
          inert: dialog.firstElementChild!.hasAttribute('inert'),
          content: dialog.textContent,
        }
        observer.disconnect()
      })
      observer.observe(dialog, {
        attributes: true,
        attributeFilter: ['data-closing'],
      })
      return state
    })
    try {
      if (dismissal === 'button')
        await panel.getByRole('button', { name: 'Close command HUD' }).click()
      else if (dismissal === 'escape') await page.keyboard.press('Escape')
      else await page.mouse.click(1, 1) // Outside the inset dialog, on its backdrop.
      await expect
        .poll(() => exit.evaluate((state) => state.snapshot))
        .not.toBeNull()
      expect(await exit.evaluate((state) => state.snapshot)).toMatchObject({
        connected: true,
        modal: true,
        locked: true,
        inert: true,
        content: expect.stringContaining(
          'No new intelligence. All channels clear.',
        ),
      })
    } finally {
      await exit.evaluate((state) => state.stop())
      await exit.dispose()
    }
    await expect(panel).toHaveCount(0)
    await expect(orb).toBeFocused()
    expect(await page.evaluate(() => document.body.style.position)).toBe('')
    expect(await page.evaluate(() => scrollY)).toBe(originalY)
  }
  await diagnosticScreenshot(page, {
    path: `${output}/popup-closed-390x844.png`,
  })
  if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
    await orb.click()
    await expect
      .poll(() => panel.evaluate((el) => getComputedStyle(el).opacity))
      .toBe('1')
    await panel.evaluate(async (el) => {
      el.querySelector<HTMLButtonElement>(
        '[aria-label="Close command HUD"]',
      )!.click()
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      )
      for (const animation of el.getAnimations()) {
        animation.pause()
        animation.currentTime =
          Number(animation.effect!.getTiming().duration) / 2
      }
    })
    await diagnosticScreenshot(page, {
      path: `${output}/popup-closing-390x844.png`,
    })
    await panel.evaluate((el) => {
      for (const animation of el.getAnimations()) animation.play()
    })
    await expect(panel).toHaveCount(0)
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await orb.click()
  expect(await panel.evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
  expect(
    await panel.evaluate(
      (el) => getComputedStyle(el, '::backdrop').animationName,
    ),
  ).toBe('none')
  await page.getByRole('button', { name: 'Close command HUD' }).click()
  await expect(panel).toHaveCount(0)
  await orb.click()
  await expect(panel).toBeVisible()
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(orb).toBeVisible()
  await expect(panel).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(orb).toBeFocused()
  expect(await page.evaluate(() => document.body.style.position)).toBe('')
  await diagnosticScreenshot(page, {
    path: `${output}/popup-desktop-1440x900.png`,
  })
})

for (const width of [1440, 390]) {
  test(`background HUD refresh preserves settled status and focus at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.clock.pauseAt(new Date())
    await mountHud(page, mount, { reports: 1 })
    await page.getByTestId('command-orb').click()
    await page.clock.runFor(1000)
    const panel = page.getByRole('dialog', {
      name: 'Command uplink',
      exact: true,
    })
    const entry = panel.getByLabel('Intelligence list').getByRole('button')
    await expect(entry).toHaveCount(1)
    await expect(
      panel.getByText('You’re all caught up.', { exact: true }),
    ).toBeVisible()
    await entry.focus()
    const before = await page.evaluate(() => {
      window.hudScene.hold(null)
      return window.hudScene.calls.length
    })
    try {
      await page.evaluate(() => window.dispatchEvent(new Event('focus')))
      await expect
        .poll(() => page.evaluate(() => window.hudScene.calls.length))
        .toBeGreaterThan(before)
      await expect(
        panel.getByText('Loading intelligence…', { exact: true }),
      ).toHaveCount(0)
      await expect(
        panel.getByText('You’re all caught up.', { exact: true }),
      ).toBeVisible()
      await expect(panel.getByLabel('Intelligence list')).toHaveAttribute(
        'aria-busy',
        'false',
      )
      await expect(entry).toBeEnabled()
      await expect(entry).toBeFocused()
      await diagnosticScreenshot(page, {
        path: `test-results/background-hud-${width}x900.png`,
      })
    } finally {
      await page.evaluate(() => window.hudScene.release())
    }
  })
}

test('background HUD refresh allows buffered entries and queues the next page at 1440px (refresh fails: false)', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.pauseAt(new Date())
  // Keep pagination gestures deterministic; native observer races have their
  // own coverage above. Only intercept the HUD scroll root.
  await page.addInitScript(() => {
    const NativeObserver = window.IntersectionObserver
    window.IntersectionObserver = class extends NativeObserver {
      private hud: boolean
      constructor(
        callback: IntersectionObserverCallback,
        options?: IntersectionObserverInit,
      ) {
        super(callback, options)
        this.hud = options?.root instanceof HTMLDialogElement
      }
      observe(target: Element) {
        if (!this.hud) super.observe(target)
      }
    }
  })
  await mountHud(page, mount, { reports: 130 })
  await expect(page.getByTestId('unread-count')).toHaveText('99')
  await page.getByTestId('command-orb').click()
  await page.clock.runFor(1000)
  const panel = page.getByRole('dialog', {
    name: 'Command uplink',
    exact: true,
  })
  const list = panel.getByLabel('Intelligence list')
  const entries = list.getByRole('button')
  const more = panel.getByRole('button', {
    name: 'Load more intelligence',
    exact: true,
  })
  await expect(entries).toHaveCount(20)
  const before = await page.evaluate(() => {
    window.hudScene.hold(null)
    return window.hudScene.calls.filter((c) => c === null).length
  })
  const refreshes = () =>
    page.evaluate(() => window.hudScene.calls.filter((c) => c === null).length)
  const pages = () =>
    page.evaluate(() => window.hudScene.calls.filter((c) => c !== null))
  try {
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect.poll(refreshes).toBe(before + 1)
    // Queue another passive refresh while the first owns the inbox.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(more).toBeEnabled()
    await more.focus()
    await expect(more).toBeFocused()
    await expect(list).toHaveAttribute('aria-busy', 'false')
    await more.click()
    await expect(entries).toHaveCount(40)
    await expect(more).toBeEnabled()
    expect(await pages()).not.toContain(id(4049))
    if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
      await more.scrollIntoViewIfNeeded()
      await diagnosticScreenshot(page, {
        path: `test-results/background-hud-buffered-1440x900-ready.png`,
      })
    }
    await more.click()
    await expect(list).toHaveAttribute('aria-busy', 'true')
    await expect(
      panel.getByText('Loading intelligence…', { exact: true }),
    ).toBeVisible()
    expect(await pages()).not.toContain(id(4049))
    await diagnosticScreenshot(page, {
      path: `test-results/background-hud-queued-1440x900-ready.png`,
    })
  } finally {
    await page.evaluate(() => window.hudScene.release())
  }
  await expect(entries).toHaveCount(60)
  await expect.poll(refreshes).toBe(before + 2)
  expect((await pages()).filter((cursor) => cursor === id(4049))).toHaveLength(
    1,
  )
  await expect(list).toHaveAttribute('aria-busy', 'false')
})
