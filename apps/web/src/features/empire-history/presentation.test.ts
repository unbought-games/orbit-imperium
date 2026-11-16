import { expect, it } from 'vitest'
import type { HistoryEntry } from '../../adapters/empire-history'
import {
  eventTitle,
  eventSummary,
  eventCommander,
  eventDate,
} from './presentation'
const entry = (kind: HistoryEntry['kind'], facts: HistoryEntry['facts'] = {}) =>
  ({ kind, facts }) as HistoryEntry
it.each([
  ['Joined', {}, 'Joined the universe', 'Every empire starts somewhere.'],
  [
    'Colonized',
    {
      destination_coordinates: { galaxy: 1, system: 2, position: 3 },
      fields: 163,
    },
    'A new world',
    '[1:2:3] · 163 fields. A new beginning.',
  ],
  [
    'Abandoned',
    { name: 'Terra' },
    'Left a world behind',
    'Terra · The empire moved on.',
  ],
  [
    'AllianceJoined',
    { tag: 'STAR', name: 'Starlight' },
    'Joined an alliance',
    '[STAR] Starlight',
  ],
  ['AllianceLeft', { name: 'Starlight' }, 'Left an alliance', 'Starlight'],
  ['AllianceKicked', {}, 'Removed from an alliance', ''],
  ['AllianceDisbanded', {}, 'Alliance disbanded', ''],
  [
    'Battle',
    { outcome: 'AttackerVictory' },
    'A battle to remember',
    'Attacker victory',
  ],
  [
    'Battle',
    { outcome: 'DefenderVictory' },
    'A battle to remember',
    'Defender victory',
  ],
  ['Battle', { outcome: 'Draw' }, 'A battle to remember', 'Draw'],
  [
    'Battle',
    {},
    'A battle to remember',
    'The battle as this commander observed it.',
  ],
  [
    'CampaignResult',
    { outcome: 'Victory', beneficiary: true },
    'Shared in the victory',
    'The campaign ended in victory. Participation recorded.',
  ],
  [
    'CampaignResult',
    { outcome: 'Defeat' },
    'Campaign concluded',
    'The campaign ended in defeat. Participation recorded.',
  ],
] as const)(
  'presents %s from recorded facts (%j)',
  (kind, facts, title, summary) => {
    expect(eventTitle(entry(kind, facts))).toBe(title)
    expect(eventSummary(entry(kind, facts))).toBe(summary)
  },
)
it('keeps unknown location, date and commander honest and prefers the recorded commander', () => {
  expect(
    eventSummary(entry('Colonized', { coordinates: { galaxy: '1' } })),
  ).toBe('A colony joined the empire.')
  expect(eventDate(null)).toBe('Date not recorded')
  expect(
    eventCommander(
      entry('Battle', { commander_name: 'Then', names: { self: 'Later' } }),
      'self',
    ),
  ).toBe('Then')
  expect(
    eventCommander(entry('Battle', { names: { self: 'Recorded' } }), 'self'),
  ).toBe('Recorded')
  expect(eventCommander(entry('Joined', { name: 'Founder' }), 'self')).toBe(
    'Founder',
  )
  expect(
    eventCommander(entry('Battle', { name: 'Not a commander' }), 'self'),
  ).toBeNull()
})
