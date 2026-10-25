import { it, expect } from 'vitest'
import {
  coordinateFields,
  nextCoordinateSegment,
  pastedCoordinateInput,
} from './coordinate-input-model'
it('retains incomplete and invalid edits for range validation', () => {
  expect(coordinateFields('1:')).toEqual({
    galaxy: '1',
    system: '',
    position: '',
  })
  expect(coordinateFields('1:2:3:4').position).toBe('3:4')
})
it('normalizes paste formats without silently clamping values', () => {
  for (const value of [' [ 01 : 234 : 8 ] ', '1 234 8', '(1/234/8)'])
    expect(
      pastedCoordinateInput(value, 'https://game.test', 'Andromeda'),
    ).toEqual({ text: '1:234:8' })
  expect(
    pastedCoordinateInput('[1:500:16]', 'https://game.test', 'Andromeda'),
  ).toEqual({ text: '1:500:16' })
})
it('advances across existing separators or adds a missing one without auto-advancing digits', () => {
  expect(nextCoordinateSegment('1:234:8', 1)).toEqual({
    value: '1:234:8',
    caret: 2,
  })
  expect(nextCoordinateSegment('1:234', 5)).toEqual({
    value: '1:234:',
    caret: 6,
  })
  expect(nextCoordinateSegment('1:234:8', 7)).toEqual({
    value: '1:234:8',
    caret: 7,
  })
})
