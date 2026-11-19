import { body, binding, id, resources } from '../../src/test-support/empire'
import type { components } from '../../src/contracts'
type S = components['schemas']
export const now = 1793275200000
export function fleet(
  n: number,
  mission: S['Mission4'],
  due: number,
  leg: S['OwnMission4']['leg'] = 'Outbound',
): S['OwnMission4'] {
  return {
    id: id(n),
    intent: {
      origin: body.id,
      destination: {
        type: 'Body',
        id: id(99),
        expected_kind: 'Planet',
        expected_owner: id(90),
      },
      mission,
      ships: [
        { owner: binding.player, ship_type: 'LargeCargo', count: '2' },
        { owner: binding.player, ship_type: 'Cruiser', count: '11' },
      ],
      cargo: { metal: '1000000000', crystal: '2000000000', deuterium: '0' },
      speed_percent: 100,
    },
    origin: body.coordinates,
    destination: { galaxy: 1, system: 15, position: 7 },
    leg,
    ships: [
      { ship_type: 'LargeCargo', count: '2' },
      { ship_type: 'Cruiser', count: '11' },
    ],
    cargo: resources,
    due_at: now + due,
    launched_at: now - 180000,
    duration_ms: due + 180000,
    paid_fuel: '1000000',
    can_recall: leg === 'Outbound',
  }
}
