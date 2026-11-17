import { describe, expect, it } from 'vitest'
import { readyFixture, id } from '../test-support/bootstrap'
import { resolveShellRoute } from './shell-route'
import { withoutBodySearch } from './page-search'
import { routeTarget } from './route-target'

const view = readyFixture(4).snapshot.view
view.bodies = [
  { ...view.bodies[0], id: id(5) },
  { ...view.bodies[0], id: id(6) },
]
view.capabilities = ['Galaxy', 'Research', 'Manufacturing', 'Transport'].map(
  (capability) => ({ capability, enabled: true }),
) as typeof view.capabilities
const pages = [
  'resources',
  'research',
  'fleets',
  'galaxy',
  'dispatch',
  'reports',
  'messages',
  'alliance',
  'high-scores',
  'settings',
  'combat-simulator',
  'menu',
  'rewards',
] as const

describe.each(pages)('%s shell context', (page) => {
  it('normalizes owned legacy context and gives canonical paths precedence', () => {
    const legacy = resolveShellRoute(
      page,
      { universe: 'andromeda' },
      { body: id(6) },
      view,
      'Andromeda',
    )
    expect(legacy).toMatchObject({
      route: { available: true, body: id(6), page },
      canonicalPage: page,
      canonicalizing: true,
    })
    const canonical = resolveShellRoute(
      page,
      { universe: 'andromeda', body: id(5) },
      { body: id(6) },
      view,
      'Andromeda',
    )
    expect(canonical).toMatchObject({
      route: { available: true, body: id(5) },
      canonicalizing: true,
    })
    expect(
      resolveShellRoute(
        page,
        { universe: 'andromeda', body: id(5) },
        {},
        view,
        'Andromeda',
      ).canonicalizing,
    ).toBe(false)
    expect(routeTarget('Andromeda', page, id(6))).toMatchObject({
      params: { universe: 'andromeda', body: id(6) },
      search: {},
    })
    expect(routeTarget('Andromeda', page, id(6)).to).toContain('/b/$body/')
  })
  it('never normalizes foreign or removed context into an owned body', () => {
    for (const params of [
      { universe: 'andromeda', body: id(99) },
      { universe: 'foreign', body: id(5) },
    ]) {
      expect(
        resolveShellRoute(page, params, { body: id(6) }, view, 'Andromeda'),
      ).toMatchObject({
        route: { available: false, body: null },
        body: undefined,
        canonicalizing: false,
      })
    }
    expect(
      resolveShellRoute(
        page,
        { universe: 'andromeda' },
        { body: id(99) },
        view,
        'Andromeda',
      ),
    ).toMatchObject({ route: { available: false }, canonicalizing: false })
  })
})
it('resolves a default once, preserves account pages without planets and leaves location deep links alone', () => {
  for (const page of pages)
    expect(
      resolveShellRoute(page, { universe: 'andromeda' }, {}, view, 'Andromeda'),
    ).toMatchObject({
      route: { available: true, body: id(5) },
      canonicalizing: true,
    })
  for (const page of [
    'messages',
    'alliance',
    'high-scores',
    'settings',
    'combat-simulator',
    'menu',
    'rewards',
  ] as const)
    expect(
      resolveShellRoute(
        page,
        { universe: 'andromeda' },
        {},
        { ...view, bodies: [] },
        'Andromeda',
      ),
    ).toMatchObject({
      route: { available: true, body: null },
      canonicalizing: false,
    })
  expect(
    resolveShellRoute(
      'galaxy',
      { universe: 'andromeda', coordinates: '1:2:3' },
      {},
      view,
      'Andromeda',
    ).canonicalizing,
  ).toBe(false)
})
it('retains invitation and message queries while stripping only legacy body context', () => {
  const search = {
    body: id(6),
    player: id(7),
    alliance: id(8),
    welcome: '1',
    invitation: id(9),
  }
  expect(withoutBodySearch(search)).toEqual({
    player: id(7),
    alliance: id(8),
    welcome: '1',
    invitation: id(9),
  })
  expect(search.body).toBe(id(6))
  expect(
    resolveShellRoute(
      'alliance',
      { universe: 'andromeda', body: id(5) },
      search,
      view,
      'Andromeda',
    ),
  ).toMatchObject({ canonicalPage: 'alliance-discover', canonicalizing: true })
  expect(
    resolveShellRoute(
      'alliance',
      {
        universe: 'andromeda',
        body: id(5),
        item: 'settings',
        section: 'identity',
      },
      {},
      view,
      'Andromeda',
    ),
  ).toMatchObject({
    route: { available: true, item: 'settings/identity' },
    canonicalizing: false,
  })
})
