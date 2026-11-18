import { expect, it } from 'vitest'
import {
  emptyCargoDraft,
  cargoInstruction,
  editDispatchCargo,
  materialCargoChanges,
  selectDispatchCargo,
  projectDispatchCargo,
  dispatchCargoCapacity,
  type CargoDraft,
} from './dispatch-cargo'

type Available = Parameters<typeof projectDispatchCargo>[1]
function allDispatchCargo(
  available: Available,
  maximum_payload: string,
  fuel: string,
  entered: string[] = [],
) {
  return projectDispatchCargo(
    selectDispatchCargo({ entered, groups: [] }, 'all'),
    available,
    { maximum_payload, fuel },
  )
}
function maxDispatchCargo(
  available: Available,
  maximum_payload: string,
  fuel: string,
  entered: string[],
  resource: 'metal' | 'crystal' | 'deuterium',
) {
  const draft: CargoDraft = {
    entered: ['0', '0', '0'].map((v, i) => entered[i] ?? v),
    groups: [],
  }
  return projectDispatchCargo(selectDispatchCargo(draft, resource), available, {
    maximum_payload,
    fuel,
  })
}

it('derives empty, loaded, full and excessive cargo space from server terms', () => {
  const terms = { capacity: '5000000000', maximum_payload: '4998500000' }
  expect(dispatchCargoCapacity(terms, ['', '0', '0'])).toEqual({
    capacity: 5000n,
    payload: 4998n,
    loaded: 0n,
    remaining: 4998n,
  })
  expect(dispatchCargoCapacity(terms, ['100', '200', '300'])?.remaining).toBe(
    4398n,
  )
  expect(dispatchCargoCapacity(terms, ['4998', '0', '0'])?.remaining).toBe(0n)
  expect(dispatchCargoCapacity(terms, ['4999', '0', '0'])?.remaining).toBe(-1n)
})

it('leaves unknown or invalid cargo space unknown without hiding valid capacity', () => {
  expect(dispatchCargoCapacity(undefined, ['42'])).toBeNull()
  for (const value of ['-1', '1.5', 'invalid']) {
    expect(
      dispatchCargoCapacity(
        { capacity: '5000000', maximum_payload: '4000000' },
        [value],
      ),
    ).toEqual({
      capacity: 5n,
      payload: 4n,
      loaded: null,
      remaining: null,
    })
  }
})

it('uses authoritative payload for fuel-only ships and preserves large exact counts', () => {
  expect(
    dispatchCargoCapacity({ capacity: '0', maximum_payload: '0' }, []),
  ).toEqual({
    capacity: 0n,
    payload: 0n,
    loaded: 0n,
    remaining: 0n,
  })
  expect(
    dispatchCargoCapacity(
      {
        capacity: '9007199254740993123456',
        maximum_payload: '9007199254740992000000',
      },
      ['9007199254740991'],
    )?.remaining,
  ).toBe(1n)
})

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

it('keeps a Max selection first when Add all follows, and a manual edit fixes only its resource', () => {
  const max = selectDispatchCargo(emptyCargoDraft(), 'deuterium')
  const all = selectDispatchCargo(max, 'all')
  const edited = editDispatchCargo(all, 0, '5')
  expect(cargoInstruction(edited)).toEqual({
    minimum: { metal: '5000000', crystal: '0', deuterium: '0' },
    groups: [['Deuterium'], ['Crystal']],
  })
  expect(
    projectDispatchCargo(edited, stocks, {
      maximum_payload: '25000000',
      fuel: '1000000',
    }),
  ).toEqual(['5', '10', '10'])
})
it('asks again at a 10% change in either direction per resource, including a newly available resource', () => {
  const before = { metal: '100000000', crystal: '0', deuterium: '10000000' }
  expect(
    materialCargoChanges(before, {
      metal: '109999999',
      crystal: '0',
      deuterium: '9000001',
    }),
  ).toEqual([])
  expect(
    materialCargoChanges(before, {
      metal: '110000000',
      crystal: '1000000',
      deuterium: '9000000',
    }),
  ).toEqual(['metal', 'crystal', 'deuterium'])
})

it('clicking Max again preserves a full shared load', () => {
  const all = selectDispatchCargo(emptyCargoDraft(), 'all')
  const terms = { maximum_payload: '9000000', fuel: '1000000' }
  expect(
    projectDispatchCargo(selectDispatchCargo(all, 'deuterium'), stocks, terms),
  ).toEqual(['3', '3', '3'])
})
