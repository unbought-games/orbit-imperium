import {
  createMemoryHistory,
  defaultStringifySearch,
} from '@tanstack/react-router'
import { expect, it } from 'vitest'
import { createAppRouter } from './router'
import { routeTarget } from './shell/route-target'
import { validateAuthSearch } from './shell/auth-search'
import { pageTitles } from './shell/navigation-model'
import type { Page } from './shell/routes'

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
    ['/u/u/b/mars/research#details', '/u/u/b/mars/research#details'],
    ['https://example.com', undefined],
    ['//example.com', undefined],
    ['/u/../../login', undefined],
    ['/u/../..//example.com', undefined],
    ['/signup', undefined],
    ['/profile', '/profile'],
    [
      '/profiles/empire/00000000-0000-4000-8000-000000000031',
      '/profiles/empire/00000000-0000-4000-8000-000000000031',
    ],
    ['/profiles/../../example.com', undefined],
    ['/profile?redirect=https://example.com', undefined],
    [123, undefined],
    [undefined, undefined],
  ]) {
    expect(validateAuthSearch({ redirect })).toEqual({ redirect: expected })
  }
})

it('matches concrete file routes and decodes planet and item parameters', async () => {
  for (const [href, page, params] of [
    ['/u/u/b/earth/resources', 'resources', { universe: 'u', body: 'earth' }],
    ['/u/u/b/mars/briefing', 'briefing', { universe: 'u', body: 'mars' }],
    ['/u/u/b/mars/research', 'research', { universe: 'u', body: 'mars' }],
    ['/u/u/b/mars/galaxy', 'galaxy', { universe: 'u', body: 'mars' }],
    [
      '/u/u/b/earth/fleets/fleet-1',
      'fleets',
      { universe: 'u', body: 'earth', item: 'fleet-1' },
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
  expect(router.buildLocation(routeTarget('u', 'briefing', 'mars')).href).toBe(
    '/u/u/b/mars/briefing',
  )
  expect(
    router.buildLocation(routeTarget('u', 'fleets', 'mars', 'fleet-1')).href,
  ).toBe('/u/u/b/mars/fleets/fleet-1')
})
it('puts selected-body context in the path for every game destination', () => {
  const router = createAppRouter({ history: createMemoryHistory() })
  for (const page of Object.keys(pageTitles) as Page[]) {
    const href = router.buildLocation(routeTarget('u', page, 'mars')).href
    const url = new URL(href, 'https://orbit.example.test')
    expect(url.pathname).toMatch(/^\/u\/u\/b\/mars\//)
    expect(url.searchParams.has('body')).toBe(false)
  }
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

const accountPages = [
  'menu',
  'rewards',
  'messages',
  'alliance',
  'high-scores',
  'settings',
  'combat-simulator',
] as const
it('builds canonical planet links for every account page, with planetless entry points', async () => {
  for (const page of accountPages) {
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: [`/u/u/b/mars/${page}`] }),
    })
    await router.load()
    expect(router.state.matches.at(-1)).toMatchObject({
      status: 'success',
      staticData: { page },
      params: { universe: 'u', body: 'mars' },
    })
    expect(router.buildLocation(routeTarget('u', page, 'mars')).href).toBe(
      `/u/u/b/mars/${page}`,
    )
    expect(router.buildLocation(routeTarget('u', page)).href).toBe(
      `/u/u/${page}`,
    )
  }
})
it('validates player and alliance queries on both canonical and legacy routes', async () => {
  const id = '00000000-0000-4000-8000-000000000001'
  for (const [page, key] of [
    ['messages', 'player'],
    ['alliance', 'alliance'],
  ]) {
    for (const prefix of ['', 'b/mars/']) {
      for (const value of [id, 'invalid']) {
        const router = createAppRouter({
          history: createMemoryHistory({
            initialEntries: [`/u/u/${prefix}${page}?${key}=${value}#details`],
          }),
        })
        await router.load()
        expect(
          router.state.matches.some((match) => match.status === 'error'),
        ).toBe(value === 'invalid')
        if (value === id)
          expect(router.state.matches.at(-1)?.search).toMatchObject({
            [key]: id,
          })
        expect(router.state.location.hash).toBe('details')
      }
    }
  }
})

it('retains alliance welcome and invitation intent on canonical and legacy routes', async () => {
  const alliance = '00000000-0000-4000-8000-000000000001'
  const invitation = '00000000-0000-4000-8000-000000000002'
  for (const prefix of ['', 'b/mars/']) {
    const router = createAppRouter({
      history: createMemoryHistory({
        initialEntries: [
          `/u/u/${prefix}alliance${defaultStringifySearch({ alliance, welcome: '1', invitation })}`,
        ],
      }),
    })
    await router.load()
    expect(router.state.matches.at(-1)?.search).toMatchObject({
      alliance,
      welcome: '1',
      invitation,
    })
    expect(router.state.matches.at(-1)?.status).toBe('success')
  }
})

it('keeps settings section and selected body in real paths', async () => {
  const router = createAppRouter({
    history: createMemoryHistory({
      initialEntries: ['/u/andromeda/b/mars/settings/support'],
    }),
  })
  await router.load()
  expect(router.state.matches.at(-1)).toMatchObject({
    status: 'success',
    staticData: { page: 'settings' },
    params: { body: 'mars', item: 'support' },
  })
  expect(
    router.buildLocation(routeTarget('Andromeda', 'settings', 'moon', 'game'))
      .href,
  ).toBe('/u/andromeda/b/moon/settings/game')
})

it('builds and matches every alliance section and settings deep link', async () => {
  for (const item of [
    'hall',
    'members',
    'applications',
    'roles',
    'settings',
    'audit',
    'settings/identity',
    'settings/hall',
    'settings/public-page',
    'settings/media',
    'settings/recruitment',
    'settings/invitations',
    'settings/leadership',
    'settings/membership',
  ]) {
    for (const body of ['mars', undefined]) {
      const href = `/u/andromeda/${body ? `b/${body}/` : ''}alliance/${item}`
      const router = createAppRouter({
        history: createMemoryHistory({ initialEntries: [href] }),
      })
      expect(
        router.buildLocation(routeTarget('Andromeda', 'alliance', body, item))
          .href,
      ).toBe(href)
      await router.load()
      const [section, subsection] = item.split('/')
      expect(router.state.matches.at(-1)).toMatchObject({
        status: 'success',
        staticData: { page: 'alliance' },
        params: {
          universe: 'andromeda',
          item: section,
          ...(subsection ? { section: subsection } : {}),
        },
      })
    }
  }
})
