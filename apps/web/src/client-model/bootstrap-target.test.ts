import { expect, it } from 'vitest'
import { bootstrapFixture, id } from '../test-support/bootstrap'
import { bootstrapTarget, embeddedForDestination } from './bootstrap-target'

it('targets only game routes and keeps an already matching embedded universe', () => {
  const initial = bootstrapFixture(4)
  expect(bootstrapTarget('/u/andromeda/b/earth')).toBe('andromeda')
  expect(bootstrapTarget('/invite/inv_code')).toBeUndefined()
  expect(bootstrapTarget('/u/%0d%0aheader')).toBeUndefined()
  expect(embeddedForDestination(initial, '/u/andromeda')).toBe(initial)
})
it('does not reuse universe A bootstrap for an authorized universe B URL', () => {
  const initial = bootstrapFixture(4)
  if (initial.result.status !== 'authenticated') throw Error('fixture')
  initial.result.session.memberships.push({
    universe: id(92),
    player: id(93),
    universe_name: 'Orion Reach',
  })
  expect(embeddedForDestination(initial, '/u/orion-reach')).toBeNull()
  expect(embeddedForDestination(initial, `/u/${id(92)}`)).toBeNull()
})
