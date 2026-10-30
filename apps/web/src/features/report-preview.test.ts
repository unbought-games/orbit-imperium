import { expect, it } from 'vitest'
import { reportPreview, reportAge, reportListIdentity } from './report-preview'

it('shows the return location, exact ship manifest and whether cargo came home', () => {
  expect(
    reportPreview({
      kind: 'Returned',
      origin_coordinates: { galaxy: 1, system: 1, position: 5 },
      destination_coordinates: { galaxy: 1, system: 1, position: 3 },
      ships: [{ ship_type: 'EspionageProbe', count: '1' }],
      cargo: { metal: '0', crystal: '0', deuterium: '0' },
    }),
  ).toEqual({
    coordinates: { galaxy: 1, system: 1, position: 5 },
    location: '[1:1:5]',
    facts: ['1 Espionage Probe', 'No cargo'],
  })
})
it('distinguishes hidden espionage facts from known zero resources and empty defenses', () => {
  expect(
    reportPreview({
      kind: 'Espionage',
      resources: {
        visibility: 'Known',
        value: {
          metal: '0',
          crystal: '9007199254740993123',
          deuterium: '1000000',
        },
      },
      fleet: { visibility: 'Unknown' },
      defenses: { visibility: 'Known', value: [] },
    }).facts,
  ).toEqual([
    {
      resources: {
        metal: '0',
        crystal: '9007199254740993123',
        deuterium: '1000000',
      },
    },
    'Fleet: unknown',
    'Defenses: 0',
  ])
  expect(
    reportPreview({
      kind: 'Espionage',
      resources: { visibility: 'Unknown' },
      fleet: {
        visibility: 'Known',
        value: [
          {
            item: { kind: 'Ship', id: 'EspionageProbe' },
            count: '9007199254740993',
          },
          { item: { kind: 'Ship', id: 'SmallCargo' }, count: '2' },
        ],
      },
      defenses: { visibility: 'Unknown' },
    }).facts,
  ).toEqual([
    'Resources unknown',
    'Fleet: 9,007,199,254,740,995',
    'Defenses: unknown',
  ])
})
it('gives a neutral battle outcome and observed loot without inventing missing historical facts', () => {
  expect(
    reportPreview({
      kind: 'Combat',
      target: { galaxy: 2, system: 3, position: 4 },
      outcome: 'DefenderVictory',
      loot: { metal: '0', crystal: '0', deuterium: '0' },
    }),
  ).toEqual({
    coordinates: { galaxy: 2, system: 3, position: 4 },
    location: '[2:3:4]',
    facts: [],
  })
  expect(reportPreview(undefined)).toEqual({ location: '', facts: [] })
  expect(reportPreview({ kind: 'Returned' })).toEqual({
    location: '',
    facts: [],
  })
})

it('keeps list ages compact and handles clock skew', () => {
  expect(reportAge(1000, 900)).toBe('Just now')
  expect(reportAge(1000, 60000)).toBe('Just now')
  expect(reportAge(1000, 135000)).toBe('2m ago')
})

it('uses historical body names and kinds consistently in combat and espionage previews', () => {
  const at = { galaxy: 2, system: 3, position: 4 }
  for (const kind of ['Planet', 'Moon'] as const) {
    for (const name of ['Nova Roma', null, undefined, ' ']) {
      const expected = name?.trim()
        ? kind === 'Moon'
          ? 'Nova Roma (Moon)'
          : 'Nova Roma'
        : kind
      expect(
        reportPreview({
          kind: 'Combat',
          target: at,
          target_name: name,
          target_kind: kind,
        }).location,
      ).toBe(`${expected} · [2:3:4]`)
      expect(
        reportPreview({
          kind: 'Espionage',
          target: { body: 'body', owner: 'owner', name, kind, coordinates: at },
        }).location,
      ).toBe(`${expected} · [2:3:4]`)
    }
  }
  expect(reportPreview({ kind: 'ContactLost', target: at }).location).toBe(
    '[2:3:4]',
  )
})

it('retains moon intent for both espionage and combat coordinate actions', () => {
  const at = { galaxy: 1, system: 2, position: 3 }
  expect(
    reportPreview({
      kind: 'Espionage',
      target: { body: 'moon', owner: 'other', kind: 'Moon', coordinates: at },
    }),
  ).toMatchObject({ coordinates: at, targetKind: 'moon' })
  expect(
    reportPreview({ kind: 'Combat', target: at, target_kind: 'Moon' }),
  ).toMatchObject({ coordinates: at, targetKind: 'moon' })
  expect(
    reportPreview({
      kind: 'Espionage',
      target: {
        body: 'planet',
        owner: 'other',
        kind: 'Planet',
        coordinates: at,
      },
    }).targetKind,
  ).toBeUndefined()
})

it('shows only known target identities and historical planet names', () => {
  const names = { enemy: 'Renamed commander', viewer: 'You', ally: 'Ally' }
  expect(
    reportListIdentity(
      {
        kind: 'Espionage',
        target: {
          body: 'body',
          owner: 'enemy',
          name: 'Old colony',
          kind: 'Planet',
          coordinates: { galaxy: 1, system: 2, position: 3 },
        },
      },
      'viewer',
      names,
    ),
  ).toBe('Renamed commander · Old colony')
  const combat = {
    kind: 'Combat',
    target_name: 'Old moon',
    target_kind: 'Moon',
    participants: [
      { owner: 'viewer', side: 'Attacker' },
      { owner: 'ally', side: 'Attacker' },
      { owner: 'enemy', side: 'Defender' },
      { owner: 'enemy', side: 'Defender' },
    ],
  } as const
  // Mutable fixture matches the generated array contract.
  const preview = { ...combat, participants: [...combat.participants] }
  expect(reportListIdentity(preview, 'viewer', names)).toBe(
    'Renamed commander · Old moon (Moon)',
  )
  expect(reportListIdentity(preview, 'enemy', names)).toBe(
    'You · Ally · Old moon (Moon)',
  )
  expect(reportListIdentity(preview, undefined, names)).toBe(
    'Renamed commander · Old moon (Moon)',
  )
  expect(reportListIdentity(preview, 'viewer', {})).toBe('Old moon (Moon)')
  expect(reportListIdentity({ kind: 'Combat' }, 'viewer', names)).toBe('')
  expect(
    reportListIdentity(
      { kind: 'ContactLost', target: { galaxy: 1, system: 2, position: 3 } },
      'viewer',
      names,
    ),
  ).toBe('')
  expect(reportListIdentity(undefined, 'viewer', names)).toBe('')
  expect(
    reportListIdentity(
      {
        kind: 'Espionage',
        target: {
          body: 'body',
          owner: 'missing',
          kind: 'Planet',
          name: ' ',
          coordinates: { galaxy: 1, system: 2, position: 3 },
        },
      },
      'viewer',
      names,
    ),
  ).toBe('Planet')
})

it('includes public bot identity in compact report labels', () => {
  expect(
    reportListIdentity(
      {
        kind: 'Espionage',
        target: {
          owner: 'bot',
          body: 'planet',
          kind: 'Planet',
          coordinates: { galaxy: 1, system: 1, position: 1 },
        },
      },
      undefined,
      { bot: 'Harvester' },
      undefined,
      { bot: { kind: 'bot' } },
    ),
  ).toContain('Harvester Bot')
})

it('shows only newly harvested resources, including a recorded zero harvest', () => {
  for (const metal of ['250000000', '0']) {
    const harvested = { metal, crystal: '0', deuterium: '0' }
    expect(
      reportPreview({
        kind: 'Harvested',
        destination_coordinates: { galaxy: 1, system: 2, position: 3 },
        harvested,
        cargo: {
          metal: '10713000000',
          crystal: '8238000000',
          deuterium: '2608000000',
        },
      }),
    ).toEqual({
      location: '[1:2:3]',
      coordinates: { galaxy: 1, system: 2, position: 3 },
      facts: [{ resources: harvested, label: 'Harvested' }],
    })
  }
})

it('does not misrepresent historical cargo as a harvested amount', () => {
  expect(
    reportPreview({
      kind: 'Harvested',
      cargo: { metal: '1000000', crystal: '2000000', deuterium: '3000000' },
    }).facts,
  ).toEqual(['Harvested amount unavailable'])
})

it('labels both delivery endpoints from historical names, with coordinate fallbacks', async () => {
  const { deliveryRoute } = await import('./report-preview')
  const origin = { galaxy: 1, system: 2, position: 3 },
    target = { galaxy: 2, system: 3, position: 4 }
  expect(
    deliveryRoute({
      kind: 'Delivered',
      origin,
      target,
      origin_name: 'Old name',
      target_name: 'Colony',
    }),
  ).toBe('Old name [1:2:3] → Colony [2:3:4]')
  expect(deliveryRoute({ kind: 'Delivered', origin, target })).toBe(
    '[1:2:3] → [2:3:4]',
  )
  expect(deliveryRoute({ kind: 'Delivered', target })).toBe(
    'Location unavailable → [2:3:4]',
  )
})
