import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect } from './fixtures/test'
import { mkdirSync } from 'node:fs'
import { shellFixture, binding, body, id } from './fixtures/game'

const output = 'test-results/combat-redesign'
const defenses = new Set([
  'RocketLauncher',
  'LightLaser',
  'HeavyLaser',
  'GaussCannon',
  'IonCannon',
  'PlasmaTurret',
])
const units = (counts: Record<string, number>) =>
  Object.entries(counts).map(([name, count]) => ({
    item: { kind: defenses.has(name) ? 'Defense' : 'Ship', id: name },
    count: String(count),
  }))
const resources = (m: number, c: number, d = 0) => ({
  metal: String(BigInt(m) * 1000000n),
  crystal: String(BigInt(c) * 1000000n),
  deuterium: String(BigInt(d) * 1000000n),
})
for (const size of ['small', 'huge', 'defender', 'legacy', 'deuterium']) {
  test(`capture current ${size} combat report`, async ({ page }) => {
    mkdirSync(output, { recursive: true })
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.clock.setFixedTime(new Date('2026-10-22T18:00:00Z'))
    await shellFixture(page, {
      protocol: 4,
      extraCapabilities: ['Reports', 'Attack', 'Harvest'],
      missions: {
        fleets: [],
        incoming: [],
        score_value_micro: '0',
        fleet_slots: '0',
      },
    })
    const huge = size === 'huge'
    const attackers = units(
      huge
        ? {
            LightFighter: 500000,
            HeavyFighter: 100000,
            Cruiser: 50000,
            Battleship: 20000,
            Battlecruiser: 10000,
            Bomber: 5000,
            Destroyer: 3000,
            Dreadnought: 100,
            LargeCargo: 5000,
          }
        : { LightFighter: 12, SmallCargo: 2 },
    )
    const defenders = units(
      huge
        ? {
            LightFighter: 200000,
            HeavyFighter: 40000,
            Cruiser: 30000,
            Battleship: 15000,
            Battlecruiser: 8000,
            Destroyer: 2000,
            Dreadnought: 50,
            RocketLauncher: 100000,
            LightLaser: 60000,
            HeavyLaser: 20000,
            GaussCannon: 10000,
            IonCannon: 5000,
            PlasmaTurret: 2000,
          }
        : { LightFighter: 4, RocketLauncher: 6 },
    )
    const counts = [
      {
        owner: size === 'defender' ? id(9) : binding.player,
        origin: { Fleet: id(40) },
        side: 'Attacker',
        units: attackers,
      },
      {
        owner: size === 'defender' ? binding.player : id(9),
        origin: { Stationed: id(41) },
        side: 'Defender',
        units: defenders,
      },
    ]
    const n = huge ? 6 : 2
    const atRound = (r: number) =>
      counts.map((side, index) => ({
        ...side,
        units: side.units
          .map((unit) => ({
            ...unit,
            count: String(
              Math.floor(
                Number(unit.count) *
                  (index === 0
                    ? 1 - ((huge ? 0.35 : 0.17) * r) / n
                    : 1 - r / n),
              ),
            ),
          }))
          .filter((unit) => unit.count !== '0'),
      }))
    const survivors = atRound(n)
    const losses = counts.map((side, i) => ({
      ...side,
      units: side.units
        .map((unit) => ({
          ...unit,
          count: String(
            Number(unit.count) -
              Number(
                survivors[i].units.find((x) => x.item.id === unit.item.id)
                  ?.count ?? 0,
              ),
          ),
        }))
        .filter((unit) => unit.count !== '0'),
    }))
    const recovered = [
      {
        ...counts[1],
        units: defenders
          .filter((unit) => unit.item.kind === 'Defense')
          .map((unit) => ({
            ...unit,
            count: String(Math.floor(Number(unit.count) * 0.7)),
          })),
      },
    ]
    const permanent = losses.map((side) => ({
      ...side,
      units: side.units
        .map((unit) => ({
          ...unit,
          count: String(
            Number(unit.count) -
              (side.side === 'Defender'
                ? Number(
                    recovered[0].units.find((x) => x.item.id === unit.item.id)
                      ?.count ?? 0,
                  )
                : 0),
          ),
        }))
        .filter((unit) => unit.count !== '0'),
    }))
    const at = Date.parse('2026-10-22T17:45:00Z')
    const payload = {
      kind: 'Combat',
      at,
      target: { galaxy: 1, system: 372, position: 10 },
      ...(size === 'legacy' ? {} : {
        target_name: huge ? 'VeryLongUnbrokenPlanetNameForMobileWrapping' : 'Nova Roma',
        target_kind: size === 'defender' ? 'Moon' : 'Planet',
      }),
      outcome: 'AttackerVictory',
      mission: 'Attack',
      return_at: at + 5400000,
      participants: counts.map((side) => ({
        ...side,
        technology: huge ? [18, 17, 19] : [3, 2, 3],
      })),
      survivors,
      gross_losses: losses,
      recovered,
      permanent_losses: permanent,
      debris: size === 'deuterium' ? resources(0, 0, 60000) : huge ? resources(1248000000, 672000000) : resources(5400, 1800),
      loot: huge
        ? resources(42000000, 21000000, 8500000)
        : resources(4200, 2100, 850),
      own_cargo_loss: resources(0, 0),
      rounds: Array.from({ length: n }, (_, i) => ({
        number: i + 1,
        start: atRound(i),
        end: atRound(i + 1),
        shots: String(huge ? 1460000 - i * 170000 : 24 - i * 7),
        raw_attack_ticks: String(
          huge ? 8720000000000 - i * 540000000000 : 124000000 - i * 16000000,
        ),
        shield_removed_ticks: String(huge ? 2340000000000 : 18000000),
        hull_removed_ticks: String(huge ? 5380000000000 : 76000000),
        explosions: String(huge ? 34000 - i * 3000 : 3),
      })),
    }
    // Deliberately synthetic scale fixtures; exact shot attribution is covered in engine tests.
    if (size !== 'legacy') {
      payload.rounds = payload.rounds.map((round) => {
        const {
          shots,
          raw_attack_ticks,
          shield_removed_ticks,
          hull_removed_ticks,
          explosions,
          ...counts
        } = round
        const split = (value: string, i: number) =>
          String(
            i === 0 ? BigInt(value) / 2n : BigInt(value) - BigInt(value) / 2n,
          )
        return {
          ...counts,
          fire: payload.participants.map((p, i) => ({
            owner: p.owner,
            origin: p.origin,
            side: p.side,
            shots: String(
              round.start[i].units.reduce(
                (sum, unit) => sum + BigInt(unit.count),
                0n,
              ),
            ),
            raw_attack_ticks: split(raw_attack_ticks, i),
            shield_removed_ticks: split(shield_removed_ticks, i),
            hull_removed_ticks: split(hull_removed_ticks, i),
            explosions: split(explosions, i),
          })),
        }
      }) as typeof payload.rounds
    }
    const header = {
      id: id(62),
      kind: 'Combat',
      observed_at: at,
      read: false,
      hidden: false,
    }
    await page.route('**/api/**/reports**', async (route) => {
      const request = route.request().postDataJSON()
      await route.fulfill({
        json: {
          protocol: 4,
          binding,
          request_id: (request.context ?? request).request_id,
          viewer_revision: '1',
          sampled_at: Date.now(),
          as_of_ms: Date.now(),
          data: { header, payload, player_names: { [id(9)]: 'Vega' } },
        },
      })
    })
    await page.goto(`/u/andromeda/reports/${header.id}?body=${body.id}`)
    const report = page.getByRole('region', { name: 'Report observation' })
    await expect(report.getByRole('heading', { level: 2 })).toHaveText(
      size === 'defender' ? '✕ Defeat' : '✓ Victory',
    )
    if (size === 'deuterium') {
      await expect(page.getByRole('button', { name: 'Prepare harvest', exact: true })).toBeVisible()
    }
    const debris = report.getByRole('heading', { name: 'Debris created', exact: true }).locator('..')
    await expect(debris.getByRole('img', { name: 'Deuterium', exact: true })).toHaveCount(size === 'deuterium' ? 1 : 0)
    const identity = report.locator('header').first().locator('p').first()
    const targetName = size === 'legacy' ? '' : huge ? 'VeryLongUnbrokenPlanetNameForMobileWrapping · ' : size === 'defender' ? 'Nova Roma (Moon) · ' : 'Nova Roma · '
    await expect(identity).toContainText(`${targetName}[1:372:10]`)
    await expect(identity.getByRole('link', { name: 'View target [1:372:10] in galaxy' })).toHaveAttribute('href', /galaxy\?galaxy=1&system=372&position=10/)
    await expect(page.getByText('Dispatches from the frontier.')).toHaveCount(0)
    await expect(
      report.getByText('Your cargo lost', { exact: true }),
    ).toHaveCount(0)
    await expect(
      report
        .locator('details')
        .filter({ has: page.locator('summary', { hasText: /^Round/ }) }),
    ).toHaveCount(n)
    await expect(
      report.getByRole('heading', { name: 'Vega profile details', exact: true }),
    ).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    expect(
      await report
        .locator('table')
        .evaluateAll((tables) =>
          tables.every(
            (table) => table.scrollWidth <= table.parentElement!.clientWidth,
          ),
        ),
    ).toBe(true)
    await diagnosticScreenshot(page, {
      path: `${output}/${size}-full.png`,
      fullPage: size !== 'deuterium',
    })
    if (huge)
      await expect(
        report.getByRole('cell', { name: '500,000', exact: true }),
      ).toBeVisible()
    await report.locator('details').first().locator('summary').click()
    await diagnosticScreenshot(
      report.locator('details').first(),
      { path: `${output}/${size}-round.png` },
    )
    if (size === 'legacy') {
      await expect(
        report.getByText(/Per-player damage is unavailable/).first(),
      ).toBeVisible()
      await expect(
        report.getByText('Shots fired', { exact: true }),
      ).toHaveCount(n)
    } else {
      const attack = report.getByRole('article', {
        name: `Round 1 Attacker ${size === 'defender' ? 'Vega' : 'You'}`,
        exact: true,
      })
      await expect(
        attack.getByText('Shots fired', { exact: true }),
      ).toBeVisible()
      await expect(
        report.getByText(/Per-player damage is unavailable/),
      ).toHaveCount(0)
    }
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 900 })
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      await expect(report.getByRole('heading', { level: 2 })).toBeVisible()
      await expect(identity).toContainText(`${targetName}[1:372:10]`)
      await page.evaluate(() => window.scrollTo(0, 0))
      await diagnosticScreenshot(page, {
        path: `${output}/${size}-${width}.png`,
        fullPage: size !== 'deuterium',
      })
    }
    if (size === 'deuterium') {
      await page.getByRole('button', { name: 'Prepare harvest', exact: true }).click()
      await expect(page).toHaveURL(/dispatch/)
      await expect(page.getByRole('radio', { checked: true })).toHaveValue('Harvest')
    }
  })
}

// The reported 34 → 1 defender result is compatible with zero random explosions.
test.describe('explosion counter explanation', () => {
  test.use({ hasTouch: true })
  test('preserves the counter and explains it on hover, keyboard focus, and mobile tap', async ({ page }) => {
    await shellFixture(page, { protocol: 4, extraCapabilities: ['Reports'] })
    const header = { id: id(65), kind: 'Combat', observed_at: Date.now(), read: true, hidden: false }
    const attacker = { owner: binding.player, origin: { Fleet: id(40) }, side: 'Attacker', units: units({ Cruiser: 9 }) }
    const defender = { owner: id(9), origin: { Stationed: id(41) }, side: 'Defender', units: units({ RocketLauncher: 34 }) }
    const start = [attacker, defender]
    const end = [attacker, { ...defender, units: units({ RocketLauncher: 1 }) }]
    await page.route('**/api/**/reports**', async route => {
      const request = route.request().postDataJSON()
      await route.fulfill({ json: {
        protocol: 4, binding, request_id: (request.context ?? request).request_id,
        viewer_revision: '1', sampled_at: Date.now(), as_of_ms: Date.now(),
        data: { header, payload: {
          kind: 'Combat', at: Date.now(), target: { galaxy: 1, system: 1, position: 7 }, outcome: 'Draw',
          participants: start.map(side => ({ ...side, technology: [0, 0, 0] })), survivors: end,
          gross_losses: [{ ...defender, units: units({ RocketLauncher: 33 }) }], recovered: [], debris: resources(0, 0), loot: resources(0, 0),
          rounds: [{ number: 1, start, end, fire: [{ owner: attacker.owner, origin: attacker.origin, side: attacker.side, shots: '116', raw_attack_ticks: '6032000000', shield_removed_ticks: '58000000', hull_removed_ticks: '620000000', explosions: '0' }] }],
        } },
      } })
    })
    await page.goto(`/u/andromeda/b/${body.id}/reports/${header.id}`)
    const round = page.getByRole('region', { name: 'Report observation' }).locator('details').first()
    await expect(round).toBeVisible()
    await round.locator('summary').click()
    await expect(round.locator('summary')).toContainText('34 → 1 (−33)')
    const trigger = round.getByRole('button', { name: 'Explosions caused details' }).first()
    const counter = trigger.locator('xpath=ancestor::dt/following-sibling::dd')
    await expect(counter).toHaveText('0')
    const popup = page.getByRole('dialog', { name: 'Explosions caused', exact: true })
    await trigger.hover()
    await expect(popup).toContainText('Counts successful random hull explosions.')
    await expect(popup).toContainText('Units destroyed directly by hull damage do not count')
    await expect(popup).toContainText('70% hull or less')
    await expect(popup).toContainText('30% at 70% hull remaining, 60% at 40% remaining.')
    await page.keyboard.press('Escape')
    await expect(popup).toBeHidden()
    await page.mouse.move(0, 0)
    await round.locator('summary').focus()
    // Player dossiers add focusable identities before the combat counters.
    for (let i = 0; i < 12 && !(await trigger.evaluate(el => el === document.activeElement)); i++) {
      await page.keyboard.press('Tab')
    }
    await expect(trigger).toBeFocused()
    await expect(popup).toBeVisible()
    await diagnosticScreenshot(page, { path: 'test-results/combat-explosion-keyboard.png' })
    await page.keyboard.press('Escape')
    await expect(popup).toBeHidden()
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      await trigger.tap()
      await expect(popup).toBeVisible()
      const box = (await popup.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(width)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.y + box.height).toBeLessThanOrEqual(900)
      await diagnosticScreenshot(page, { path: `test-results/combat-explosion-tap-${width}.png` })
      await round.getByRole('heading', { level: 4 }).first().tap()
      await expect(popup).toBeHidden()
      await expect(counter).toHaveText('0')
    }
  })
})
