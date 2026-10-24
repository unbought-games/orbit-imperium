import { describe, expect, it } from 'vitest'
import type { BoundView } from './commands'
import { rawResourceRates } from './production-rates'

const body = { id: 'planet' } as BoundView['bodies'][number]

describe.each([3, 4] as const)('protocol %i raw production', (protocol) => {
  it.each([
    ['Nonnegative', '40', '40'],
    ['Negative', '40', '-40'],
    ['Nonnegative', '0', '0'],
    ['Negative', '9007199254740993', '-9007199254740993'],
  ] as const)('decodes %s net deuterium %s exactly', (sign, magnitude, net) => {
    const view = {
      protocol,
      progression: {
        production: [
          {
            body: 'other',
            gross_per_hour: { metal: '1', crystal: '2', deuterium: '3' },
            net_deuterium_per_hour: { sign: 'Nonnegative', magnitude: '3' },
          },
          {
            body: 'planet',
            gross_per_hour: {
              metal: '9007199254740993',
              crystal: '60',
              deuterium: '70',
            },
            net_deuterium_per_hour: { sign, magnitude },
          },
        ],
      },
    } as BoundView
    const original = structuredClone(view)
    expect(rawResourceRates(view, body)).toEqual({
      metal: '9007199254740993',
      crystal: '60',
      deuterium: net,
    })
    expect(view).toEqual(original)
    expect(rawResourceRates(view, { ...body, id: 'missing' })).toBeNull()
  })

  it('returns no rate without production data for the body', () => {
    const view = {
      protocol,
      progression: { production: [] },
    } as unknown as BoundView
    expect(rawResourceRates(view, body)).toBeNull()
  })
})

it('reads legacy body production without requiring progression data', () => {
  const view = { protocol: 2 } as BoundView
  expect(
    rawResourceRates(view, {
      ...body,
      production: { metal: '50', crystal: '60', deuterium: '70' },
    }),
  ).toEqual({ metal: '50', crystal: '60', deuterium: '70' })
  expect(rawResourceRates(view, body)).toBeNull()
})
