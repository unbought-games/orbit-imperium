import { test, expect, type Route } from './fixtures/test'
import { recruitmentFixture, pathMatches } from './fixtures/recruitment'
import { withFixtureResponse } from './fixtures/responses'
import { binding } from './fixtures/game'

// LoadingPresence tests own time boundaries; loading.component tests own geometry
// and inert/focus behavior. This journey proves the directory wires a real query
// into that component and keeps its editable controls usable until delivery.
test('slow alliance search keeps its space and controls through delayed loading at 390px', { tag: '@journey' }, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await recruitmentFixture(page)
  await withFixtureResponse(page, pathMatches('/recruitment'), () => page.goto(`/alliances/${binding.universe}`))
  await expect(page.getByRole('link', { name: 'View STAR', exact: true })).toBeVisible()
  let capture!: (route: Route) => void
  const requested = new Promise<Route>((resolve) => { capture = resolve })
  await page.route('**/recruitment?*', capture)
  const search = page.getByRole('searchbox', { name: 'Search alliances' })
  await search.fill('missing')
  await search.press('Enter')
  const held = await requested
  expect(new URL(held.request().url()).searchParams.get('search')).toBe('missing')
  const content = page.getByRole('region', { name: 'Alliance directory' }).locator('[aria-busy]')
  await expect(content).toHaveAttribute('aria-busy', 'true')
  await expect(page.getByRole('status').filter({ hasText: 'Loading alliances…' })).toBeVisible()
  await expect(search).toBeFocused()
  await expect(search).toHaveValue('missing')
  await expect(page.getByRole('button', { name: 'Filters', exact: true })).toBeEnabled()
  await withFixtureResponse(page, pathMatches('/recruitment'), () => held.fulfill({ json: { alliances: [], total: 0 } }))
  await expect(page.getByRole('heading', { name: 'No alliances match your search.' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Loading alliances…' })).toHaveCount(0)
  await expect(search).toBeFocused()
})
