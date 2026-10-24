import { expect, it } from 'vitest'
import type { BoundView } from '../client-model/commands'
import { orderedBodies } from './body-selection'

function planet(id: string, position: number, createdAt?: number) {
  return {
    id,
    kind: 'Planet',
    coordinates: { galaxy: 1, system: 1, position },
    ...(createdAt === undefined ? {} : { colony: { created_at: createdAt } }),
  } as BoundView['bodies'][number]
}

it('puts the starting planet first, then colonies in acquisition order without mutating the view', () => {
  const bodies = [
    planet('later', 1, 300),
    planet('home', 15),
    planet('earlier', 8, 100),
  ]
  expect(orderedBodies(bodies).map((b) => b.id)).toEqual([
    'home',
    'earlier',
    'later',
  ])
  expect(bodies.map((b) => b.id)).toEqual(['later', 'home', 'earlier'])
})

it('keeps server order for legacy planets and equal creation times, including zero', () => {
  const bodies = [
    planet('b', 15, 0),
    planet('z', 10),
    planet('a', 1, 0),
    planet('y', 3),
  ]
  expect(orderedBodies(bodies).map((b) => b.id)).toEqual(['z', 'y', 'b', 'a'])
})

it('keeps moons next to their planet without inventing parents for orphan moons', () => {
  const home = planet('home', 15)
  const colony = planet('colony', 1, 100)
  const bodies = [
    { ...colony, id: 'colony-moon', kind: 'Moon' as const, colony: undefined },
    { ...planet('orphan', 8), kind: 'Moon' as const },
    colony,
    { ...home, id: 'home-moon', kind: 'Moon' as const },
    home,
  ]
  expect(orderedBodies(bodies).map((b) => b.id)).toEqual([
    'home',
    'home-moon',
    'colony',
    'colony-moon',
    'orphan',
  ])
  expect(orderedBodies([])).toEqual([])
})
