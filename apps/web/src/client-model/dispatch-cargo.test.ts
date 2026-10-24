import { expect, it } from 'vitest'
import { allDispatchCargo } from './dispatch-cargo'

it('loads available whole units and reserves the quoted fuel', () => {
  expect(
    allDispatchCargo(
      { metal: '10500000', crystal: '4000000', deuterium: '5200000' },
      '100000000',
      '1500000',
    ),
  ).toEqual(['10', '4', '3'])
})
it('shares limited capacity proportionally and fills rounding gaps', () => {
  expect(
    allDispatchCargo(
      { metal: '6000000', crystal: '3000000', deuterium: '2000000' },
      '5000000',
      '1000000',
    ),
  ).toEqual(['4', '1', '0'])
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
    '9007199254740992',
    '1',
    '0',
  ])
})
