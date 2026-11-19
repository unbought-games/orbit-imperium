import { expect, test, type Locator } from './fixture'

test('six-round combat keeps large forces readable and discloses the selected round', async ({
  mount,
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await mount('large-combat-reader')
  const report = page.getByRole('region', { name: 'Report observation' })
  await expect(
    report.getByRole('heading', { name: 'Victory', exact: true }),
  ).toHaveText('✓ Victory')
  const forces = report.getByRole('region', { name: 'Forces and losses' })
  const attacker = forces.getByRole('article').first(),
    defender = forces.getByRole('article').nth(1)
  await expect(
    attacker.getByRole('cell', { name: '500,000', exact: true }),
  ).toBeVisible()
  await expect(
    attacker.getByRole('rowheader', { name: 'Defenses', exact: true }),
  ).toHaveCount(0)
  await expect(attacker).toContainText(
    'VeryLongUnbrokenLaunchColonyNameForMobileWrapping (Moon) · [2:24:5]',
  )
  await expect(defender).toContainText(
    'VeryLongUnbrokenPlanetNameForMobileWrapping · [1:372:10]',
  )
  await expect(
    defender.getByRole('rowgroup').filter({ hasText: 'Ships' }),
  ).toContainText('Light Fighter')
  await expect(
    defender.getByRole('rowgroup').filter({ hasText: 'Defenses' }),
  ).toContainText('Rocket Launcher')
  await expect(
    report.getByText('Your cargo lost', { exact: true }),
  ).toHaveCount(0)
  await expect(
    report
      .getByRole('heading', { name: 'Debris created' })
      .locator('..')
      .getByRole('img', { name: 'Deuterium' }),
  ).toHaveCount(0)
  const rounds = report
    .locator('details')
    .filter({ has: page.locator('summary', { hasText: /^Round/ }) })
  await expect(rounds).toHaveCount(6)
  await rounds.first().locator('summary').click()
  await expect(
    report
      .getByRole('article', { name: 'Round 1 Attacker You' })
      .getByText('Shots fired', { exact: true }),
  ).toBeVisible()
  await expect(
    report.getByText(/Per-player damage is unavailable/),
  ).toHaveCount(0)
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width)
    if (width === 1440) {
      expect(
        await forces
          .locator('table')
          .evaluateAll((tables) =>
            tables.every(
              (table) => table.scrollWidth <= table.parentElement!.clientWidth,
            ),
          ),
      ).toBe(true)
    }
  }
})

async function checkLevelLayout(
  section: Locator,
  publicLayout?: 'stacked' | 'inline',
) {
  const grids = section.locator('dl')
  const geometry = await grids.evaluateAll((grids) =>
    grids.map((grid) =>
      Array.from(grid.children, (row) => {
        const name = row.querySelector('dt')!,
          level = row.querySelector('dd')!,
          art = row.querySelector('img')!
        const box = (el: Element) => {
          const { x, y, width, height } = el.getBoundingClientRect()
          return { x, y, width, height }
        }
        return {
          row: box(row),
          name: box(name),
          level: box(level),
          art: box(art),
          nameWeight: getComputedStyle(name).fontWeight,
          hierarchy:
            parseFloat(
              getComputedStyle(level.querySelector('strong')!).fontSize,
            ) / parseFloat(getComputedStyle(name).fontSize),
          fits: row.scrollWidth <= row.clientWidth,
        }
      }),
    ),
  )
  expect(geometry.length).toBeGreaterThan(1)
  const first = geometry[0][0].row
  for (const rows of geometry) {
    expect(rows[0].row.x).toBeCloseTo(first.x, 1)
    expect(rows[0].row.width).toBeCloseTo(first.width, 1)
    for (const { name, level, art, hierarchy, nameWeight, fits } of rows) {
      expect(name.x - art.x - art.width).toBeGreaterThan(0)
      expect(name.x - art.x - art.width).toBeLessThanOrEqual(16)
      const stacked = level.y >= name.y + name.height
      if (publicLayout) expect(stacked).toBe(publicLayout === 'stacked')
      if (stacked) {
        expect(level.x).toBeCloseTo(name.x, 1)
        expect(level.y - name.y - name.height).toBeLessThanOrEqual(4)
      } else {
        expect(level.x).toBeGreaterThan(name.x)
        expect(
          Math.abs(level.y + level.height / 2 - name.y - name.height / 2),
        ).toBeLessThanOrEqual(1)
      }
      expect(hierarchy).toBeGreaterThanOrEqual(1.4)
      expect(nameWeight).toBe('500')
      expect(fits).toBe(true)
    }
  }
  return geometry
}

test('unbroken observed labels wrap beside their levels without disclosing hidden defenses', async ({
  page,
  mount,
}) => {
  await mount('long-espionage-reader')
  const longName = 'IntergalaktischesForschungsnetzwerkMitEinemSehrLangenNamen'
  const report = page.getByRole('region', { name: 'Report observation' })
  const section = (name: string) =>
    report
      .locator('section')
      .filter({ has: page.getByRole('heading', { name, exact: true }) })
  const research = section('Research'),
    buildings = section('Buildings')
  await research
    .getByText('Intergalactic Research Network', { exact: true })
    .evaluate((label, name) => {
      label.textContent = name
    }, longName)
  for (const [group, name, level] of [
    [buildings, 'Metal Mine', 0],
    [buildings, 'Research Lab', 12],
    [research, longName, 123],
  ] as const) {
    await expect(
      group
        .locator('dl > div')
        .filter({ has: page.getByText(name, { exact: true }) })
        .locator('dd'),
    ).toHaveText('Level ' + level)
  }
  await expect(section('Defenses')).toContainText(
    'Unknown — this observation did not reveal this section.',
  )
  await expect(report.getByText('Plasma Turret', { exact: true })).toHaveCount(
    0,
  )
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    const buildingRows = await checkLevelLayout(buildings),
      researchRows = await checkLevelLayout(research)
    expect(buildingRows[0][0].row.x).toBeCloseTo(researchRows[0][0].row.x, 1)
    expect(buildingRows[0][0].row.width).toBeCloseTo(
      researchRows[0][0].row.width,
      1,
    )
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width)
  }
  const translated = research.getByText(longName, { exact: true })
  const art = translated
    .locator('xpath=ancestor::div[parent::dl]')
    .locator('img')
  await art.scrollIntoViewIfNeeded()
  await expect
    .poll(() => art.evaluate((node) => (node as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0)
  const lines = await translated.evaluate((label) => {
    const range = document.createRange()
    range.selectNodeContents(label)
    const column = label.closest('dt')!.getBoundingClientRect()
    return Array.from(range.getClientRects(), (line) => ({
      left: line.left - column.left,
      right: column.right - line.right,
      top: line.top,
    }))
  })
  expect(new Set(lines.map((line) => line.top)).size).toBeGreaterThan(1)
  for (const line of lines) {
    expect(line.left).toBeGreaterThanOrEqual(-1)
    expect(line.right).toBeGreaterThanOrEqual(-1)
  }
})

test('published planet intelligence groups and pairs named levels at desktop and phone widths', async ({
  page,
  mount,
}) => {
  await mount('published-espionage-reader')
  const section = (title: string) =>
    page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
      .last()
  const buildings = section('Buildings'),
    research = section('Research')
  await expect(buildings.locator('h4').first()).toHaveCSS(
    'text-transform',
    'uppercase',
  )
  await expect(research.locator('h4').first()).toHaveCSS(
    'text-transform',
    'uppercase',
  )
  for (const [state, color] of [
    ['known', 'rgb(203, 182, 141)'],
    ['zero', 'rgb(182, 198, 214)'],
  ]) {
    const level = buildings.locator(`[data-level-state="${state}"] dd`).first()
    await expect(level).toHaveCSS('color', color)
    await expect(level).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  }
  const footer = page.locator('footer')
  await expect(footer).toContainText('Activity before contact')
  await expect(footer).toContainText('Counterespionage')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const group of [buildings, research]) {
      const grids = await checkLevelLayout(
        group,
        width === 1440 ? 'stacked' : 'inline',
      )
      for (let i = 1; i < grids.length; i++) {
        const bottom = Math.max(
          ...grids[i - 1].map(({ row }) => row.y + row.height),
        )
        expect(grids[i][0].row.y).toBeGreaterThan(bottom)
      }
      if (width === 1440 && group === buildings)
        for (const rows of grids) {
          const ys = rows.map(({ name }) => name.y)
          expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(1)
        }
    }
    expect(
      await footer.evaluate((el) => el.getBoundingClientRect().y),
    ).toBeGreaterThanOrEqual(
      await research.evaluate((el) => el.getBoundingClientRect().bottom),
    )
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width)
  }
  for (const art of await page.locator('dl dt img').all()) {
    await art.scrollIntoViewIfNeeded()
    await expect
      .poll(() =>
        art.evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
      )
      .toBe(true)
  }
})
