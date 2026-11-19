import { test, expect, type Page } from './fixtures/test'

import {
  installGameFixture,
  refuseFixtureReads,
  binding,
  body,
  id,
} from './fixtures/game'

import { withFixtureResponse } from './fixtures/responses'

import { menuDestination } from './fixtures/navigation'

const pages = [
  ['messages', 'Messages', `player=${id(800)}`],
  [
    'alliance',
    'Alliance',
    `alliance=${id(900)}&welcome=1&invitation=${id(901)}`,
  ],
  ['high-scores', 'High Scores', ''],
  ['settings', 'Settings', ''],
  ['combat-simulator', 'Combat Simulator', ''],
] as const

async function fixture(page: Page, planetless = false) {
  const purchases = await installGameFixture(page, {
    protocol: 4,
    bodies: planetless
      ? []
      : [
          { ...body, name: 'Alpha' },
          { ...body, id: id(6), name: 'Beta' },
        ],
  })
  await page.route('**/alliances/query', (route) =>
    route.fulfill({
      json: {
        ...route.request().postDataJSON().context,
        sampled_at: Date.now(),
        directory: [],
        directory_count: 0,
        applications: [],
        alliance: null,
      },
    }),
  )
  await page.route(`**/alliances/${id(900)}`, (route) =>
    route.fulfill({
      json: {
        summary: {
          id: id(900),
          universe: binding.universe,
          name: 'Explorers',
          tag: 'EXP',
          member_count: 1,
          recruitment: 'Open',
        },
        public_text: 'Explore together.',
      },
    }),
  )
  await page.route('**/rankings', (route) =>
    route.fulfill({
      json: {
        binding,
        request_id: route.request().postDataJSON().request_id,
        sampled_at: Date.now(),
        processing_pending: false,
        players: [],
      },
    }),
  )
  return purchases
}

const boot = (page: Page, navigate: () => Promise<unknown>) =>
  withFixtureResponse(
    page,
    (response) => response.url().endsWith('/bootstrap'),
    navigate,
  )

// Alliance redirects finish only after the lazy destination mounts and reads Mine.
const bootAlliance = (page: Page, navigate: () => Promise<unknown>) =>
  withFixtureResponse(
    page,
    (response) =>
      response.url().endsWith('/alliances/query') &&
      response.request().postDataJSON().query.type === 'Mine',
    () => boot(page, navigate),
  )

test.describe('planet page routing at 1440px', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test(
    'Messages: legacy normalization, planet switching and history keep page context',
    async ({ page }) => {
      const purchases = await fixture(page)
      const query = `player=${id(800)}`
      const canonical = (planet: string) =>
        `/u/andromeda/b/${planet}/messages?${query}#details`
      await boot(page, () =>
        page.goto(`/u/andromeda/messages?body=${body.id}&${query}#details`),
      )
      const selector = page.getByRole('combobox', { name: 'Selected body' })
      await expect(page).toHaveURL(canonical(body.id))
      await expect(page.locator('main h1')).toHaveText('Messages')
      await expect(selector).toHaveAttribute('data-value', body.id)
      await selector.click()
      await page.getByRole('option', { name: /Beta/ }).click()
      await expect(page).toHaveURL(canonical(id(6)))
      await expect(selector).toHaveAttribute('data-value', id(6))
      await page.goBack()
      await expect(page).toHaveURL(canonical(body.id))
      await expect(selector).toHaveAttribute('data-value', body.id)
      await page.goForward()
      await expect(page).toHaveURL(canonical(id(6)))
      await expect(selector).toHaveAttribute('data-value', id(6))
      await boot(page, () => page.reload())
      await expect(page).toHaveURL(canonical(id(6)))
      await expect(page.locator('main h1')).toHaveText('Messages')
      await expect(selector).toHaveAttribute('data-value', id(6))
      const link = await menuDestination(page, 'Messages')
      await expect(link).toHaveAttribute(
        'href',
        `/u/andromeda/b/${id(6)}/messages`,
      )
      await link.click()
      await expect(page).toHaveURL(`/u/andromeda/b/${id(6)}/messages`)
      expect(purchases()).toBe(0)
    },
  )
})

test('account pages remain usable without planets and reject a foreign planet instead of falling back', async ({
  page,
}) => {
  refuseFixtureReads(page, { insigniaLibrary: true })
  await fixture(page, true)
  for (const [slug, title] of pages) {
    await boot(page, () => page.goto(`/u/andromeda/${slug}#details`))
    await expect(page.locator('main h1')).toHaveText(title)
    await expect(page).toHaveURL(
      `/u/andromeda/${slug === 'settings' ? 'settings/identity' : slug}#details`,
    )
  }
  await page.setViewportSize({ width: 320, height: 900 })
  await boot(page, () => page.goto(`/u/andromeda/messages?body=${id(99)}`))
  await page.addStyleTag({ content: 'html { font-size:200% }' })
  await expect(
    page.getByRole('heading', { name: 'Destination unavailable' }),
  ).toBeVisible()
  await expect(
    page.getByText('Planet unavailable.', { exact: false }),
  ).toBeVisible()
  await expect(page).toHaveURL(`/u/andromeda/messages?body=${id(99)}`)
  expect(
    (await page
      .getByRole('heading', { name: 'Destination unavailable', exact: true })
      .boundingBox())!.height,
  ).toBeGreaterThan(20)
})

test(
  'public alliance entry keeps its query and hash when resolving the universe name',
  async ({ page }) => {
    await fixture(page)
    await withFixtureResponse(
      page,
      (response) => response.url().endsWith(`/alliances/${id(900)}`),
      () =>
        bootAlliance(page, () =>
          page.goto(
            `/u/${binding.universe}/alliance?body=${id(6)}&alliance=${id(900)}#details`,
          ),
        ),
    )
    await expect(page.getByText('Explore together.')).toBeVisible()
    await expect(page).toHaveURL(
      `/u/andromeda/b/${id(6)}/alliance/discover?alliance=${id(900)}#details`,
    )
    await withFixtureResponse(
      page,
      (response) => response.url().endsWith(`/alliances/${id(900)}`),
      () => bootAlliance(page, () => page.reload()),
    )
    await expect(page.getByText('Explore together.')).toBeVisible()
    await expect(page).toHaveURL(
      `/u/andromeda/b/${id(6)}/alliance/discover?alliance=${id(900)}#details`,
    )
  },
)
