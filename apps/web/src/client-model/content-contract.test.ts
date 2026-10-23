import { expect, it } from 'vitest'
import schema from '../../../../contracts/openapi.json'
import observation from '../../../../contracts/fixtures/espionage-expanded.json'
import { bootstrapFixture, id } from '../test-support/bootstrap'
import { ContractDataError, validate } from './schema'

const schemas = schema.components.schemas
const known = (value: unknown) => ({ visibility: 'Known', value })
const levels = (ids: readonly string[]) =>
  Object.fromEntries(ids.map((key, i) => [key, i]))
const buildings = levels(schemas.BuildingId3.enum)
const research = levels(schemas.ResearchId3.enum)
const expanded = () => ({
  ...observation,
  buildings: known(buildings),
  research: known(research),
})

it('reads the actual engine observation after enabling Impulse Drive and Astrophysics', () => {
  expect(validate('EspionagePayload4', observation)).toEqual(observation)
  expect(observation.research.value).toMatchObject({
    Astrophysics: 0,
    ImpulseDrive: 0,
  })
})

it('reads every supported level key without requiring new keys in historical reports', () => {
  expect(validate('ReportPayload4', expanded())).toEqual(expanded())
  const legacy = {
    ...observation,
    research: known(
      Object.fromEntries(
        schemas.ResearchLevels3.required.map((key) => [key, 0]),
      ),
    ),
  }
  expect(validate('ReportPayload4', legacy)).toEqual(legacy)
  expect(
    validate('ReportPayload4', {
      ...legacy,
      research: { visibility: 'Unknown' },
      buildings: { visibility: 'Unknown' },
    }),
  ).toBeDefined()
})

it.each([3, 4] as const)(
  'accepts expanded content in protocol-%s overview and initial bootstrap',
  (protocol) => {
    const payload = bootstrapFixture(protocol)
    if (
      payload.result.status !== 'authenticated' ||
      payload.result.game.status !== 'ready'
    )
      throw Error('fixture')
    const view = {
      ...payload.result.game.snapshot.view,
      bodies: [
        {
          id: id(10),
          coordinates: { galaxy: 1, system: 1, position: 8 },
          kind: 'Planet',
          amounts: { metal: '0', crystal: '0', deuterium: '0' },
          capacity: {
            metal: '10000000000',
            crystal: '10000000000',
            deuterium: '10000000000',
          },
          levels: buildings,
          fields: 163,
          fields_used: 0,
          fields_reserved: 0,
          energy: { supply: '0', demand: '0', utilization: '1000000' },
          inventories: [],
        },
      ],
      research: schemas.ResearchId3.enum.map((research) => ({
        research,
        level: 0,
      })),
    }
    expect(validate('GameView', view)).toEqual(view)
    const bootstrap = {
      ...payload,
      result: {
        ...payload.result,
        game: {
          ...payload.result.game,
          snapshot: { ...payload.result.game.snapshot, view },
        },
      },
    }
    expect(validate('Bootstrap', bootstrap)).toEqual(bootstrap)
  },
)

for (const [kind, ids] of [
  ['Building', schemas.BuildingId3.enum],
  ['Research', schemas.ResearchId3.enum],
  ['Ship', schemas.ShipId3.enum],
  ['Defense', schemas.DefenseId3.enum],
  ['Missile', schemas.MissileId.enum],
] as const) {
  it.each(ids)(
    'accepts the supported ' + kind + ' %s in catalog and applicable consumers',
    (contentId) => {
      const key = { kind, id: contentId }
      expect(validate('CatalogKey3', key)).toEqual(key)
      if (kind === 'Building') {
        expect(
          validate('BuildingLevels3', {
            ...observation.buildings.value,
            [contentId]: 1,
          }),
        ).toBeDefined()
      } else if (kind === 'Research') {
        expect(
          validate('Research3', { research: contentId, level: 1 }),
        ).toBeDefined()
        expect(
          validate('ResearchLevels3', {
            ...observation.research.value,
            [contentId]: 1,
          }),
        ).toBeDefined()
      } else {
        expect(validate('Inventory3', { item: key, count: '1' })).toBeDefined()
        expect(
          validate('ReportPayload4', {
            ...observation,
            [kind === 'Ship' ? 'fleet' : 'defenses']: known([
              { item: key, count: '1' },
            ]),
          }),
        ).toBeDefined()
        if (kind === 'Ship') {
          expect(
            validate('FleetIntent4', {
              origin: id(1),
              destination: {
                type: 'Body',
                id: id(2),
                expected_kind: 'Planet',
                expected_owner: id(3),
              },
              mission: 'Transport',
              ships: [{ owner: id(4), ship_type: contentId, count: '1' }],
              cargo: { metal: '0', crystal: '0', deuterium: '0' },
              speed_percent: 100,
            }),
          ).toBeDefined()
        }
      }
    },
  )
}

it.each([-1, 1.5, 4294967296, '1', null])(
  'rejects malformed expanded levels: %s',
  (level) => {
    for (const [section, key] of [
      ['buildings', 'FusionReactor'],
      ['research', 'Astrophysics'],
    ]) {
      const payload = expanded()
      const value = section === 'buildings' ? buildings : research
      expect(() =>
        validate('ReportPayload4', {
          ...payload,
          [section]: known({ ...value, [key]: level }),
        }),
      ).toThrow(ContractDataError)
    }
  },
)

it('still rejects unsupported vocabulary, missing baseline levels and malformed observations', () => {
  for (const name of ['BuildingLevels3', 'ResearchLevels3']) {
    const base = name === 'BuildingLevels3' ? buildings : research
    expect(() => validate(name, { ...base, FutureContent: 0 })).toThrow(
      ContractDataError,
    )
    expect(() => validate(name, {})).toThrow(ContractDataError)
  }
  expect(() =>
    validate('ReportPayload4', { ...observation, private_data: true }),
  ).toThrow()
  expect(() => validate('ReportPayload4', { kind: 'FutureReport' })).toThrow()
  expect(() =>
    validate('ReportPayload4', {
      ...observation,
      research: { visibility: 'Unknown', value: research },
    }),
  ).toThrow()
})

it('applies numeric limits to their declared fields, including both historical and attributed combat fire', () => {
  const fire = {
    shots: '9223372036854775808',
    raw_attack_ticks: '9'.repeat(78),
    shield_removed_ticks: '0',
    hull_removed_ticks: '0',
    explosions: '0',
  }
  const legacy = { number: 1, start: [], end: [], ...fire }
  const attributed = {
    number: 1,
    start: [],
    end: [],
    fire: [
      { ...fire, owner: id(1), origin: { Fleet: id(2) }, side: 'Attacker' },
    ],
  }
  expect(validate('BattleRound4', legacy)).toEqual(legacy)
  expect(validate('BattleRound4', attributed)).toEqual(attributed)
  for (const invalid of ['-1', '01', '1e6', '9'.repeat(79)])
    expect(() =>
      validate('BattleRound4', { ...legacy, raw_attack_ticks: invalid }),
    ).toThrow()
  const names = { [id(1)]: '12345678901234567890' }
  expect(validate('PublicPlayerNames4', names)).toEqual(names)
  for (const amount of ['-1', '01', '9223372036854775808'])
    expect(() =>
      validate('Resources', { metal: amount, crystal: '0', deuterium: '0' }),
    ).toThrow()
})

it('preserves signed-64 limits on revisions without inspecting arbitrary strings', () => {
  for (const slot_revision of ['9223372036854775807', '9223372036854775808']) {
    const destination = {
      type: 'EmptyPosition',
      coordinates: { galaxy: 1, system: 1, position: 8 },
      slot_revision,
    }
    const cases = [
      ['MissionDestination4', destination],
      [
        'StreamEvent',
        { type: 'Invalidate', minimum_viewer_revision: slot_revision },
      ],
      ['SubmittedIntent', { submittedAt: 1000, baseRevision: slot_revision }],
    ] as const
    for (const [name, value] of cases) {
      if (slot_revision === '9223372036854775807')
        expect(validate(name, value)).toEqual(value)
      else expect(() => validate(name, value)).toThrow()
    }
  }
})
