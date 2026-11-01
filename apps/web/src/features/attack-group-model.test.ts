import { describe, expect, it } from 'vitest'
import { attackGroupStatus, groupFlightSchedule } from './attack-group-model'
import type { components } from '../contracts'
const group: components['schemas']['AttackGroup4'] = {
  id: 'group',
  revision: 0,
  initiator: 'a',
  target: {
    type: 'Body',
    id: 'body',
    expected_owner: 'target',
    expected_kind: 'Planet',
  },
  coordinates: { galaxy: 1, system: 2, position: 3 },
  arrival_at: 2000,
  joining_open: true,
  can_join: true,
  members: [
    { owner: 'a', own_fleet: 'f', ships: [] },
    { owner: 'a', own_fleet: 'f2', ships: [] },
    { owner: 'b', own_fleet: null, ships: [] },
  ],
}
describe('attack group presentation', () => {
  it('derives distinct owners and closes joining at the shared deadline', () => {
    expect(attackGroupStatus(group, 1999)).toMatchObject({
      owners: 2,
      canJoin: true,
    })
    expect(attackGroupStatus(group, 2000)).toMatchObject({
      open: false,
      canJoin: false,
      label: 'Joining closed',
    })
  })
  it('waits for the shared arrival and keeps an independent return', () => {
    expect(groupFlightSchedule(500, 1000, 2000)).toEqual({
      arrival: 2000,
      returnAt: 2500,
      total: 1500,
    })
    expect(groupFlightSchedule(1300, 1000, 2000)).toEqual({
      arrival: 2300,
      returnAt: 3600,
      total: 2600,
    })
  })
})
