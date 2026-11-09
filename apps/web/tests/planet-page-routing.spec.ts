import { test, expect, type Page } from './fixtures/test'
import { installGameFixture, binding, body, id } from './fixtures/game'
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
    response => response.url().endsWith('/alliances/query') && response.request().postDataJSON().query.type === 'Mine',
    () => boot(page, navigate),
  )

for (const width of [1440, 390]) {
  test.describe(`planet page routing at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })
    for (const [slug, title, query] of pages) {
      test(`${title}: legacy normalization, planet switching and history keep page context`, async ({
        page,
      }) => {
        const purchases = await fixture(page)
        const destinationSlug = slug === 'alliance' ? 'alliance/discover' : slug
        const destinationTitle = slug === 'alliance' ? 'Discover alliances' : title
        // TanStack serializes the validated welcome string as JSON, while the legacy input is numeric.
        const canonicalQuery = query.replace('welcome=1', 'welcome=%221%22')
        const suffix = `${canonicalQuery ? `?${canonicalQuery}` : ''}#details`
        const canonical = (planet: string) =>
          `/u/andromeda/b/${planet}/${destinationSlug}${suffix}`
        const open = slug === 'alliance' ? bootAlliance : boot
        await open(page, () =>
          page.goto(
            `/u/andromeda/${slug}?body=${body.id}${query ? `&${query}` : ''}#details`,
          ),
        )
        await expect(page).toHaveURL(canonical(body.id))
        await expect(page.locator('main h1')).toHaveText(destinationTitle)
        const selector = page.getByRole('combobox', { name: 'Selected body' })
        await expect(selector).toHaveAttribute('data-value', body.id)
        await selector.click()
        await page.getByRole('option', { name: /Beta/ }).click()
        await expect(page).toHaveURL(canonical(id(6)))
        await expect(selector).toHaveAttribute('data-value', id(6))
        await expect(page.locator('main h1')).toHaveText(destinationTitle)
        await page.goBack()
        await expect(page).toHaveURL(canonical(body.id))
        await expect(selector).toHaveAttribute('data-value', body.id)
        await page.goForward()
        await expect(page).toHaveURL(canonical(id(6)))
        await expect(selector).toHaveAttribute('data-value', id(6))
        await open(page, () => page.reload())
        await expect(page).toHaveURL(canonical(id(6)))
        await expect(selector).toHaveAttribute('data-value', id(6))
        await expect(page.locator('main h1')).toHaveText(destinationTitle)
        // Menu navigation must generate the canonical path directly, without a redirect.
        const link = await menuDestination(page, title)
        await expect(link).toHaveAttribute(
          'href',
          `/u/andromeda/b/${id(6)}/${slug}`,
        )
        await link.click()
        await expect(page).toHaveURL(`/u/andromeda/b/${id(6)}/${slug}`)
        expect(purchases()).toBe(0)
      })
    }
  })
}

test('account pages remain usable without planets and reject a foreign planet instead of falling back', async ({
  page,
}) => {
  await fixture(page, true)
  for (const [slug, title] of pages) {
    await boot(page, () => page.goto(`/u/andromeda/${slug}#details`))
    await expect(page.locator('main h1')).toHaveText(title)
    await expect(page).toHaveURL(`/u/andromeda/${slug}#details`)
  }
  await boot(page, () => page.goto(`/u/andromeda/messages?body=${id(99)}`))
  await expect(
    page.getByRole('heading', { name: 'Destination unavailable' }),
  ).toBeVisible()
  await expect(
    page.getByText('Planet unavailable.', { exact: false }),
  ).toBeVisible()
  await expect(page).toHaveURL(`/u/andromeda/messages?body=${id(99)}`)
})

test('message selection retains the selected planet', async ({ page }) => {
  await fixture(page)
  const peer = id(800)
  const contact = {
    player: peer,
    username: 'Nova',
    blocked: false,
    request: null,
    requested_by: null,
    accepted: true,
  }
  await page.route('**/social/query', (route) => {
    const { context, query } = route.request().postDataJSON()
    return route.fulfill({
      json: {
        ...context,
        conversations: [],
        messages: [],
        circulars: [],
        next_cursor: null,
        contacts: query.type === 'Contacts' ? [contact] : [],
        contact: query.type === 'Messages' ? contact : null,
      },
    })
  })
  await boot(page, () => page.goto(`/u/andromeda/b/${id(6)}/messages#details`))
  await withFixtureResponse(
    page,
    (response) =>
      response.url().endsWith('/social/query') &&
      response.request().postDataJSON().query.type === 'Contacts',
    () => page.getByRole('button', { name: 'Friends', exact: true }).click(),
  )
  await withFixtureResponse(
    page,
    (response) =>
      response.url().endsWith('/social/query') &&
      response.request().postDataJSON().query.type === 'Messages',
    () =>
      page.getByRole('button', { name: 'Message Nova', exact: true }).click(),
  )
  await expect(page).toHaveURL(
    `/u/andromeda/b/${id(6)}/messages?player=${peer}#details`,
  )
  await expect(
    page.getByRole('button', { name: 'Back to conversations' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Back to conversations' }).click()
  await expect(page).toHaveURL(`/u/andromeda/b/${id(6)}/messages#details`)
})

test('public alliance entry keeps its query and hash when resolving the universe name', async ({
  page,
}) => {
  await fixture(page)
  await withFixtureResponse(
    page,
    response => response.url().endsWith(`/alliances/${id(900)}`),
    () => bootAlliance(page, () => page.goto(
      `/u/${binding.universe}/alliance?body=${id(6)}&alliance=${id(900)}#details`,
    )),
  )
  await expect(page.getByText('Explore together.')).toBeVisible()
  await expect(page).toHaveURL(
    `/u/andromeda/b/${id(6)}/alliance/discover?alliance=${id(900)}#details`,
  )
})

test('canonical planet context wins over a redundant legacy query', async ({
  page,
}) => {
  await fixture(page)
  await boot(page, () =>
    page.goto(
      `/u/andromeda/b/${id(6)}/messages?body=${body.id}&player=${id(800)}#details`,
    ),
  )
  await expect(page).toHaveURL(
    `/u/andromeda/b/${id(6)}/messages?player=${id(800)}#details`,
  )
  await expect(
    page.getByRole('combobox', { name: 'Selected body' }),
  ).toHaveAttribute('data-value', id(6))
})

test('anonymous direct links retain their canonical path, query and hash through the login gate', async ({
  page,
}) => {
  await fixture(page)
  await page.route('**/api/v1/bootstrap', (route) =>
    route.fulfill({
      json: {
        version: 1,
        signup_enabled: false,
        result: { status: 'anonymous' },
      },
    }),
  )
  const target = `/u/andromeda/b/${body.id}/messages?player=${id(800)}#details`
  await boot(page, () => page.goto(target))
  await expect(page).toHaveURL(/\/login\?/)
  expect(new URL(page.url()).searchParams.get('redirect')).toBe(target)
})
