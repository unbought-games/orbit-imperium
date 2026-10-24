import { expect, it } from 'vitest'
import { currentResourceRates } from './resource-rates'
import type { BoundView } from '../client-model/commands'

const planet = {
  id: 'planet',
  amounts: { metal: '10', crystal: '20', deuterium: '30' },
  capacity: { metal: '10', crystal: '100', deuterium: '30' },
} as BoundView['bodies'][number]
const view = {
  protocol: 4,
  progression: {
    production: [
      {
        body: 'planet',
        gross_per_hour: { metal: '50', crystal: '60', deuterium: '70' },
        net_deuterium_per_hour: { sign: 'Negative', magnitude: '40' },
      },
    ],
  },
} as BoundView

it('shows net fuel consumption and suppresses positive production at full storage', () => {
  expect(currentResourceRates(view, planet)).toEqual({
    metal: '0',
    crystal: '60',
    deuterium: '-40',
  })
})

it('does not fabricate rates while production data is unavailable', () => {
  expect(
    currentResourceRates(
      { ...view, progression: { production: [] } } as unknown as BoundView,
      planet,
    ),
  ).toBeNull()
})

it('uses the legacy body production and does not consume below zero', () => {
  expect(
    currentResourceRates(
      { protocol: 2 } as BoundView,
      {
        ...planet,
        production: { metal: '50', crystal: '60', deuterium: '70' },
      } as BoundView['bodies'][number],
    ),
  ).toEqual({ metal: '0', crystal: '60', deuterium: '0' })
  const empty = { ...planet, amounts: { ...planet.amounts, deuterium: '0' } }
  expect(currentResourceRates(view, empty)?.deuterium).toBe('0')
})

it.each([3, 4] as const)(
  'applies stock limits to displayed protocol %i rates without changing raw production',
  (protocol) => {
    const current = { ...view, protocol } as BoundView
    const original = structuredClone(current)
    for (const [amount, metal, deuterium] of [
      ['0', '50', '0'],
      ['5', '50', '-40'],
      ['10', '0', '-40'],
      ['20', '0', '-40'],
    ]) {
      expect(
        currentResourceRates(current, {
          ...planet,
          amounts: { metal: amount, crystal: amount, deuterium: amount },
          capacity: { metal: '10', crystal: '10', deuterium: '10' },
        }),
      ).toEqual({ metal, crystal: metal === '0' ? '0' : '60', deuterium })
    }
    expect(current).toEqual(original)
  },
)
