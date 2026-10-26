import { expect, it } from 'vitest'
import { allDispatchCargo, maxDispatchCargo } from './dispatch-cargo'

it('loads available whole units and reserves the quoted fuel', () => {
  expect(
    allDispatchCargo(
      { metal: '10500000', crystal: '4000000', deuterium: '5200000' },
      '100000000',
      '1500000',
    ),
  ).toEqual(['10', '4', '3'])
})
it('shares limited capacity evenly and fills rounding gaps', () => {
  expect(
    allDispatchCargo(
      { metal: '6000000', crystal: '3000000', deuterium: '2000000' },
      '5000000',
      '1000000',
    ),
  ).toEqual(['2', '2', '1'])
})
it('handles empty stocks, fuel shortages, and sub-unit cargo space', () => {
  const available = { metal: '0', crystal: '0', deuterium: '1000000' }
  expect(allDispatchCargo(available, '10000000', '2000000')).toEqual([
    '0',
    '0',
    '0',
  ])
  expect(
    allDispatchCargo({ ...available, metal: '9000000' }, '999999', '0'),
  ).toEqual(['0', '0', '0'])
})
it('keeps large quantities exact and never loads more than stocks or capacity', () => {
  const available = {
    metal: '9007199254740993000000',
    crystal: '1000000',
    deuterium: '1000000',
  }
  expect(allDispatchCargo(available, '9007199254740993000002', '0')).toEqual([
    '9007199254740991',
    '1',
    '1',
  ])
})

const stocks = {
  metal: '100000000',
  crystal: '40000000',
  deuterium: '11000000',
}

it('maxes deuterium first, then shares the remaining space between metal and crystal', () => {
  const current = maxDispatchCargo(
    stocks,
    '50000000',
    '1000000',
    ['0', '0', '0'],
    'deuterium',
  )
  expect(current).toEqual(['0', '0', '10'])
  const filled = allDispatchCargo(stocks, '50000000', '1000000', current)
  expect(filled).toEqual(['20', '20', '10'])
  expect(allDispatchCargo(stocks, '50000000', '1000000', filled)).toEqual(
    filled,
  )
})

it('adds equal shares on top of existing amounts and redistributes stock shortages', () => {
  expect(
    allDispatchCargo(stocks, '50000000', '1000000', ['10', '0', '5']),
  ).toEqual(['25', '15', '10'])
  expect(
    allDispatchCargo(stocks, '149000000', '1000000', ['0', '0', '10']),
  ).toEqual(['99', '40', '10'])
})

it.each(['metal', 'crystal', 'deuterium'] as const)(
  'maxes only %s within remaining capacity',
  (resource) => {
    const index = ['metal', 'crystal', 'deuterium'].indexOf(resource)
    const current = ['2', '3', '4']
    const expected = [...current]
    expected[index] = String(9 + Number(current[index]))
    if (resource === 'deuterium') expected[index] = '10'
    expect(
      maxDispatchCargo(stocks, '18000000', '1000000', current, resource),
    ).toEqual(expected)
    expect(current).toEqual(['2', '3', '4'])
  },
)

it('does not displace other cargo when space is full and can replace an invalid selected amount', () => {
  expect(
    maxDispatchCargo(
      stocks,
      '5000000',
      '0',
      ['2', '3', 'invalid'],
      'deuterium',
    ),
  ).toEqual(['2', '3', '0'])
})

it('rejects invalid or excessive existing cargo instead of silently overwriting it', () => {
  expect(() =>
    allDispatchCargo(stocks, '50000000', '0', ['invalid', '0', '0']),
  ).toThrow('whole nonnegative')
  expect(() =>
    allDispatchCargo(stocks, '50000000', '1000000', ['0', '0', '11']),
  ).toThrow('available resources')
  expect(() =>
    allDispatchCargo(stocks, '50000000', '0', ['40', '20', '0']),
  ).toThrow('capacity')
  expect(() =>
    maxDispatchCargo(stocks, '50000000', '0', ['40', '20', '0'], 'deuterium'),
  ).toThrow('capacity')
})
