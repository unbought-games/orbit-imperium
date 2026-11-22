import { inlineBaselines } from '../fixtures/identity-typography'
import { test, expect, type Page } from './fixture'
import { id } from '../../src/test-support/bootstrap'
import { focusPlayerDetails } from '../fixtures/profile-navigation'
import type { RankingInput } from './rankings.scenario'

const binding = { player: id(2), universe: id(3) }
async function prepare(
  page: Page,
  mount: (name: string) => Promise<void>,
  data: Partial<RankingInput['data']>,
  options: Omit<RankingInput, 'data'> = {},
) {
  const input: RankingInput = {
    data: {
      players: [],
      sampled_at: 1792843200000,
      processing_pending: false,
      ...data,
    },
    ...options,
  }
  await page.addInitScript((input) => {
    window.rankingInput = input
  }, input)
  await mount('rankings')
}
test('High Scores keeps one snapshot through search and paging, finds me, and opens accessible details', async ({
  page,
  mount,
}) => {
  const players = Array.from({ length: 123 }, (_, i) => ({
    player: i === 80 ? binding.player : id(1000 + i),
    username:
      i === 80
        ? 'My Commander'
        : i === 0
          ? 'A very long commander name across the distant stars'
          : `Pilot ${i}`,
    points: i < 2 ? '9223372036' : `${1000 - i}`,
    rank: i < 2 ? 1 : i + 1,
  }))
  const now = Math.floor(Date.now() / 1000)
  await prepare(
    page,
    mount,
    { players },
    {
      profiles: [
        {
          ...players[0],
          supporter_tier: 2,
          observed_at: now,
          expires_at: now + 300,
        },
      ],
    },
  )
  const table = page.getByRole('table', {
    name: 'Universe total-score rankings',
  })
  await expect(table.getByRole('row')).toHaveCount(51)
  await expect(
    table.getByRole('row').nth(1).getByRole('cell').first(),
  ).toHaveText('1 (—)')
  await expect(
    table.getByRole('row').nth(2).getByRole('cell').first(),
  ).toHaveText('1 (—)')
  for (const width of [1440, 768, 390, 360, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await focusPlayerDetails(
      page,
      table.getByRole('link', {
        name: /A very long commander.*profile details/,
      }),
    )
    await expect(page.getByRole('tooltip')).toBeVisible()
    await page.keyboard.press('Escape')
  }
  const leader = table.getByRole('button', {
    name: /Score details for A very long commander/,
  })
  await expect(leader).toHaveAccessibleName(
    'Score details for A very long commander name across the distant stars: 9,223,372,036 points',
  )
  await leader.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('9,223,372,036')
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(leader).toBeFocused()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(table).toBeFocused()
  await expect(table.getByRole('row').nth(1)).toBeInViewport()
  await expect(table).toContainText('Pilot 50')
  await expect(table).not.toContainText('Pilot 49')
  await page.getByRole('searchbox', { name: 'Find a player' }).fill('pILot 122')
  await expect(table.getByRole('row')).toHaveCount(2)
  await expect(
    table.getByRole('row').nth(1).getByRole('cell').first(),
  ).toHaveText('123 (—)')
  await page.getByRole('button', { name: 'Around me', exact: true }).click()
  await expect(
    page.getByRole('searchbox', { name: 'Find a player' }),
  ).toHaveValue('')
  await expect(table.locator('tr[data-self]')).toContainText('My Commander')
  await expect(table.getByRole('row').nth(1)).toContainText('Pilot 55')
  await expect(
    table
      .locator('tr[data-self]')
      .getByRole('link', { name: /profile details/ }),
  ).toBeFocused()
  await expect(table.locator('tr[data-self]')).toBeInViewport()
  expect(await page.evaluate(() => window.rankingRequests)).toBe(1)
  await page.evaluate(() => {
    window.rankingInput.failed = true
  })
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(
    'Showing the previous snapshot',
  )
  await expect(table.locator('tr[data-self]')).toContainText('My Commander')
  await page.evaluate(() => {
    window.rankingInput.failed = false
  })
  await page.evaluate(() => {
    window.rankingInput.data.players[80].points = '777'
  })
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(table.locator('tr[data-self]')).toContainText('777')
  await page
    .getByRole('searchbox', { name: 'Find a player' })
    .fill('does not exist')
  await expect(
    page.getByRole('status').filter({ hasText: 'No players match' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Clear search' }).click()
  await expect(
    page.getByRole('searchbox', { name: 'Find a player' }),
  ).toBeFocused()
  await expect(
    page.getByRole('searchbox', { name: 'Find a player' }),
  ).toHaveValue('')
  await expect(table.getByRole('row')).toHaveCount(51)
  await expect(page.getByRole('button', { name: 'Clear search' })).toHaveCount(
    0,
  )
})
test('High Scores has a retryable initial error and honest empty result', async ({
  page,
  mount,
}) => {
  await prepare(page, mount, {}, { failed: true })
  await expect(page.getByRole('alert')).toContainText('could not be refreshed')
  await page.evaluate(() => {
    window.rankingInput.failed = false
  })
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByText('No players are ranked yet.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Around me' })).toBeDisabled()
})
test('a refresh removing the selected player closes details, restores useful focus, and does not reopen them later', async ({
  page,
  mount,
}) => {
  const players = [
    {
      player: binding.player,
      username: 'Selected Commander',
      points: '12',
      rank: 1,
    },
  ]
  await prepare(page, mount, { players })
  const table = page.getByRole('table', {
    name: 'Universe total-score rankings',
  })
  const player = table.getByRole('button', {
    name: 'Score details for Selected Commander: 12 points',
  })
  await expect(player).toBeVisible()
  await page.evaluate(() => window.holdRankings())
  try {
    await page.getByRole('button', { name: 'Refresh', exact: true }).click()
    await player.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.evaluate(() => {
      window.rankingInput.data.players = []
      window.releaseRankings()
    })
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(table).toBeFocused()
  } finally {
    await page.evaluate(() => window.releaseRankings())
  }
  await page.evaluate((players) => {
    window.rankingInput.data.players = players
  }, players)
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(player).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('rank movement is accessible, stable through filters and paging, and refreshes with its baseline', async ({
  page,
  mount,
}) => {
  const players = Array.from({ length: 55 }, (_, i) => ({
    player: i === 54 ? binding.player : id(5000 + i),
    username: `Mover ${i}`,
    points: `${100 - i}`,
    rank: i + 1,
    previous_rank:
      i === 0 ? 3 : i === 1 ? 1 : i === 2 ? null : i === 5 ? 86 : i + 1,
  }))
  const baseline = Date.UTC(2026, 9, 21)
  await prepare(page, mount, { players, baseline_at: baseline })
  const table = page.getByRole('table')
  const comparison = page.getByText(/^Rank change since 10\/21\/2026,/)
  await expect(comparison).toBeVisible()
  await expect(comparison.locator('time')).toHaveAttribute(
    'datetime',
    new Date(baseline).toISOString(),
  )
  await expect(table.getByLabel('Up 2 places since the baseline')).toHaveText(
    '(+2)',
  )
  await expect(table.getByLabel('Down 1 place since the baseline')).toHaveText(
    '(−1)',
  )
  await expect(
    table.getByLabel('New to the rankings since the baseline'),
  ).toHaveText('(New)')
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    const rank = table.getByRole('row').nth(6).getByRole('cell').first()
    await expect(rank).toHaveText('6 (+80)')
    const layout = await rank.evaluate((cell) => {
      const range = document.createRange()
      range.selectNode(cell.firstChild!)
      const number = range.getBoundingClientRect()
      const change = cell.querySelector('span')!.getBoundingClientRect()
      return {
        sameLine: number.top < change.bottom && change.top < number.bottom,
        followsRank: change.left >= number.right,
        fitsCell: change.right <= cell.getBoundingClientRect().right,
      }
    })
    expect(layout).toEqual({
      sameLine: true,
      followsRank: true,
      fitsCell: true,
    })
  }
  await page.getByRole('searchbox').fill('Mover 0')
  await expect(table.getByLabel('Up 2 places since the baseline')).toHaveText(
    '(+2)',
  )
  await table
    .getByRole('button', {
      name: 'Score details for Mover 0: 100 points',
      exact: true,
    })
    .click()
  await expect(
    page.getByRole('dialog').getByLabel('Up 2 places since the baseline'),
  ).toHaveText('+2')
  await expect(page.getByRole('dialog')).toContainText(
    'Compared with the daily snapshot from 10/21/2026,',
  )
  await page.keyboard.press('Escape')
  await expect(
    table.getByRole('button', {
      name: 'Score details for Mover 0: 100 points',
      exact: true,
    }),
  ).toBeFocused()
  await page.getByRole('button', { name: 'Top players' }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(
    table.getByLabel('Rank unchanged since the baseline'),
  ).toHaveCount(5)
  await page.getByRole('button', { name: 'Around me' }).click()
  await expect(
    table
      .locator('tr[data-self]')
      .getByLabel('Rank unchanged since the baseline'),
  ).toHaveText('(0)')
  await page.evaluate(() => {
    window.rankingInput.data.players[54].rank = 50
  })
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(
    table.locator('tr[data-self]').getByLabel('Up 5 places since the baseline'),
  ).toHaveText('(+5)')
  await page.evaluate(() => {
    window.rankingInput.data.baseline_at = null
  })
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(
    table
      .locator('tr[data-self]')
      .getByLabel('Rank change unavailable without an earlier snapshot'),
  ).toHaveText('(—)')
  await expect(
    page.getByText('Rank changes will appear', { exact: false }),
  ).toBeVisible()
})
test('alliance standings share one snapshot, search names and tags, and navigate around my alliance', async ({
  page,
  mount,
}) => {
  const alliances = Array.from({ length: 123 }, (_, i) => ({
    alliance: {
      id: id(6000 + i),
      universe: binding.universe,
      name:
        i === 80
          ? 'Étoile alliance with a very long recruitment name'
          : `Alliance ${i}`,
      tag: `TAG${i}`,
    },
    member_count: 2,
    points: i === 0 ? '18446744073' : `${1000 - i}`,
    average_points: i === 0 ? '9223372036' : '450',
    rank: i < 2 ? 1 : i + 1,
    previous_rank: i === 2 ? null : i + 3,
  }))
  await prepare(page, mount, {
    alliances,
    baseline_at: 1792800000000,
    alliance_baseline_at: 1792800000000,
    players: [
      {
        player: binding.player,
        username: 'My Commander',
        points: '500',
        rank: 1,
        alliance: alliances[80].alliance,
      },
    ],
  })
  await focusPlayerDetails(
    page,
    page
      .getByRole('table')
      .getByRole('link', { name: 'My Commander profile details' }),
  )
  await expect(
    page.getByRole('tooltip').getByRole('link', { name: /Alliance Étoile/ }),
  ).toHaveAttribute(
    'href',
    `/alliances/${binding.universe}/${alliances[80].alliance.id}`,
  )
  await page.getByRole('button', { name: 'Alliances', exact: true }).click()
  const table = page.getByRole('table', {
    name: 'Universe alliance total-score rankings',
  })
  await expect(
    page.getByRole('button', { name: 'Alliances', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(table.getByRole('row')).toHaveCount(51)
  await expect(table.getByRole('row').nth(1)).toContainText('18,446,744,073')
  await expect(table.getByRole('row').nth(1)).toContainText('9,223,372,036')
  await expect(
    table.getByLabel('New to the rankings since the baseline'),
  ).toHaveText('(New)')
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  }
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(table).toBeFocused()
  await expect(table.getByRole('row').nth(1)).toContainText('Alliance 50')
  await page.getByRole('searchbox', { name: 'Find an alliance' }).fill('tag80')
  await expect(table.getByRole('row')).toHaveCount(2)
  await expect(table.locator('tr[data-self]')).toContainText('Étoile')
  await expect(
    table.locator('tr[data-self]').getByLabel('Up 2 places since the baseline'),
  ).toHaveText('(+2)')
  await page.getByRole('button', { name: 'Around my alliance' }).click()
  await expect(table.getByRole('row').nth(1)).toContainText('Alliance 55')
  await expect(table.locator('tr[data-self]').getByRole('link')).toBeFocused()
  await expect(page.getByRole('searchbox')).toHaveValue('')
  expect(await page.evaluate(() => window.rankingRequests)).toBe(1)
  await page.evaluate(() => {
    window.rankingInput.data.alliance_baseline_at = null
    delete window.rankingInput.data.players[0].alliance
  })
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Around my alliance' }),
  ).toBeDisabled()
  await expect(table.locator('tr[data-self]')).toHaveCount(0)
  await expect(
    table.getByLabel('Rank change unavailable without an earlier snapshot'),
  ).toHaveCount(50)
  await page.getByRole('searchbox').fill('no such alliance')
  await expect(
    page.getByText('No alliances match “no such alliance”.'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Clear search' }).click()
  await expect(page.getByRole('searchbox')).toBeFocused()
  await page.getByRole('button', { name: 'Players', exact: true }).click()
  await expect(
    page.getByRole('table', { name: 'Universe total-score rankings' }),
  ).toContainText('My Commander')
  await expect(
    page.getByRole('searchbox', { name: 'Find a player' }),
  ).toHaveValue('')
})
test('legacy rankings responses retain players and show an honest empty alliance view', async ({
  page,
  mount,
}) => {
  await prepare(page, mount, {})
  await page.getByRole('button', { name: 'Alliances', exact: true }).click()
  await expect(page.getByText('No alliances are ranked yet.')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Around my alliance' }),
  ).toBeDisabled()
  await expect(
    page.getByText('Rank changes will appear', { exact: false }),
  ).toBeVisible()
})

test('player attachments align together and long identities stay within narrow rows', async ({
  page,
  mount,
}) => {
  const alliance = {
    id: id(85),
    universe: binding.universe,
    name: 'Starward',
    tag: 'STAR',
  }
  const insignia = {
    recipe: {
      version: 1 as const,
      symbol: 'compass',
      foreground: '#cbb68d',
      background: '#152b40',
    },
    asset_url:
      'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22%3E%3Ccircle cx=%228%22 cy=%228%22 r=%227%22/%3E%3C/svg%3E',
  }
  const players = [
    { player: id(31), username: 'steveish', kind: 'bot' as const },
    {
      player: id(32),
      username: 'Aurelia',
      kind: 'bot' as const,
      supporter_tier: 2 as const,
      insignia,
      alliance,
    },
    {
      player: id(33),
      username: 'CommanderBeyondTheFarthestStars',
      supporter_tier: 3 as const,
      insignia,
      alliance,
    },
  ]
  const now = Math.floor(Date.now() / 1000)
  await prepare(
    page,
    mount,
    {
      baseline_at: 1792756800000,
      players: players.map((p, i) => ({
        player: p.player,
        username: p.username,
        alliance: p.alliance,
        points: String(100 - i),
        rank: [123, 1234, 12345][i],
        previous_rank: [null, 1334, 12245][i],
      })),
    },
    {
      profiles: players.map((p) => ({
        ...p,
        observed_at: now,
        expires_at: now + 300,
      })),
    },
  )
  const table = page.getByRole('table', {
    name: 'Universe total-score rankings',
  })
  const trigger = table.getByRole('link', { name: 'Aurelia profile details' })
  await expect(trigger.getByRole('img', { name: /Supporter/ })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    const simple = table.getByRole('link', { name: 'steveish profile details' })
    const baselines = await simple
      .getByText('steveish', { exact: true })
      .or(simple.getByLabel('Bot', { exact: true }))
      .evaluateAll(inlineBaselines)
    expect(baselines).toHaveLength(2)
    const [name, bot] = baselines
    // Differently sized labels share a text baseline, including in narrow rows.
    expect(Math.abs(name - bot)).toBeLessThan(0.15)
    await expect(simple.getByLabel('Bot', { exact: true })).toHaveCSS(
      'font-size',
      '12px',
    )
    for (const player of players) {
      const identity = table.getByRole('link', {
        name: `${player.username} profile details`,
      })
      const cell = identity.locator('..')
      const bounds = await cell.boundingBox()
      const parts = await identity
        .locator('span, svg')
        .evaluateAll((elements) =>
          elements.map((element) => {
            const rect = element.getBoundingClientRect()
            return { left: rect.left, right: rect.right }
          }),
        )
      for (const part of parts) {
        expect(part.left).toBeGreaterThanOrEqual(bounds!.x)
        expect(part.right).toBeLessThanOrEqual(bounds!.x + bounds!.width)
      }
    }
    const rankCells = table
      .getByRole('row')
      .filter({ has: page.getByRole('cell') })
      .locator('td:first-child')
    for (const rankCell of await rankCells.all()) {
      const { right, contentRight } = await rankCell.evaluate((cell) => {
        const range = document.createRange()
        range.selectNodeContents(cell)
        return {
          right: cell.getBoundingClientRect().right,
          contentRight: range.getBoundingClientRect().right,
        }
      })
      expect(contentRight).toBeLessThanOrEqual(right)
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    if (width === 1440) {
      const baselines = await trigger
        .locator(':scope > span > *')
        .evaluateAll(inlineBaselines)
      expect(baselines.length).toBeGreaterThan(1)
      expect(Math.max(...baselines) - Math.min(...baselines)).toBeLessThan(0.15)
    }
    if (width !== 320) {
      await focusPlayerDetails(page, trigger)
      const popup = page.getByRole('tooltip', { name: 'Aurelia profile' })
      await expect(popup).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(popup).toHaveCount(0)
    }
  }
})

test('pageshow refreshes the mounted ranking identity and open dossier from the authoritative profile source', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 900 })
  const player = id(31),
    now = Math.floor(Date.now() / 1000)
  await prepare(
    page,
    mount,
    { players: [{ player, username: 'Harvester', rank: 1, points: '12500' }] },
    {
      profiles: [
        {
          player,
          username: 'Harvester',
          kind: 'bot',
          observed_at: now,
          expires_at: now + 300,
        },
      ],
    },
  )
  const trigger = page.getByRole('link', { name: 'Harvester profile details' })
  await expect(trigger.getByLabel('Bot', { exact: true })).toBeVisible()
  await focusPlayerDetails(page, trigger)
  const profile = page.getByRole('tooltip', { name: 'Harvester profile' })
  await expect(profile).toContainText('Automated player')
  const before = await page.evaluate(() => window.rankingProfileReads.length)
  await page.evaluate(() => {
    window.rankingInput.profiles = window.rankingInput.profiles!.map((p) => ({
      ...p,
      kind: 'human',
      observed_at: p.observed_at + 1,
    }))
    window.dispatchEvent(new Event('pageshow'))
  })
  await expect
    .poll(() =>
      page.evaluate((start) => window.rankingProfileReads.slice(start), before),
    )
    .toContainEqual([player])
  await expect(trigger.getByLabel('Bot', { exact: true })).toHaveCount(0)
  await expect(trigger).toContainText('Harvester')
  await expect(profile).toBeVisible()
  await expect(profile).toContainText('Commander')
  await expect(profile).not.toContainText(/automated|\bBot\b/i)
  await page.keyboard.press('Escape')
  await expect(profile).toHaveCount(0)
})

test('browser Back releases a live score-details dialog and restores an operable previous route', async ({
  page,
  mount,
}) => {
  await prepare(page, () => mount('rankings-history'), {
    players: [
      { player: id(2), username: 'Selected Commander', points: '12', rank: 1 },
    ],
  })
  const entry = page.getByRole('link', { name: 'High Scores', exact: true })
  await entry.click()
  const open = page.getByRole('button', {
    name: 'Score details for Selected Commander: 12 points',
    exact: true,
  })
  await open.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(entry).toBeVisible()
  await entry.focus()
  await expect(entry).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(open).toBeVisible()
})
