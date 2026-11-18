import { expect, test, type Page } from './fixture'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'
import { body, id, binding } from '../../src/test-support/empire'
import type { components } from '../../src/contracts'
import { mountHud } from './mount-hud'
type S = components['schemas']
const output = 'test-results/live-hud'
const baseTime = 1793120000000
async function publishIncoming(page: Page, fleets: S['IncomingMission4'][]) {
  await page.evaluate(async (fleets) => {
    window.hudScene.view.missions.incoming = fleets
    await window.hudScene.refresh()
  }, fleets)
}

test('initial unread persists and mailbox failures remain recoverable; desktop retains the HUD', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mountHud(page, mount, { reports: 1 })
  const orb = page.getByTestId('command-orb')
  await expect(orb).toHaveAttribute('data-tone', 'champagne')
  await expect(page.getByTestId('unread-count')).toHaveText('1')
  await expect(
    page.getByLabel('Recent game events').getByRole('button'),
  ).toHaveCount(0)
  await page.evaluate(async () => {
    window.hudScene.setMailboxFailure(true)
    await window.hudScene.refresh()
  })
  await orb.click()
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'Some intelligence is unavailable' }),
  ).toBeVisible()
  await page.evaluate(() => window.hudScene.setMailboxFailure(false))
  await page.getByRole('button', { name: 'Retry intelligence' }).click()
  await expect(
    page.getByText('Some intelligence is unavailable. Try again.'),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Close command HUD' }).click()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  expect(
    await orb.evaluate(
      (node) => getComputedStyle(node, '::before').animationName,
    ),
  ).not.toBe('none')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(
    await orb.evaluate(
      (node) => getComputedStyle(node, '::before').animationName,
    ),
  ).toBe('none')
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(orb).toBeVisible()
})

test('HUD detail omits the dispatch action when the selected universe disables attacks', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mountHud(page, mount, { reports: 1, canAttack: false })
  await page.getByTestId('command-orb').click()
  const panel = page.getByRole('dialog')
  await panel.getByRole('button', { name: /Espionage report/ }).click()
  await expect(
    panel.getByRole('group', { name: 'Resource amounts' }),
  ).toBeVisible()
  await expect(
    panel.getByRole('button', { name: 'Attack', exact: true }),
  ).toHaveCount(0)
})

test('spy contacts are regular unread notifications and only active attacks make the orb red', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mountHud(page, mount, { reports: 1, kind: 'SpyContact' })
  const orb = page.getByTestId('command-orb')
  await expect(orb).toHaveAttribute('data-tone', 'champagne')
  await expect(orb).toHaveAccessibleName('1 unread items. Open command HUD')
  await expect(orb).toHaveCSS('color', 'rgb(236, 211, 159)')
  await expect(
    page.getByLabel('Recent game events').getByRole('button'),
  ).toHaveCount(0)
  await diagnosticScreenshot(page, {
    path: `${output}/spy-unread-login-390x844.png`,
  })
  await orb.click()
  await expect(
    page
      .getByRole('dialog')
      .getByRole('button', { name: /Spy Contact report/ }),
  ).toHaveCSS('color', 'rgb(148, 191, 229)')
  await diagnosticScreenshot(page, {
    path: `${output}/spy-unread-inbox-390x844.png`,
  })
  await page.getByRole('button', { name: 'Close command HUD' }).click()
  await page.evaluate(
    async (header) => {
      window.hudScene.headers.unshift(header)
      await window.hudScene.refresh()
    },
    {
      id: id(871),
      kind: 'SpyContact',
      observed_at: baseTime,
      read: false,
      hidden: false,
    },
  )
  const report = page
    .getByLabel('Recent game events')
    .getByRole('button', { name: /Spy Contact report/ })
  await expect(report).toHaveAttribute('data-tone', 'champagne')
  await expect(orb).toHaveAttribute('data-tone', 'champagne')
  await diagnosticScreenshot(page, {
    path: `${output}/spy-contact-toast-390x844.png`,
  })
  const probe = {
    sender: id(99),
    origin: { galaxy: 1, system: 372, position: 3 },
    target: body.id,
    mission: 'Espionage' as const,
    arrival_at: baseTime + 180000,
    ships: { visibility: 'Unknown' as const },
  }
  await publishIncoming(page, [probe])
  await expect(
    page
      .getByLabel('Recent game events')
      .getByRole('button', { name: /Enemy probes detected/ }),
  ).toHaveAttribute('data-tone', 'champagne')
  await expect(orb).toHaveAttribute('data-tone', 'champagne')
  await diagnosticScreenshot(page, {
    path: `${output}/spy-incoming-390x844.png`,
  })
  await publishIncoming(page, [{ ...probe, mission: 'Attack' }, probe])
  await expect(orb).toHaveAttribute('data-tone', 'red')
  await expect(orb.locator('[data-orb-symbol]')).toHaveAttribute(
    'data-orb-symbol',
    'attack',
  )
  await diagnosticScreenshot(page, {
    path: `${output}/spy-with-active-attack-390x844.png`,
  })
  await publishIncoming(page, [probe])
  await expect(orb).toHaveAttribute('data-tone', 'champagne')
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(orb).toBeVisible()
  await diagnosticScreenshot(page, {
    path: `${output}/spy-unread-desktop-1440x900.png`,
  })
})

for (const [width, height] of [
  [390, 844],
  [1440, 900],
]) {
  test(`enemy attacks appear only for incoming attacks at ${width}x${height}`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.clock.install({ time: baseTime })
    await page.clock.pauseAt(baseTime)
    const origin: S['Destination'] = {
      id: id(98),
      kind: 'Planet',
      name: 'Arcanis Prime',
      coordinates: { galaxy: 1, system: 372, position: 3 },
    }
    const moon: S['Destination'] = {
      ...origin,
      id: id(97),
      kind: 'Moon',
      name: 'Arcanis Moon',
    }
    await mountHud(page, mount, { destinations: [moon, origin] })
    await page.getByTestId('command-orb').click()
    const panel = page.getByRole('dialog', { name: 'Command uplink' })
    const enemies = panel.getByRole('region', {
      name: 'Enemy attacks',
      exact: true,
    })
    await expect(panel).toBeVisible()
    await expect(enemies).toHaveCount(0)
    await expect(panel.getByRole('button', { name: /^Fleets/ })).toBeVisible()

    const incoming: S['IncomingMission4'] = {
      sender: id(99),
      origin: origin.coordinates,
      origin_body: origin.id,
      target: body.id,
      mission: 'Transport',
      arrival_at: baseTime + 180000,
      ships: { visibility: 'Unknown' },
    }
    await publishIncoming(page, [incoming])
    await page.clock.runFor(1)
    await expect(enemies).toHaveCount(0)
    await diagnosticScreenshot(page, {
      path: `${output}/no-enemy-attacks-${width}x${height}.png`,
    })

    await publishIncoming(page, [incoming, { ...incoming, mission: 'Attack' }])
    await page.clock.runFor(1)
    await expect(enemies).toBeVisible()
    await expect(
      enemies.getByRole('button', { name: 'Enemy attacks 1', exact: true }),
    ).toHaveAttribute('aria-expanded', 'true')
    await expect(enemies.getByRole('article')).toHaveCount(1)
    await expect(enemies).toContainText('Arcanis Prime')
    await expect(enemies).not.toContainText('Arcanis Moon')
    await expect(enemies).not.toContainText('Unknown origin')
    await diagnosticScreenshot(page, {
      path: `${output}/incoming-enemy-attack-${width}x${height}.png`,
    })

    await publishIncoming(page, [incoming])
    await page.clock.runFor(1)
    await expect(enemies).toHaveCount(0)
    await expect(
      panel.getByRole('button', { name: /^Enemy attacks/ }),
    ).toHaveCount(0)
    await diagnosticScreenshot(page, {
      path: `${output}/enemy-attacks-cleared-${width}x${height}.png`,
    })
  })
}

test('enemy attacks open above fleets, use red, keep hidden intelligence hidden, and collapse independently', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install({ time: baseTime })
  await page.clock.pauseAt(baseTime)
  const ships: S['PublicShip4'][] = [
    { ship_type: 'Cruiser', count: '1200' },
    { ship_type: 'Battleship', count: '300' },
  ]
  const own = (
    n: number,
    mission: S['Mission4'],
    leg: S['OwnMission4']['leg'],
  ): S['OwnMission4'] => ({
    id: id(n),
    intent: {
      origin: body.id,
      destination: {
        type: 'Body',
        id: id(47),
        expected_owner: id(99),
        expected_kind: 'Planet',
      },
      mission,
      ships: ships.map((ship) => ({ ...ship, owner: binding.player })),
      cargo: { metal: '0', crystal: '0', deuterium: '0' },
      speed_percent: 100,
    },
    origin: body.coordinates,
    destination: { galaxy: 1, system: 372, position: 3 },
    leg,
    ships,
    cargo: { metal: '0', crystal: '0', deuterium: '0' },
    due_at: baseTime + 10000,
    launched_at: baseTime - 10000,
    duration_ms: 20000,
    paid_fuel: '0',
    can_recall: leg === 'Outbound',
  })
  const fleetsInput = [
    own(930, 'Attack', 'Outbound'),
    own(931, 'Transport', 'Returning'),
  ]
  const attack: S['IncomingMission4'] = {
    sender: id(99),
    origin: { galaxy: 1, system: 372, position: 3 },
    target: body.id,
    mission: 'Attack',
    arrival_at: baseTime + 180000,
    ships: { visibility: 'Unknown' },
  }
  await mountHud(page, mount, {
    homeName: 'Aster Prime',
    destinations: [
      {
        id: id(47),
        kind: 'Planet',
        name: 'Nova Bastion',
        coordinates: { galaxy: 1, system: 372, position: 3 },
      },
    ],
    playerNames: { [id(99)]: 'Nova', [id(98)]: 'Rook' },
    missions: {
      fleets: fleetsInput,
      incoming: [
        attack,
        {
          ...attack,
          sender: id(98),
          arrival_at: baseTime + 300000,
          ships: { visibility: 'Exact', total: '1500', ships },
        },
        { ...attack, mission: 'Transport' },
      ],
      fleet_slots: '8',
      score_value_micro: '0',
    },
  })
  await expect(page.getByTestId('command-orb')).toBeVisible()
  await page.getByTestId('command-orb').click()
  const panel = page.getByRole('dialog', { name: 'Command uplink' })
  const enemyToggle = panel.getByRole('button', {
    name: 'Enemy attacks 2',
    exact: true,
  })
  const ownToggle = panel.getByRole('button', { name: /^Fleets/ })
  const enemies = panel.getByRole('list', {
    name: 'Enemy attacks',
    exact: true,
  })
  const fleets = panel.getByRole('list', { name: 'Empire fleets', exact: true })
  await expect(enemyToggle).toHaveAttribute('aria-expanded', 'true')
  await expect(enemies.getByRole('article')).toHaveCount(2)
  await expect(enemies.getByRole('article').first()).toContainText(
    'Ships unknown',
  )
  await expect(enemies.getByRole('article').first()).toContainText('Nova')
  await expect(enemies.getByRole('timer').first()).toHaveText(
    'Arrives in 3m 0s',
  )
  await expect(
    panel.getByLabel('Intelligence list').getByRole('button'),
  ).toHaveCount(0)
  expect((await enemyToggle.boundingBox())!.y).toBeLessThan(
    (await ownToggle.boundingBox())!.y,
  )
  await diagnosticScreenshot(page, {
    path: `${output}/enemy-attacks-390x844.png`,
  })
  await ownToggle.click()
  await expect(fleets.locator('img')).toHaveCount(4)
  await expect
    .poll(() =>
      fleets
        .locator('img')
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete &&
              (image as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true)
  const colors = await panel
    .getByRole('article')
    .evaluateAll((rows) =>
      rows.map((row) =>
        getComputedStyle(row).getPropertyValue('--flight').trim(),
      ),
    )
  expect(colors).toEqual(['#ff7d83', '#ff7d83', '#ecd39f', '#a4dbef'])
  await diagnosticScreenshot(page, {
    path: `${output}/enemy-and-own-fleets-390x844.png`,
  })
  await page.setViewportSize({ width: 320, height: 740 })
  expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  )
  await diagnosticScreenshot(page, {
    path: `${output}/enemy-and-own-fleets-320x740.png`,
  })
  await enemies
    .getByRole('button', { name: 'Enemy ship composition: 1,500 ships' })
    .click()
  await expect(
    enemies.getByRole('list', { name: 'Ship composition' }),
  ).toContainText('Cruiser 1,200')
  await diagnosticScreenshot(page, {
    path: `${output}/enemy-manifest-320x740.png`,
  })
  await enemyToggle.click()
  await expect(enemies).toBeHidden()
  await expect(fleets).toBeVisible()
  await diagnosticScreenshot(page, {
    path: `${output}/enemy-attacks-collapsed-320x740.png`,
  })
  const marker = fleets
    .getByRole('article')
    .first()
    .locator('.lucide-rocket')
    .locator('..')
  const start = await marker.evaluate((el) => (el as HTMLElement).style.left)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.clock.runFor(250)
  expect(
    await marker.evaluate((el) => (el as HTMLElement).style.left),
  ).not.toBe(start)
  const animation = await marker.evaluate((el) => ({
    transition: getComputedStyle(el).transitionProperty,
    duration: getComputedStyle(el).transitionDuration,
    active: el.getAnimations().map((animation) => animation.constructor.name),
  }))
  expect(animation.transition).toBe('left')
  expect(animation.duration).toBe('0.25s')
  expect(animation.active).toContain('CSSTransition')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(
    await marker.evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe('0s')
  await enemyToggle.click()
  await enemies
    .getByRole('button', { name: 'Attack', exact: true })
    .first()
    .click()
  await expect(panel).toHaveCount(0)
  await expect(
    page.getByRole('dialog', { name: 'Hostile fleet inbound' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Back to list' }).click()
  await publishIncoming(page, [])
  await page.clock.runFor(1)
  await expect(
    panel.getByRole('region', { name: 'Enemy attacks', exact: true }),
  ).toHaveCount(0)
  await expect(
    panel.getByRole('button', { name: /^Enemy attacks/ }),
  ).toHaveCount(0)
  await diagnosticScreenshot(page, {
    path: `${output}/enemy-attacks-cleared-320x740.png`,
  })
})

test('a three-resource harvest keeps its label and yields on one baseline in the narrow uplink', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mountHud(page, mount, {
    headers: [
      {
        id: id(870),
        kind: 'Harvested',
        observed_at: baseTime - 180 * 60000,
        read: false,
        hidden: false,
        preview: {
          kind: 'Harvested',
          destination_coordinates: { galaxy: 1, system: 23, position: 7 },
          harvested: {
            metal: '12000000000',
            crystal: '4800000000',
            deuterium: '750000000',
          },
        },
      },
    ],
  })
  await page.getByTestId('command-orb').click()
  const row = page
    .getByRole('dialog')
    .getByRole('button', { name: /Harvested/ })
  for (const name of ['Metal', 'Crystal', 'Deuterium'])
    await expect(row.getByRole('img', { name, exact: true })).toBeVisible()
  await expect(row.locator('time')).toHaveText('3h')
  const measures = await row.evaluate((button) => {
    const bounds = button.getBoundingClientRect()
    const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT)
    const labels = new Set(['Harvested', '12K', '4.8K', '750'])
    const positions = []
    while (walker.nextNode()) {
      if (!labels.has(walker.currentNode.textContent?.trim() ?? '')) continue
      const range = document.createRange()
      range.selectNodeContents(walker.currentNode)
      const rect = range.getBoundingClientRect()
      positions.push({
        y: rect.bottom,
        inside: rect.right <= bounds.right && rect.left >= bounds.left,
      })
    }
    return positions
  })
  expect(measures).toHaveLength(4)
  expect(measures.every((p) => p.inside)).toBe(true)
  const bottoms = measures.map((p) => p.y)
  expect(Math.max(...bottoms) - Math.min(...bottoms)).toBeLessThan(1)
})
