import type { components } from '../src/contracts'
import { expect, test, type Page } from './fixtures/test'
import {
  installGameFixture,
  body,
  binding,
  id,
  refreshGame,
} from './fixtures/game'
import { announcement, title } from './fixtures/editorial'
import {
  withBootstrapResponse,
  withFixtureResponse,
} from './fixtures/responses'

// Browser wiring only: windows, ordering and storage live in model.test.ts.
test.use({ announcements: 'custom' })

const now = Date.parse('2026-11-07T15:00:00Z')
const quiet = {
  fleets: [],
  incoming: [],
  fleet_slots: '8',
  score_value_micro: '0',
}

async function openGame(page: Page) {
  const missions: components['schemas']['MissionView4'] = {
    ...quiet,
    incoming: [
      {
        sender: id(99),
        origin: { galaxy: 1, system: 372, position: 3 },
        target: body.id,
        mission: 'Attack',
        arrival_at: now + 600000,
        ships: { visibility: 'Unknown' },
      },
    ],
  }

  await page.route('**/api/announcements', (route) =>
    route.fulfill({ json: { schema: 1, announcements: [announcement] } }),
  )
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.setFixedTime(now)
  let revision = 1
  await installGameFixture(page, {
    viewerRevision: () => String(revision),
    protocol: 4,
    sampledAt: now,
    missions,
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
  return () => {
    missions.incoming = []
    revision++
    return refreshGame(page)
  }
}

test('Escape counts as seen and returns focus to the orb', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const endThreat = await openGame(page)
  const bubble = page.getByRole('dialog', { name: title })
  await expect(page.getByTestId('command-orb')).toHaveAttribute(
    'data-tone',
    'red',
  )
  await expect(bubble).toHaveCount(0)
  await withFixtureResponse(
    page,
    (r) =>
      r.request().method() === 'POST' &&
      new URL(r.url()).pathname.endsWith('/overview'),
    endThreat,
  )
  await bubble.getByRole('button', { name: 'Got it' }).focus()
  await page.keyboard.press('Escape')
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
  ).toBe('seen')
  await page.getByTestId('command-orb').click()
  await expect(
    page.getByRole('dialog', { name: 'Command uplink', exact: true }),
  ).toBeVisible()
  await withFixtureResponse(
    page,
    (response) => response.url().endsWith('/api/announcements'),
    () => withBootstrapResponse(page, () => page.reload()),
  )
  await expect(page.getByTestId('command-orb')).toBeVisible()
  await expect(bubble).toHaveCount(0)
})
