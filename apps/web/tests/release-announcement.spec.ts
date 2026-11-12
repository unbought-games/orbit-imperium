import { expect, test, type Page } from './fixtures/test'
import { installGameFixture, body, binding } from './fixtures/game'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import {
  withBootstrapResponse,
  withFixtureResponse,
} from './fixtures/responses'

// Browser wiring only: windows, ordering and storage live in model.test.ts.
test.use({ announcements: 'custom' })

const now = Date.parse('2026-11-07T15:00:00Z')
const output =
  process.env.ORBIT_ANNOUNCEMENT_OUTPUT ?? 'test-results/release-announcement'
const title = 'The Intergalactic Research Network is here'
const announcement = {
  id: 'research-network',
  title,
  date: '2026-11-06T14:45:55Z',
  href: '/updates/research-network.html',
  image: {
    src: '/art/atlas/objects/intergalactic-research-network-640.webp',
    alt: '',
  },
  body: 'Link your laboratories so your planets research together.\n\n- Each level links one more eligible lab.\n- Research finishes faster without using another research slot.\n- Research details show which planets are contributing.',
}
const quiet = {
  fleets: [],
  incoming: [],
  fleet_slots: '8',
  score_value_micro: '0',
}

async function openGame(page: Page, threat = false, initial = [announcement]) {
  await page.route('**/api/announcements', (route) =>
    route.fulfill({ json: { schema: 1, announcements: initial } }),
  )
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.setFixedTime(now)
  await installGameFixture(page, {
    protocol: 4,
    sampledAt: now,
    ...(threat ? {} : { missions: quiet }),
  })
  await withFixtureResponse(
    page,
    (response) => response.url().endsWith('/api/announcements'),
    () =>
      withBootstrapResponse(page, () =>
        page.goto(`/u/andromeda/b/${body.id}/overview`),
      ),
  )
  await expect(page.getByTestId('command-orb')).toBeVisible()
}

for (const [width, height] of [
  [1440, 900],
  [390, 844],
]) {
  test(`curated announcement opens from the orb once per account ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height })
    // Long editorial content and a wrapping title must fit above the orb.
    const longAnnouncement = {
      ...announcement,
      title:
        'New research, connected laboratories, and more ways to build your empire together',
      body: `${announcement.body}\n\n${'Your laboratories can now work together across your empire. Choose which planets contribute and review their progress before starting your next research project.\n\n'.repeat(6)}The final announcement paragraph.`,
    }
    await openGame(page, false, [longAnnouncement])
    const bubble = page.getByRole('dialog', { name: longAnnouncement.title })
    await expect(bubble).toBeVisible()
    await expect(bubble.getByRole('listitem')).toHaveCount(3)
    await expect(bubble.locator('img')).toHaveJSProperty('complete', true)
    await expect(
      bubble.getByRole('link', { name: 'Read the update' }),
    ).toHaveAttribute('href', '/updates/research-network.html')
    await diagnosticScreenshot(page, {
      path: `${output}/open-${width}x${height}.png`,
    })
    const box = (await bubble.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(width)
    expect(box.y + box.height).toBeLessThanOrEqual(height)
    const content = bubble.getByRole('region', { name: 'Announcement content' })
    const dismiss = bubble.getByRole('button', { name: 'Got it' })
    await expect(dismiss).toBeInViewport({ ratio: 1 })
    const pageScroll = await page.evaluate(() => window.scrollY)
    await content.hover()
    await page.mouse.wheel(0, 10000)
    await expect(content).toHaveJSProperty(
      'scrollTop',
      await content.evaluate((el) => el.scrollHeight - el.clientHeight),
    )
    await expect(
      bubble.getByText('The final announcement paragraph.'),
    ).toBeInViewport()
    await page.mouse.wheel(0, 500)
    // Wait for the browser to process the boundary wheel event before checking
    // that it did not chain into the game's document scroll.
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    )
    expect(await page.evaluate(() => window.scrollY)).toBe(pageScroll)
    await expect(dismiss).toBeInViewport({ ratio: 1 })
    await diagnosticScreenshot(page, {
      path: `${output}/scrolled-${width}x${height}.png`,
    })
    await bubble.getByRole('button', { name: 'Got it' }).click()
    await expect(bubble).toHaveCount(0)
    const orb = page.getByTestId('command-orb')
    await expect(orb).toBeFocused()
    expect(
      await page.evaluate(
        (account) =>
          localStorage.getItem(
            `orbit.announcement.v1:${account}:research-network`,
          ),
        binding.account,
      ),
    ).toBe('seen')
    // Without an announcement the orb returns to opening Command uplink.
    await orb.click()
    await expect(
      page.getByRole('dialog', { name: 'Command uplink', exact: true }),
    ).toBeVisible()
    await withFixtureResponse(
      page,
      (response) => response.url().endsWith('/api/announcements'),
      () => withBootstrapResponse(page, () => page.reload()),
    )
    await expect(orb).toBeVisible()
    await expect(
      page.getByRole('dialog', { name: longAnnouncement.title }),
    ).toHaveCount(0)
  })
}

test('Escape counts as seen and returns focus to the orb', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openGame(page)
  const bubble = page.getByRole('dialog', { name: title })
  await bubble.getByRole('button', { name: 'Got it' }).focus()
  await page.keyboard.press('Escape')
  await expect(bubble).toHaveCount(0)
  await expect(page.getByTestId('command-orb')).toBeFocused()
  await withFixtureResponse(
    page,
    (response) => response.url().endsWith('/api/announcements'),
    () => withBootstrapResponse(page, () => page.reload()),
  )
  await expect(page.getByTestId('command-orb')).toBeVisible()
  await expect(bubble).toHaveCount(0)
})

test('an incoming threat holds the announcement back', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openGame(page, true)
  await expect(page.getByTestId('command-orb')).toHaveAttribute(
    'data-tone',
    'red',
  )
  await expect(page.getByRole('dialog', { name: title })).toHaveCount(0)
})

test('a running client picks up a publication and withdrawal without reloading', async ({
  page,
}) => {
  await openGame(page, false, [])
  const bubble = page.getByRole('dialog', { name: title })
  await expect(bubble).toHaveCount(0)
  await page.route('**/api/announcements', (route) =>
    route.fulfill({ json: { schema: 1, announcements: [announcement] } }),
  )
  await withFixtureResponse(
    page,
    (response) => response.url().endsWith('/api/announcements'),
    () => page.evaluate(() => window.dispatchEvent(new Event('focus'))),
  )
  await expect(bubble).toBeVisible()
  await bubble.getByRole('button', { name: 'Got it' }).focus()
  await page.route('**/api/announcements', (route) =>
    route.fulfill({ json: { schema: 1, announcements: [] } }),
  )
  await withFixtureResponse(
    page,
    (response) => response.url().endsWith('/api/announcements'),
    () => page.evaluate(() => window.dispatchEvent(new Event('focus'))),
  )
  await expect(bubble).toHaveCount(0)
  await expect(page.getByTestId('command-orb')).toBeFocused()
  expect(
    await page.evaluate(
      (account) =>
        localStorage.getItem(
          `orbit.announcement.v1:${account}:research-network`,
        ),
      binding.account,
    ),
  ).toBeNull()
  await page.getByTestId('command-orb').click()
  await expect(
    page.getByRole('dialog', { name: 'Command uplink', exact: true }),
  ).toBeVisible()
})
