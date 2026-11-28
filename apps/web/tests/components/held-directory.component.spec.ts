import { test, expect } from './fixture'
import { binding } from '../../src/test-support/empire'
import { publicData } from '../fixtures/recruitment'
import { withFixtureResponse } from '../fixtures/responses'

test('public alliance search retains its real controls during a held read and renders only the settled result', async ({
  page,
  mount,
}) => {
  const path = `/api/v4/universes/${binding.universe}/recruitment`
  await page.route(
    (url) => url.pathname === '/api/auth/config',
    (r) =>
      r.request().method() === 'GET'
        ? r.fulfill({ json: { mode: 'local', universes: [] } })
        : r.fallback(),
  )
  let requested!: () => void
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    requested = resolve
  })
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(
    (url) => url.pathname === path,
    async (route) => {
      const url = new URL(route.request().url())
      if (route.request().method() !== 'GET') return route.fallback()
      if (url.searchParams.size === 0)
        return route.fulfill({
          json: {
            total: 1,
            alliances: [
              {
                summary: publicData.summary,
                public_text: publicData.public_text,
              },
            ],
          },
        })
      if (url.search !== '?search=missing') return route.fallback()
      requested()
      await held
      await route.fulfill({ json: { total: 0, alliances: [] } })
    },
  )
  await withFixtureResponse(
    page,
    (r) => new URL(r.url()).pathname === path && !new URL(r.url()).search,
    () => mount('held-directory'),
  )
  const link = page.getByRole('link', { name: 'View STAR', exact: true })
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute(
      'href',
      `/alliances/${binding.universe}/${publicData.summary.id}`,
    )
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  }
  await page.setViewportSize({ width: 390, height: 900 })
  const search = page.getByRole('searchbox', { name: 'Search alliances' })
  await search.fill('missing')
  await withFixtureResponse(
    page,
    (r) =>
      new URL(r.url()).pathname === path &&
      new URL(r.url()).search === '?search=missing',
    async () => {
      try {
        await search.press('Enter')
        await pending
        await expect(
          page
            .getByRole('region', { name: 'Alliance directory' })
            .locator('[aria-busy]'),
        ).toHaveAttribute('aria-busy', 'true')
        await expect(
          page.getByRole('status').filter({ hasText: 'Loading alliances…' }),
        ).toBeVisible()
        await expect(search).toBeFocused()
        await expect(search).toHaveValue('missing')
        await expect(
          page.getByRole('button', { name: 'Filters', exact: true }),
        ).toBeEnabled()
      } finally {
        release()
      }
    },
  )
  await expect(
    page.getByRole('heading', { name: 'No alliances match your search.' }),
  ).toBeVisible()
  await expect(
    page.getByRole('status').filter({ hasText: 'Loading alliances…' }),
  ).toHaveCount(0)
  await expect(search).toBeFocused()
})
