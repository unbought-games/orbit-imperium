import { test, expect, type Page } from './fixture'
import type { InsigniaState } from '../../src/adapters/insignias'
import { id } from '../../src/test-support/bootstrap'

const asset =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22%3E%3Ccircle cx=%2210%22 cy=%2210%22 r=%227%22/%3E%3C/svg%3E'
const fallback = {
  version: 1 as const,
  symbol: 'compass',
  foreground: '#cbb68d',
  background: '#152b40',
}
function symbol(
  id: string,
  name: string,
  group: InsigniaState['catalog'][number]['group'] = 'legacy',
  supporter = false,
): InsigniaState['catalog'][number] {
  return {
    id,
    name,
    group,
    supporter,
    asset_url: asset,
    access: supporter ? 'supporter_required' : 'available',
  }
}
async function prepare(
  page: Page,
  mount: (name: string) => Promise<void>,
  mode: 'legacy' | 'free' | 'member' | 'access' = 'legacy',
) {
  const catalog = [symbol('compass', 'Wayfinder')]
  if (mode === 'access')
    catalog.push(
      symbol('wings', 'Starwing'),
      symbol('test-star', 'Test star', 'legacy', true),
    )
  if (mode === 'free' || mode === 'member')
    catalog.push(
      symbol('forge-wayfinder', 'wayfinder', 'center'),
      symbol('forge-triforce', 'triforce', 'center'),
      symbol('forge-mini-stripes', 'mini-stripes', 'accents'),
      symbol('forge-crown', 'crown', 'accents'),
      symbol('forge-moons', 'moons', 'accents'),
      symbol('test-center', 'test-center', 'center', true),
      ...['test-stripe-a', 'test-stripe-b', 'test-stripe-c'].map((id) =>
        symbol(id, id, 'stripes', true),
      ),
    )
  if (mode === 'member') for (const item of catalog) item.access = 'available'
  const snapshot: InsigniaState = {
    binding: { account: id(1), player: id(2), universe: id(3), epoch: id(4) },
    request_id: id(5),
    library: {
      designs: [],
      equipped: null,
      permanent_symbols: mode === 'legacy' ? ['test-star'] : [],
    },
    catalog,
    policy: 'supporter',
    appearance: null,
    composition_access: mode === 'member' ? 'available' : 'supporter_required',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  }
  await page.addInitScript((s) => {
    window.insigniaSnapshot = s
  }, snapshot)
  await mount('insignia-editor')
}
const designs = (page: Page) =>
  page.evaluate(() => window.insigniaSnapshot.library.designs)

test(`saved collection remains visible without an equipped design`, async ({
  page,
  mount,
}) => {
  await prepare(page, mount)
  const panel = page.getByRole('region', { name: 'Empire insignia' })
  for (const name of ['First standard', 'Second standard']) {
    await panel.getByRole('button', { name: 'New design' }).click()
    await panel.getByLabel('Design name', { exact: true }).fill(name)
    await panel.getByRole('button', { name: 'Save & equip' }).click()
    await expect(
      panel.getByLabel('Saved designs').locator('option:checked'),
    ).toHaveText(`${name} · Equipped`)
  }
  await panel.getByRole('button', { name: 'Remove insignia' }).click()
  await expect(
    panel.getByRole('button', { name: 'Remove insignia' }),
  ).toHaveCount(0)
  await page.evaluate(() => window.remountInsignia())
  await expect(panel.getByLabel('Design name', { exact: true })).toHaveValue(
    'First standard',
  )
  await expect(panel).not.toContainText('Your collection starts here')
  expect(
    await page.evaluate(() => window.insigniaSnapshot.library.equipped),
  ).toBeNull()
  await expect(panel.getByLabel('Current empire insignia')).toHaveCount(0)
  await expect(panel).toContainText('No insignia equipped.')
  await panel
    .getByLabel('Saved designs')
    .selectOption({ label: 'Second standard' })
  await panel
    .getByRole('button', { name: 'Delete design', exact: true })
    .click()
  await expect(panel.getByLabel('Design name', { exact: true })).toHaveValue(
    'First standard',
  )
  await expect(panel).not.toContainText('Your collection starts here')
  expect(await designs(page)).toHaveLength(1)
  expect(
    await page.evaluate(() => window.insigniaSnapshot.library.equipped),
  ).toBeNull()
  await expect(panel.getByLabel('Current empire insignia')).toHaveCount(0)
  await expect(panel).toContainText('No insignia equipped.')
})

test(`community catalog and preserved missing selection`, async ({
  page,
  mount,
}) => {
  await prepare(page, mount)
  const panel = page.getByRole('region', { name: 'Empire insignia' })
  await panel.getByRole('button', { name: 'New design' }).click()
  await expect(
    panel.getByRole('button', { name: 'Test star', exact: true }),
  ).toHaveCount(0)
  await expect(
    panel.getByRole('button', { name: 'Wayfinder', exact: true }),
  ).toBeVisible()
  await expect(panel).not.toContainText('Members can use additional symbols')
  await page.evaluate(
    ({ id, fallback }) => {
      window.insigniaSnapshot.library.designs = [
        {
          id,
          name: 'Preserved design',
          recipe: { ...fallback, symbol: 'test-star' },
          revision: 1,
        },
      ]
      window.insigniaSnapshot.library.equipped = id
      window.insigniaSnapshot.appearance = {
        recipe: fallback,
        asset_url: window.insigniaSnapshot.catalog[0].asset_url,
      }
    },
    { id: id(31), fallback },
  )
  await page.evaluate(() => window.remountInsignia())
  await expect(panel.getByLabel('Design name', { exact: true })).toHaveValue(
    'Preserved design',
  )
  await expect(panel).toContainText(
    'This symbol is not installed on this server.',
  )
  await expect(
    panel.getByRole('button', { name: 'Equip design', exact: true }),
  ).toBeDisabled()
  await expect(
    panel.getByRole('button', { name: 'Delete design', exact: true }),
  ).toBeEnabled()

  await panel.getByRole('button', { name: 'Wayfinder', exact: true }).click()
  await expect(
    panel.getByRole('button', { name: 'Save & equip' }),
  ).toBeEnabled()
  await panel.getByRole('button', { name: 'Save & equip' }).click()
  await expect(panel.getByRole('status')).toHaveText(
    'Design saved and equipped.',
  )
  expect((await designs(page))[0].recipe.symbol).toBe('compass')
})

test(`layered composer saves colors and slots`, async ({ page, mount }) => {
  await prepare(page, mount, 'free')
  const panel = page.getByRole('region', { name: 'Empire insignia' })
  await panel.getByRole('button', { name: 'New design' }).click()
  await expect(
    panel.getByRole('button', { name: 'test-center', exact: true }),
  ).toBeDisabled()
  await panel.getByRole('button', { name: 'triforce', exact: true }).click()
  await panel.getByRole('button', { name: 'mini-stripes', exact: true }).click()
  await panel.getByLabel('Element color', { exact: true }).fill('#aabbcc')
  await panel.getByRole('button', { name: 'Hexagon', exact: true }).click()
  await panel.getByRole('button', { name: 'Save & equip' }).click()
  await expect(panel.getByRole('status')).toHaveText(
    'Design saved and equipped.',
  )
  expect((await designs(page))[0].recipe.version).toBe(2)
  expect((await designs(page))[0].recipe.shape).toBe('hexagon')
  expect((await designs(page))[0].recipe.layers).toHaveLength(2)
  expect(
    (await designs(page))[0].recipe.layers?.every((l) => l.color === '#aabbcc'),
  ).toBe(true)
  await page.evaluate(() => {
    window.insigniaSnapshot.composition_access = 'available'
    for (const item of window.insigniaSnapshot.catalog)
      item.access = 'available'
  })
  await page.evaluate(() => window.remountInsignia())
  for (const id of ['test-stripe-a', 'test-stripe-b', 'test-stripe-c'])
    await panel.getByRole('button', { name: id, exact: true }).click()
  await panel.getByLabel('Accent color', { exact: true }).fill('#ffeeaa')
  await panel.getByRole('button', { name: 'Save & equip' }).click()
  await expect(panel.getByRole('status')).toHaveText(
    'Design saved and equipped.',
  )
  expect((await designs(page))[0].recipe.layers).toHaveLength(4)
  expect(
    (await designs(page))[0].recipe.layers?.some(
      (l) => l.symbol === 'test-stripe-a',
    ),
  ).toBe(false)
  await page.evaluate(() => window.remountInsignia())
  await expect(
    panel.getByRole('button', { name: 'test-stripe-c', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  }
})
for (const width of [1440, 390]) {
  test(`empty color groups and background shape persistence at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await prepare(page, mount, 'member')
    const panel = page.getByRole('region', { name: 'Empire insignia' })
    await panel.getByRole('button', { name: 'New design' }).click()
    const accent = panel.getByLabel('Accent color', { exact: true })
    await expect(accent).toBeDisabled()
    await expect(accent).toHaveAccessibleDescription(
      'Select an element to set its color.',
    )
    await panel.getByRole('button', { name: 'crown', exact: true }).click()
    await accent.fill('#22cc88')
    await panel.getByRole('button', { name: 'moons', exact: true }).click()
    await expect(accent).toHaveValue('#22cc88')
    await panel.getByRole('button', { name: 'moons', exact: true }).click()
    await expect(accent).toBeDisabled()
    await panel.getByRole('button', { name: 'crown', exact: true }).click()
    await accent.fill('#22cc88')
    const stripe = panel.getByLabel('Stripe color', { exact: true })
    await expect(stripe).toBeDisabled()
    await panel
      .getByRole('button', { name: 'test-stripe-a', exact: true })
      .click()
    await stripe.fill('#8866cc')
    await panel
      .getByRole('button', { name: 'test-stripe-b', exact: true })
      .click()
    await panel
      .getByRole('button', { name: 'test-stripe-c', exact: true })
      .click()
    await expect(stripe).toHaveValue('#8866cc')
    const preview = panel.getByRole('img', { name: 'Insignia preview' })
    for (const [shape, name] of [
      ['shield', 'Shield'],
      ['circle', 'Circle'],
      ['rounded_square', 'Rounded square'],
      ['diamond', 'Diamond'],
      ['hexagon', 'Hexagon'],
    ]) {
      const choice = panel.getByRole('button', { name, exact: true })
      await choice.focus()
      await choice.press('Space')
      await expect(choice).toHaveAttribute('aria-pressed', 'true')
      await expect(preview).toHaveAttribute('data-shape', shape)
    }
    await panel.getByRole('button', { name: 'Save & equip' }).click()
    await expect(panel.getByRole('status')).toHaveText(
      'Design saved and equipped.',
    )
    expect((await designs(page))[0].recipe.shape).toBe('hexagon')
    expect(
      (await designs(page))[0].recipe.layers
        ?.filter((l) => l.symbol.startsWith('test-stripe'))
        .map((l) => l.color),
    ).toEqual(['#8866cc', '#8866cc'])
    await page.evaluate(() => window.remountInsignia())
    await expect(preview).toHaveAttribute('data-shape', 'hexagon')
    await expect(accent).toHaveValue('#22cc88')

    await panel.getByRole('button', { name: 'Clear elements' }).click()
    for (const label of ['Center color', 'Stripe color', 'Accent color'])
      await expect(panel.getByLabel(label, { exact: true })).toBeDisabled()
    await expect(preview).toHaveAttribute('data-shape', 'hexagon')

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  })
}

test('editor preserves the equipped design across membership observations and permanent grants', async ({
  page,
  mount,
}) => {
  await prepare(page, mount, 'access')
  const panel = page.getByRole('region', { name: 'Empire insignia' })
  await panel.getByRole('button', { name: 'New design' }).click()
  const name = panel.getByLabel('Design name', { exact: true })
  await name.fill('Aurelian expedition')
  await panel.getByRole('button', { name: 'Starwing', exact: true }).click()
  await expect(
    panel.getByRole('button', {
      name: 'Test star · Membership access required',
    }),
  ).toBeDisabled()
  await panel.getByLabel('Symbol color', { exact: true }).fill('#f2ca74')
  await panel.getByLabel('Background color', { exact: true }).fill('#743c4c')
  const save = panel.getByRole('button', { name: 'Save & equip' })
  await save.click()
  await expect(panel.getByRole('status')).toHaveText(
    'Design saved and equipped.',
  )
  expect((await designs(page))[0].recipe).toMatchObject({
    foreground: '#f2ca74',
    background: '#743c4c',
  })
  await page.evaluate(() => {
    window.insigniaSnapshot.catalog.find(
      (item) => item.id === 'test-star',
    )!.access = 'available'
    window.remountInsignia()
  })
  await expect(name).toHaveValue('Aurelian expedition')
  await panel.getByRole('button', { name: 'Test star', exact: true }).click()
  await save.click()
  await expect(panel.getByRole('status')).toHaveText(
    'Design saved and equipped.',
  )
  await page.evaluate(() => {
    window.insigniaSnapshot.catalog.find(
      (item) => item.id === 'test-star',
    )!.access = 'unavailable'
    window.remountInsignia()
  })
  await expect(panel).toContainText(
    'Membership verification is temporarily unavailable',
  )
  await expect(name).toHaveValue('Aurelian expedition')
  await page.evaluate(() => {
    window.insigniaSnapshot.library.permanent_symbols = ['test-star']
    window.remountInsignia()
  })
  await expect(panel.getByLabel('Permanently unlocked')).toBeVisible()
  expect((await designs(page))[0].recipe.symbol).toBe('test-star')
})

test('a refused insignia save keeps the draft through a real library reload and retry', async ({
  page,
  mount,
}) => {
  await prepare(page, mount)
  const panel = page.getByRole('region', {
    name: 'Empire insignia',
    exact: true,
  })
  await panel.getByRole('button', {name:'New design',exact:true}).click()
  await expect(panel.getByLabel('Design name', { exact: true })).toBeVisible()
  await panel.getByLabel('Design name', { exact: true }).fill('Still mine')
  await page.evaluate(() => {
    window.rejectNextInsigniaSave = true
  })
  await panel.getByRole('button', { name: 'Save & equip' }).click()
  await expect(panel.getByRole('alert')).toContainText('could not confirm')
  await expect(panel.getByLabel('Design name', { exact: true })).toHaveValue(
    'Still mine',
  )
  await panel.getByRole('button', { name: 'Reload library' }).click()
  await expect(panel.getByRole('alert')).toHaveCount(0)
  await expect(panel.getByLabel('Design name', { exact: true })).toHaveValue(
    'Still mine',
  )
  await panel.getByRole('button', { name: 'Save & equip' }).click()
  await expect(panel.getByRole('status')).toContainText(
    'Design saved and equipped.',
  )
  expect((await designs(page)).map((d) => d.name)).toEqual(['Still mine'])
})
