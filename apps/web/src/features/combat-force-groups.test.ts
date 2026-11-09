import { expect, it } from 'vitest'
import { combatForceGroups } from './combat-force-groups'
import { combatReportModel } from './combat-report-model'
it('groups each defender and round by recorded kind without changing counts or dropping unknown units', () => {
  const participant = {
    side: 'Defender',
    owner: 'player',
    origin: { Stationed: 'planet' },
    units: [
      { item: { kind: 'Defense', id: 'RocketLauncher' }, count: '6' },
      { item: { kind: 'Ship', id: 'SolarSatellite' }, count: '2' },
      { item: { id: 'Legacy' }, count: '1' },
    ],
  }
  const end = {
    ...participant,
    units: [{ ...participant.units[1], count: '1' }],
  }
  const model = combatReportModel({
    participants: [participant, { ...participant, owner: 'ally' }],
    survivors: [end],
    recovered: [
      { ...participant, units: [{ ...participant.units[0], count: '4' }] },
    ],
    rounds: [{ start: [participant], end: [end] }],
  })
  for (const force of [model.forces[0], model.rounds[0].forces[0]]) {
    const groups = combatForceGroups(force)
    expect(groups.map((group) => group.title)).toEqual([
      'Ships',
      'Defenses',
      'Other units',
    ])
    expect(groups[0].rows[0]).toMatchObject({
      name: 'Solar Satellite',
      start: 2n,
      finish: 1n,
      lost: 1n,
    })
    expect(groups[1].rows[0]).toMatchObject({ start: 6n, finish: 0n, lost: 6n })
    expect(groups.flatMap((group) => group.rows)).toHaveLength(3)
  }
  expect(combatForceGroups(model.forces[0])[1].rows[0].permanent).toBe(2n)
  expect(combatForceGroups(model.forces[1])[0].rows[0].finish).toBeNull()
  expect(combatForceGroups({ ...model.forces[0], side: 'Attacker' })).toEqual([
    { title: null, rows: model.forces[0].rows },
  ])
  expect(combatForceGroups({ ...model.forces[0], rows: [] })).toEqual([])
})
