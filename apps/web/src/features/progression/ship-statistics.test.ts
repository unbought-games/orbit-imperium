import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { components } from '../../contracts'
import { ShipStatistics } from './ship-statistics'
import { formatCombatStat } from './ship-statistics-format'
const entry: components['schemas']['CatalogEntry3'] = {
  key: { kind: 'Ship', id: 'SmallCargo' },
  body_kinds: ['Planet'],
  enabled: true,
  mobile: true,
  requirements: [],
}
describe('ship statistics', () => {
  it('preserves fractional and large combat values', () => {
    expect(formatCombatStat('1000')).toBe('0.01')
    expect(formatCombatStat('500000')).toBe('5')
    expect(formatCombatStat('123456789012345678901')).toBe(
      '1,234,567,890,123,456.78901',
    )
  })
  it('handles older snapshots and ships with partial definitions without inventing numbers', () => {
    expect(
      renderToStaticMarkup(createElement(ShipStatistics, { entry })),
    ).toContain('Technical statistics are unavailable')
    const html = renderToStaticMarkup(
      createElement(ShipStatistics, {
        entry: {
          ...entry,
          ship_statistics: {
            propulsion: null,
            combat: {
              attack_ticks: '1000',
              shield_ticks: '1000',
              hull_ticks: '10000000',
              rapid_fire_against: [],
              rapid_fire_from: [],
            },
          },
        },
      }),
    )
    expect(html).toContain('0.01')
    expect(html).toContain('Propulsion statistics are unavailable')
    expect(html).not.toContain('Cargo capacity')
  })
  it('keeps non-ship details unchanged', () => {
    expect(
      renderToStaticMarkup(
        createElement(ShipStatistics, {
          entry: { ...entry, key: { kind: 'Research', id: 'CombustionDrive' } },
        }),
      ),
    ).toBe('')
  })
})
