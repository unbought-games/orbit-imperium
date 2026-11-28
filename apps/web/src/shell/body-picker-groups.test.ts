import { expect, test } from 'vitest'
import { body } from '../test-support/empire'
import { groupPickerBodies } from './body-picker-groups'

test('only a bound planet ID nests a moon, even when other bodies share its coordinates', () => {
  const colony = { ...body, id: 'colony' }
  const moon = {
    ...body,
    id: 'themis',
    kind: 'Moon' as const,
    moon: { parent: colony.id, created_at: 1000 },
  }
  const legacy = { ...body, id: 'legacy', kind: 'Moon' as const }
  const orphan = {
    ...moon,
    id: 'orphan',
    moon: { ...moon.moon, parent: 'missing' },
  }

  expect(groupPickerBodies([moon, body, legacy, colony, orphan])).toEqual([
    { body, moons: [] },
    { body: legacy, moons: [] },
    { body: colony, moons: [moon] },
    { body: orphan, moons: [] },
  ])
})
