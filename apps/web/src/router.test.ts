import { createMemoryHistory } from '@tanstack/react-router'
import { expect, it } from 'vitest'
import { createAppRouter } from './router'
import { routeTarget } from './shell/route-target'
import { validateAuthSearch } from './shell/auth-search'

it('matches separate home, login, and signup routes', async () => {
  for (const href of ['/', '/login', '/signup']) {
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: [href] }),
    })
    await router.load()
    const match = router.state.matches.at(-1)!
    expect(match.routeId).toBe(href)
    expect(match.status).toBe('success')
  }
})

it('keeps only local game destinations in authentication return URLs', () => {
  for (const [redirect, expected] of [
    ['/u/u/research?body=mars#details', '/u/u/research?body=mars#details'],
    ['https://example.com', undefined],
    ['//example.com', undefined],
    ['/u/../../login', undefined],
    ['/u/../..//example.com', undefined],
    ['/signup', undefined],
    [123, undefined],
    [undefined, undefined],
  ]) {
    expect(validateAuthSearch({ redirect })).toEqual({ redirect: expected })
  }
})

it('matches concrete file routes and decodes planet and item parameters', async () => {
  for (const [href, page, params] of [
    ['/u/u/b/earth/resources', 'resources', { universe: 'u', body: 'earth' }],
    ['/u/u/research?body=mars', 'research', { universe: 'u' }],
    ['/u/u/galaxy?body=mars', 'galaxy', { universe: 'u' }],
    [
      '/u/u/fleets/fleet-1?body=earth',
      'fleets',
      { universe: 'u', item: 'fleet-1' },
    ],
    ['/u/u/reports/report-1', 'reports', { universe: 'u', item: 'report-1' }],
  ] as const) {
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: [href] }),
    })
    await router.load()
    const match = router.state.matches.at(-1)!
    expect(match.staticData.page).toBe(page)
    expect(match.params).toMatchObject(params)
    expect(match.status).toBe('success')
  }
})
it('builds browser-history links and preserves funding context', () => {
  const router = createAppRouter({ history: createMemoryHistory() })
  expect(
    router.buildLocation(routeTarget('u', 'resources', 'earth')).href,
  ).toBe('/u/u/b/earth/resources')
  expect(router.buildLocation(routeTarget('u', 'research', 'mars')).href).toBe(
    '/u/u/b/mars/research',
  )
  expect(
    router.buildLocation(routeTarget('u', 'fleets', 'mars', 'fleet-1')).href,
  ).toBe('/u/u/b/mars/fleets/fleet-1')
})
it('unknown paths do not become gameplay pages', async () => {
  for (const href of [
    '/unknown',
    '/u/u/colonize',
    '/u/u/b/a/resources/extra/unknown',
    '/u/u/resources',
  ]) {
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: [href] }),
    })
    await router.load()
    expect(router.state.matches.at(-1)?.staticData.page).toBeNull()
  }
})
it('rejects invalid funding query values at the route boundary', async () => {
  for (const search of ['body=123', 'body=', 'body=%5B%22a%22%5D']) {
    const router = createAppRouter({
      history: createMemoryHistory({
        initialEntries: ['/u/u/research?' + search],
      }),
    })
    await router.load()
    expect(router.state.matches.some((match) => match.status === 'error')).toBe(
      true,
    )
  }
})
