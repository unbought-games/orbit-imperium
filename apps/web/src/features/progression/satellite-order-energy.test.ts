import { expect, it } from 'vitest'
import {
  formatEnergyGain,
  satelliteOrderEnergy,
} from './satellite-order-energy'

it('adds the selected batch at the group setting without rounding each satellite', () => {
  expect(satelliteOrderEnergy('31000000', 50, '5', '2', '3')).toBe(46500000n)
  expect(formatEnergyGain(46500000n)).toBe('46.5')
  expect(satelliteOrderEnergy('31000000', 0, '5', '2', '3')).toBe(0n)
  expect(satelliteOrderEnergy('0', 100, '5', '2', '3')).toBe(0n)
})

it('floors aggregate micro-energy before and after the batch and preserves large amounts', () => {
  expect(satelliteOrderEnergy('11', 50, '2', '1', '1')).toBe(6n)
  expect(formatEnergyGain(9007199254740993n)).toBe('9,007,199,254.740993')
})
