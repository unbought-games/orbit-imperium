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
