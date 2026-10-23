import { expect, it } from 'vitest'
import type { BoundView } from '../client-model/commands'
import { bodyGroups } from './body-selection'
const bodies = [
  {
    id: 'moon',
    kind: 'Moon',
    coordinates: { galaxy: 1, system: 2, position: 3 },
  },
  {
    id: 'planet',
    kind: 'Planet',
    coordinates: { galaxy: 1, system: 2, position: 3 },
  },
  {
    id: 'remote',
    kind: 'Planet',
    coordinates: { galaxy: 1, system: 9, position: 7 },
  },
] as BoundView['bodies']
it('groups moons with the real planet at their coordinates without inventing parentage', () => {
  expect(
    bodyGroups(bodies, '').map((group) => group.entries.map((body) => body.id)),
  ).toEqual([['planet', 'moon'], ['remote']])
})
it('searches kind and coordinates while retaining the visible selected context', () => {
  expect(
    bodyGroups(bodies, 'moon', 'remote').flatMap((group) =>
      group.entries.map((body) => body.id),
    ),
  ).toEqual(['moon', 'remote'])
  expect(
    bodyGroups(bodies, '1:2:3').flatMap((group) => group.entries).length,
  ).toBe(2)
  expect(bodyGroups(bodies, 'missing')).toEqual([])
})
it('finds public planet names without losing kind or coordinate search', () => {
  const named = bodies.map((body) =>
    body.id === 'remote' ? { ...body, name: 'New Terra 🪐' } : body,
  )
  expect(
    bodyGroups(named, 'terra')
      .flatMap((group) => group.entries)
      .map((body) => body.id),
  ).toEqual(['remote'])
  expect(
    bodyGroups(named, 'planet').flatMap((group) => group.entries),
  ).toHaveLength(2)
  expect(
    bodyGroups(named, '1:9:7').flatMap((group) => group.entries)[0].name,
  ).toBe('New Terra 🪐')
})
