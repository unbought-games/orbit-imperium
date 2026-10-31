import { expect, it } from 'vitest'
import { reportFleetSummary } from './report-fleet-summary'

it('keeps the ship type for a single-type fleet and ignores zero entries', () => {
  expect(
    reportFleetSummary([
      { ship_type: 'EspionageProbe', count: '1' },
      { ship_type: 'SmallCargo', count: '0' },
    ]),
  ).toBe('1 Espionage Probe')
  expect(
    reportFleetSummary([{ ship_type: 'Recycler', count: '1250000' }]),
  ).toBe('1.2M Recycler')
})

it('summarizes mixed fleets regardless of size', () => {
  expect(
    reportFleetSummary([
      { ship_type: 'SmallCargo', count: '3' },
      { ship_type: 'Cruiser', count: '2' },
    ]),
  ).toBe('5 ships')
  expect(
    reportFleetSummary([
      { ship_type: 'LightFighter', count: '25000000' },
      { ship_type: 'Cruiser', count: '535000' },
    ]),
  ).toBe('25.5M ships')
})

it.each([
  ['999', '999'],
  ['1000', '1K'],
  ['1099', '1K'],
  ['1100', '1.1K'],
  ['999999', '999.9K'],
  ['1000000', '1M'],
  ['1000000000', '1B'],
  ['1000000000000', '1T'],
  ['9007199254740999', '9007.1T'],
])('keeps compact counts accurate at %s', (count, expected) => {
  expect(reportFleetSummary([{ ship_type: 'SmallCargo', count }])).toBe(
    `${expected} Small Cargo`,
  )
})

it('handles empty fleets', () => {
  expect(reportFleetSummary([])).toBe('No ships')
  expect(reportFleetSummary([{ ship_type: 'SmallCargo', count: '0' }])).toBe(
    'No ships',
  )
})
