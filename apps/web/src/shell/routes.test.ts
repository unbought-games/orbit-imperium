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
it('uses the URL funding context for player-wide research and the default only when absent', () => {
  expect(
    resolveDestination({ universe: 'u', page: 'research', body: 'b' }, view),
  ).toMatchObject({ page: 'research', body: 'b', available: true })
  expect(
    resolveDestination({ universe: 'u', page: 'research' }, view),
  ).toMatchObject({ body: 'a', available: true })
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
    resolveDestination({ universe: 'u', page: 'fleets', item: 'f' }, legacy)
      .available,
  ).toBe(true)
  expect(
    resolveDestination(
      { universe: 'u', page: 'fleets', item: 'foreign' },
      legacy,
    ).available,
  ).toBe(false)
  expect(
    resolveDestination(
      { universe: 'u', page: 'reports', item: 'foreign' },
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
      { universe: 'u', page: 'fleets', item: 'active-fleet' },
      world,
    ).available,
  ).toBe(true)
  expect(
    resolveDestination(
      { universe: 'u', page: 'fleets', item: 'foreign' },
      world,
    ).available,
  ).toBe(false)
  expect(
    resolveDestination(
      {
        universe: 'u',
        page: 'reports',
        item: '00000000-0000-4000-8000-000000000001',
      },
      world,
    ).available,
  ).toBe(true)
  expect(
    resolveDestination(
      { universe: 'u', page: 'reports', item: 'invalid' },
      world,
    ).available,
  ).toBe(false)
})
