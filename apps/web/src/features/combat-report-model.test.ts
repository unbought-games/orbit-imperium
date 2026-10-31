import { describe, expect, it } from 'vitest'
import { combatOutcome, combatReportModel } from './combat-report-model'
const ship = (count: string) => ({
  item: { kind: 'Ship', id: 'LightFighter' },
  count,
})
const defense = (count: string) => ({
  item: { kind: 'Defense', id: 'RocketLauncher' },
  count,
})
const attacker = {
  owner: 'attacker',
  side: 'Attacker',
  origin: { Fleet: 'fleet' },
  units: [ship('12')],
  technology: [3, 2, 1],
}
const defender = {
  owner: 'defender',
  side: 'Defender',
  origin: { Stationed: 'planet' },
  units: [defense('6')],
  technology: [1, 2, 3],
}
const survivors = [
  { ...defender, units: [] },
  { ...attacker, units: [ship('9')] },
]
const payload = {
  kind: 'Combat',
  outcome: 'AttackerVictory',
  participants: [attacker, defender],
  survivors,
  recovered: [{ ...defender, units: [defense('4')] }],
  rounds: [],
}

describe('combat outcome is relative to the viewer', () => {
  it.each([
    ['AttackerVictory', 'Attacker', 'Victory', 'win'],
    ['AttackerVictory', 'Defender', 'Defeat', 'loss'],
    ['DefenderVictory', 'Attacker', 'Defeat', 'loss'],
    ['DefenderVictory', 'Defender', 'Victory', 'win'],
    ['Draw', 'Attacker', 'Draw', 'neutral'],
    ['MutualDestruction', 'Defender', 'Defeat', 'loss'],
    ['AttackerVictory', undefined, 'Attacker victory', 'neutral'],
  ])('%s for %s', (outcome, side, title, tone) => {
    expect(combatOutcome(outcome, side)).toMatchObject({ title, tone })
  })
})
it('matches by identity, derives losses, and separates recovery from survival', () => {
  const model = combatReportModel(payload, 'defender')
  expect(model.title).toBe('Defeat')
  expect(model.forces[0]).toMatchObject({
    start: 12n,
    finish: 9n,
    lost: 3n,
    recovered: 0n,
    permanent: 3n,
  })
  expect(model.forces[1]).toMatchObject({
    name: 'You',
    start: 6n,
    finish: 0n,
    lost: 6n,
    recovered: 4n,
    permanent: 2n,
  })
})
it('keeps separate fleets owned by the same player separate', () => {
  const other = {
    ...attacker,
    origin: { Fleet: 'second' },
    units: [ship('9007199254740993')],
  }
  const model = combatReportModel(
    {
      ...payload,
      participants: [attacker, other],
      survivors: [
        { ...other, units: [ship('9007199254740991')] },
        ...survivors,
      ],
    },
    'attacker',
  )
  expect(model.forces[1]).toMatchObject({
    start: 9007199254740993n,
    finish: 9007199254740991n,
    lost: 2n,
  })
})
it('does not turn missing survivors or recovery into known zero', () => {
  const model = combatReportModel({
    ...payload,
    survivors: [],
    recovered: undefined,
  })
  expect(model.forces[0]).toMatchObject({
    finish: null,
    lost: null,
    recovered: null,
    permanent: null,
  })
})
it('attributes round fire by shooter identity, never infers it from casualties', () => {
  const fire = [
    { ...defender, shots: '1', hull_removed_ticks: '7000000' },
    { ...attacker, shots: '1', hull_removed_ticks: '3000000' },
  ]
  const model = combatReportModel({
    ...payload,
    rounds: [{ number: 1, start: [attacker, defender], end: survivors, fire }],
  })
  expect(model.rounds[0].legacy).toBe(false)
  expect(model.rounds[0].forces[0].fire?.hull_removed_ticks).toBe('3000000')
  expect(model.rounds[0].forces[1].fire?.hull_removed_ticks).toBe('7000000')
  const old = combatReportModel({
    ...payload,
    rounds: [
      {
        number: 1,
        start: [attacker, defender],
        end: survivors,
        shots: '2',
        hull_removed_ticks: '10000000',
      },
    ],
  })
  expect(old.rounds[0].legacy).toBe(true)
  expect(old.rounds[0].forces.every((f) => f.fire === undefined)).toBe(true)
})
it('omits loot and empty cargo loss from the defeated defender report', () => {
  const zero = { metal: '0', crystal: '0', deuterium: '0' }
  const model = combatReportModel(
    { ...payload, loot: zero, own_cargo_loss: zero },
    'defender',
  )
  expect(model.resources).toEqual([])
})

it('only displays nonzero loot for the victorious attacker', () => {
  const loot = { metal: '12000000', crystal: '0', deuterium: '0' }
  for (const [outcome, viewer, expected] of [
    ['AttackerVictory', 'attacker', true],
    ['AttackerVictory', 'defender', false],
    ['DefenderVictory', 'attacker', false],
    ['DefenderVictory', 'defender', false],
    ['Draw', 'attacker', false],
    ['MutualDestruction', 'attacker', false],
    ['AttackerVictory', undefined, false],
  ] as const) {
    expect(
      combatReportModel({ ...payload, outcome, loot }, viewer).resources.some(
        (group) => group.key === 'loot',
      ),
    ).toBe(expected)
  }
  expect(
    combatReportModel(
      { ...payload, loot: { metal: '0', crystal: '0', deuterium: '0' } },
      'attacker',
    ).resources.some((group) => group.key === 'loot'),
  ).toBe(false)
})

it.each(['0', '1', '60000000000', 'invalid'])(
  'only hides zero deuterium in debris, preserving loot and unknown observations (%s)',
  (deuterium) => {
    const resources = { metal: '1000000', crystal: '0', deuterium }
    const model = combatReportModel(
      { ...payload, debris: resources, loot: resources },
      'attacker',
    )
    expect(
      model.resources
        .find((group) => group.key === 'debris')
        ?.values.map((value) => value.resource),
    ).toEqual(
      deuterium === '0'
        ? ['metal', 'crystal']
        : ['metal', 'crystal', 'deuterium'],
    )
    expect(
      model.resources
        .find((group) => group.key === 'loot')
        ?.values.map((value) => value.resource),
    ).toEqual(['metal', 'crystal', 'deuterium'])
  },
)
