import { expect, it } from 'vitest'
import { colonizationStatus, positionAstrophysics } from './colonization'

it('derives every position threshold and rejects invalid coordinates', () => {
  expect(
    Array.from({ length: 15 }, (_, i) => positionAstrophysics(i + 1)),
  ).toEqual([8, 6, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, 6, 8])
  for (const value of [0, 16, 1.5, NaN])
    expect(positionAstrophysics(value)).toBeNull()
})
it('full capacity warns without blocking launch and excludes moons', () => {
  const view = {
    capabilities: [
      {
        capability: 'Colonize' as const,
        enabled: true as const,
        reason: 'Available' as const,
      },
    ],
    research: [{ research: 'Astrophysics' as const, level: 1 }],
    bodies: [{ kind: 'Planet' as const }, { kind: 'Moon' as const }],
  }
  expect(colonizationStatus(view, 8)).toMatchObject({
    count: 1,
    capacity: 2,
    reason: null,
  })
  view.bodies.push({ kind: 'Planet' })
  expect(colonizationStatus(view, 8)).toMatchObject({
    count: 2,
    capacity: 2,
    reason: null,
  })
  expect(colonizationStatus(view, 8).warning).toContain('Launch is allowed')
  expect(colonizationStatus(view, 3).reason).toContain('level 4')
  view.research[0].level = 3
  expect(colonizationStatus(view, 8)).toMatchObject({
    count: 2,
    capacity: 3,
    reason: null,
  })
  expect(colonizationStatus(null, 8).enabled).toBe(false)
})
