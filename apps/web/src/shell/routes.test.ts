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

it('requires production data for the selected planet to open resource settings', () => {
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
  for (const body of [undefined, 'b', 'foreign'])
    expect(
      resolveDestination({ ...destination, body }, productionView).available,
    ).toBe(false)
  expect(
    resolveDestination(destination, {
      ...productionView,
      progression: { ...productionView.progression, production: [] },
    }).available,
  ).toBe(false)
  expect(
    resolveDestination(destination, {
      ...productionView,
      protocol: 2,
    } as unknown as BoundView).available,
  ).toBe(false)
})

it('exposes alliances only in protocol four without requiring a planet', () => {
  expect(
    resolveDestination({ universe: 'u', page: 'alliance' }, view).available,
  ).toBe(false)
  const current = { ...view, protocol: 4, bodies: [] } as unknown as BoundView
  expect(
    resolveDestination({ universe: 'u', page: 'alliance' }, current),
  ).toMatchObject({ available: true, page: 'alliance', body: null })
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
