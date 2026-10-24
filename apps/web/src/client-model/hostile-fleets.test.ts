import { expect, it } from 'vitest'
import { bootstrapFixture } from '../test-support/bootstrap'
import { hasIncomingHostileFleet } from './hostile-fleets'
import type { components } from '../contracts'

function fixture(protocol: 2 | 3 | 4 = 4) {
  const { result } = bootstrapFixture(protocol)
  if (result.status !== 'authenticated' || result.game.status !== 'ready')
    throw new Error('Expected ready game fixture')
  return result.game.snapshot.view
}

it.each([2, 3, 4] as const)(
  'has no warning for an empty protocol %s view',
  (protocol) => {
    expect(hasIncomingHostileFleet(fixture(protocol))).toBe(false)
  },
)

it.each([
  ['Attack', true],
  ['Espionage', true],
  ['Transport', false],
  ['Harvest', false],
  ['Deploy', false],
  ['Colonize', false],
] as const)('classifies incoming %s missions', (mission, hostile) => {
  const view = fixture()
  if (view.protocol !== 4) throw new Error('Expected protocol 4')
  view.missions.incoming = [
    {
      sender: 'enemy',
      origin: { galaxy: 1, system: 2, position: 3 },
      target: 'another-owned-world',
      mission,
      arrival_at: 0,
      ships: { visibility: 'Unknown' },
    },
  ]
  // Arrival estimates and ship visibility never override confirmed threats.
  expect(hasIncomingHostileFleet(view)).toBe(hostile)
  view.missions.incoming = []
  expect(hasIncomingHostileFleet(view)).toBe(false)
})

it.each(['Outbound', 'Returning'] as const)(
  'ignores owned %s attack and espionage fleets',
  (leg) => {
    const view = fixture()
    if (view.protocol !== 4) throw new Error('Expected protocol 4')
    view.missions.fleets = (['Attack', 'Espionage'] as const).map(
      (mission): components['schemas']['OwnMission4'] => ({
        id: mission,
        intent: {
          origin: 'home',
          destination: {
            type: 'Body',
            id: 'target',
            expected_kind: 'Planet',
            expected_owner: 'enemy',
          },
          mission,
          ships: [],
          speed_percent: 100,
          cargo: { metal: '0', crystal: '0', deuterium: '0' },
        },
        origin: { galaxy: 1, system: 2, position: 3 },
        destination: { galaxy: 1, system: 2, position: 4 },
        leg,
        ships: [],
        cargo: { metal: '0', crystal: '0', deuterium: '0' },
        due_at: 1000,
        launched_at: 0,
        duration_ms: 1000,
        paid_fuel: '0',
        can_recall: false,
      }),
    )
    expect(hasIncomingHostileFleet(view)).toBe(false)
  },
)
