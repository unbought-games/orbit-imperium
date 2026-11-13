import { expect, it } from 'vitest'
import { resolveDestination, validateBodySearch } from './routes'
import type { BoundView } from '../client-model/commands'
const view = {
  binding: { universe: 'u' },
  bodies: [{ id: 'a' }, { id: 'b' }],
  capabilities: [{ capability: 'Research', enabled: true }],
  fleets: [{ id: 'f' }],
  reports: [],
  protocol: 3,
} as unknown as Extract<BoundView, { protocol: 3 }>
it('rejects foreign universe and explicit inaccessible planets without a fallback', () => {
  for (const destination of [
    { universe: 'foreign', page: 'resources' as const, body: 'a' },
    { universe: 'u', page: 'resources' as const, body: 'foreign' },
    { universe: 'u', page: 'research' as const, body: 'removed' },
  ])
    expect(resolveDestination(destination, view)).toMatchObject({
      available: false,
      body: null,
    })
})
it('uses explicit planet context for research and rejects absent context', () => {
  expect(
    resolveDestination({ universe: 'u', page: 'research', body: 'b' }, view),
  ).toMatchObject({ page: 'research', body: 'b', available: true })
  expect(
    resolveDestination({ universe: 'u', page: 'research' }, view),
  ).toMatchObject({ body: null, available: false })
})
it('rejects unsupported capability routes and unknown destinations', () => {
  for (const page of ['fleets', 'shipyard', 'galaxy', null] as const)
    expect(
      resolveDestination({ universe: 'u', page, body: 'a' }, view).available,
    ).toBe(false)
})
it('requires an explicit planet for planet-specific screens', () => {
  expect(
    resolveDestination({ universe: 'u', page: 'resources' }, view).available,
  ).toBe(false)
})
it('validates retained-world fleet/report detail IDs', () => {
  const legacy = {
    ...view,
    protocol: 2,
    capabilities: [
      { capability: 'Transport', enabled: true, reason: 'Available' },
    ],
  } as unknown as BoundView
  expect(
    resolveDestination(
      { universe: 'u', page: 'fleets', body: 'a', item: 'f' },
      legacy,
    ).available,
  ).toBe(true)
  expect(
    resolveDestination(
      { universe: 'u', page: 'fleets', body: 'a', item: 'foreign' },
      legacy,
    ).available,
  ).toBe(false)
  expect(
    resolveDestination(
      { universe: 'u', page: 'reports', body: 'a', item: 'foreign' },
      legacy,
    ).available,
  ).toBe(false)
  expect(
    resolveDestination({ universe: 'u', page: 'facilities', body: 'a' }, legacy)
      .available,
  ).toBe(false)
})
it('revalidates access against each confirmed view', () => {
  const destination = { universe: 'u', page: 'research' as const, body: 'b' }
  expect(resolveDestination(destination, view).available).toBe(true)
  expect(
    resolveDestination(destination, { ...view, bodies: [view.bodies[0]] })
      .available,
  ).toBe(false)
  expect(
    resolveDestination(destination, { ...view, capabilities: [] }).available,
  ).toBe(false)
})
it('validates funding query parameters instead of silently discarding malformed context', () => {
  expect(validateBodySearch({ body: 'b' })).toEqual({ body: 'b' })
  expect(validateBodySearch({})).toEqual({})
  for (const body of ['', 123, null, ['a', 'b'], { id: 'b' }])
    expect(() => validateBodySearch({ body })).toThrow()
})

it('enables real fleet routes only for the world profile and keeps report detail authorization server-side', () => {
  const world = {
    ...view,
    protocol: 4,
    capabilities: [
      { capability: 'Galaxy', enabled: true, reason: 'Available' },
      { capability: 'Transport', enabled: true, reason: 'Available' },
    ],
    missions: { fleets: [{ id: 'active-fleet', leg: 'Returning' }] },
  } as unknown as Extract<BoundView, { protocol: 4 }>
  expect(
    resolveDestination({ universe: 'u', page: 'galaxy', body: 'b' }, world)
      .available,
  ).toBe(true)
  expect(
    resolveDestination(
      { universe: 'u', page: 'fleets', body: 'a', item: 'active-fleet' },
      world,
    ).available,
  ).toBe(true)
  expect(
    resolveDestination(
      { universe: 'u', page: 'fleets', body: 'a', item: 'foreign' },
      world,
    ).available,
  ).toBe(false)
  expect(
    resolveDestination(
      {
        universe: 'u',
        page: 'reports',
        body: 'a',
        item: '00000000-0000-4000-8000-000000000001',
      },
      world,
    ).available,
  ).toBe(true)
  expect(
    resolveDestination(
      { universe: 'u', page: 'reports', body: 'a', item: 'invalid' },
      world,
    ).available,
  ).toBe(false)
})

it('keeps resource settings accessible without production data but requires a supported, accessible planet', () => {
  const productionView = {
    ...view,
    progression: { production: [{ body: 'a' }] },
  } as typeof view
  const destination = {
    universe: 'u',
    page: 'resource-settings' as const,
    body: 'a',
  }
  expect(resolveDestination(destination, productionView)).toMatchObject({
    available: true,
    page: 'resource-settings',
    body: 'a',
  })
  expect(
    resolveDestination({ ...destination, body: 'b' }, productionView).available,
  ).toBe(true)
  for (const body of [undefined, 'foreign'])
    expect(
      resolveDestination({ ...destination, body }, productionView).available,
    ).toBe(false)
  expect(
    resolveDestination(destination, {
      ...productionView,
      progression: { ...productionView.progression, production: [] },
    }).available,
  ).toBe(true)
  expect(
    resolveDestination(destination, {
      ...productionView,
      protocol: 2,
    } as unknown as BoundView).available,
  ).toBe(false)
})

it('exposes alliance home, creation and discovery only in protocol four without requiring a planet', () => {
  const current = { ...view, protocol: 4, bodies: [] } as unknown as BoundView
  for (const page of [
    'alliance',
    'alliance-create',
    'alliance-discover',
  ] as const) {
    expect(resolveDestination({ universe: 'u', page }, view).available).toBe(
      false,
    )
    expect(resolveDestination({ universe: 'u', page }, current)).toMatchObject({
      available: true,
      page,
      body: null,
    })
  }
})

it('allows only currently visible outgoing missile mission details', () => {
  const world = {
    ...view,
    protocol: 4,
    capabilities: [
      { capability: 'Transport', enabled: true, reason: 'Available' },
    ],
    missions: { fleets: [] },
    missiles: [
      { id: 'outgoing', outgoing: true },
      { id: 'incoming', outgoing: false },
    ],
  } as unknown as Extract<BoundView, { protocol: 4 }>
  const destination = {
    universe: 'u',
    page: 'fleets' as const,
    body: 'a',
    item: 'outgoing',
  }
  expect(resolveDestination(destination, world).available).toBe(true)
  expect(
    resolveDestination({ ...destination, item: 'incoming' }, world).available,
  ).toBe(false)
  expect(
    resolveDestination(destination, { ...world, missiles: [] }).available,
  ).toBe(false)
})

it('opens the simulator for protocol-4 players without reports, capabilities or a planet', () => {
  const destination = { universe: 'u', page: 'combat-simulator' as const }
  expect(
    resolveDestination(destination, {
      ...view,
      protocol: 4,
      bodies: [],
      capabilities: [],
    } as unknown as BoundView),
  ).toMatchObject({ page: 'combat-simulator', available: true, body: null })
  expect(resolveDestination(destination, view).available).toBe(false)
})

it('keeps the menu available without a planet while rejecting foreign context', () => {
  const empty = { ...view, bodies: [] }
  expect(
    resolveDestination({ universe: 'u', page: 'menu' }, empty),
  ).toMatchObject({ page: 'menu', available: true, body: null })
  expect(
    resolveDestination({ universe: 'foreign', page: 'menu' }, empty).available,
  ).toBe(false)
  expect(
    resolveDestination({ universe: 'u', page: 'menu', body: 'removed' }, empty)
      .available,
  ).toBe(false)
})

it('keeps account pages available without planets and rejects explicit inaccessible context', () => {
  const current = { ...view, protocol: 4 } as unknown as BoundView
  for (const page of [
    'messages',
    'alliance',
    'alliance-create',
    'alliance-discover',
    'high-scores',
    'settings',
    'combat-simulator',
  ] as const) {
    expect(
      resolveDestination({ universe: 'u', page }, { ...current, bodies: [] }),
    ).toMatchObject({ available: true, body: null, page })
    expect(
      resolveDestination({ universe: 'u', page, body: 'foreign' }, current)
        .available,
    ).toBe(false)
    expect(
      resolveDestination({ universe: 'foreign', page, body: 'a' }, current)
        .available,
    ).toBe(false)
    expect(
      resolveDestination({ universe: 'u', page, body: 'b' }, current),
    ).toMatchObject({ available: true, body: 'b', page })
    if (page !== 'settings')
      expect(
        resolveDestination({ universe: 'u', page, body: 'b' }, view).available,
      ).toBe(false)
  }
})

it('accepts installed settings sections and rejects unknown sections or foreign bodies', () => {
  const current = { ...view, protocol: 4 } as unknown as BoundView
  for (const item of ['identity', 'game', 'support', 'session', 'deletion']) {
    expect(
      resolveDestination(
        { universe: 'u', page: 'settings', body: 'a', item },
        current,
      ),
    ).toMatchObject({ available: true, item, body: 'a' })
  }
  expect(
    resolveDestination(
      { universe: 'u', page: 'settings', body: 'a', item: 'unknown' },
      view,
    ).available,
  ).toBe(false)
  expect(
    resolveDestination(
      { universe: 'u', page: 'settings', body: 'foreign', item: 'identity' },
      view,
    ).available,
  ).toBe(false)
})

it.each([2, 3] as const)(
  'rejects direct empire deletion destinations on protocol %s',
  (protocol) => {
    expect(
      resolveDestination(
        { universe: 'u', page: 'settings', body: 'a', item: 'deletion' },
        { ...view, protocol } as BoundView,
      ),
    ).toMatchObject({
      available: false,
      reason: 'This settings section is unavailable in this universe.',
    })
  },
)
