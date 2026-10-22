import { expect, it } from 'vitest'
import { playerLabel } from './player-label'

it('uses current public names and falls back for missing or blank identities', () => {
  const id = '9516d363-0000-4000-8000-000000000001'
  expect(playerLabel(id, { [id]: 'Commander Vega' })).toBe('Commander Vega')
  expect(playerLabel(id)).toBe('Player 9516d363')
  expect(playerLabel(id, { [id]: '  ' })).toBe('Player 9516d363')
  expect(playerLabel(null)).toBe('Unknown player')
  expect(playerLabel('')).toBe('Unknown player')
  expect(playerLabel('toString', {})).toBe('Player toString')
})
