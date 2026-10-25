import { expect, it } from 'vitest'
import { reportPreview, reportAge } from './report-preview'

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
