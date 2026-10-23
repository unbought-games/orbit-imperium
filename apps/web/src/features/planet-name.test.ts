import { expect, it } from 'vitest'
import {
  planetNameError,
  trimmedPlanetName,
  pendingPlanetRename,
} from './planet-name'
import { bodyName } from '../ui/format'
import { commandBody } from '../client-model/game-projection'
import type { Attempt, Command } from '../client-model/commands'

it('matches server Unicode trimming, control rejection and scalar length limits', () => {
  for (const name of [
    'A',
    'New Terra',
    'Luna’s End — 世界 🪐',
    '🪐'.repeat(40),
  ]) {
    const raw = ` \u2003${name} `
    expect(planetNameError(raw)).toBe('')
    expect(trimmedPlanetName(raw)).toBe(name)
  }
  for (const name of [
    '',
    ' \u2003 ',
    'a\nb',
    '\tTerra',
    'Terra\r',
    'a\0b',
    'a\u007fb',
    'a\u0085b',
    '🪐'.repeat(41),
  ]) {
    expect(planetNameError(name)).not.toBe('')
  }
  expect(trimmedPlanetName('\ufeffTerra')).toBe('\ufeffTerra')
  expect(bodyName({ kind: 'Planet' })).toBe('Planet')
  expect(bodyName({ kind: 'Planet', name: '<Terra>' })).toBe('<Terra>')
})

it('pairs presence with the renamed planet and blocks repeat saves until reconciliation', () => {
  const command: Command = {
    type: 'World',
    action: { type: 'RenamePlanet', body: 'planet', name: 'Terra' },
  }
  expect(commandBody(command, null)).toBe('planet')
  const attempt = {
    envelope: { command },
    status: 'pending',
    reconciled: false,
  } as Attempt
  for (const status of [
    'submitting',
    'pending',
    'uncertain',
    'committed',
  ] as const) {
    expect(
      pendingPlanetRename([{ ...attempt, status }], 'planet'),
    ).toBeDefined()
  }
  expect(pendingPlanetRename([attempt], 'another')).toBeUndefined()
  expect(
    pendingPlanetRename([{ ...attempt, status: 'rejected' }], 'planet'),
  ).toBeUndefined()
  expect(
    pendingPlanetRename(
      [{ ...attempt, status: 'committed', reconciled: true }],
      'planet',
    ),
  ).toBeUndefined()
})
