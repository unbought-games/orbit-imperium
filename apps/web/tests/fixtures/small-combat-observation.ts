import type { components } from '../../src/contracts'
import { id } from '../../src/test-support/bootstrap'

// Fixed two-round example from the retained small combat journey.
const attacker = {
  owner: id(2),
  side: 'Attacker',
  origin: { Fleet: id(40) },
} as const
const defender = {
  owner: id(9),
  side: 'Defender',
  origin: { Stationed: id(41) },
} as const
const fighters = (count: string) =>
  ({ item: { kind: 'Ship', id: 'LightFighter' }, count }) as const
const cargo = (count: string) =>
  ({ item: { kind: 'Ship', id: 'SmallCargo' }, count }) as const
const rockets = (count: string) =>
  ({ item: { kind: 'Defense', id: 'RocketLauncher' }, count }) as const
const initial = [
  { ...attacker, units: [fighters('12'), cargo('2')] },
  { ...defender, units: [fighters('4'), rockets('6')] },
]
const middle = [
  { ...attacker, units: [fighters('10'), cargo('1')] },
  { ...defender, units: [fighters('2'), rockets('3')] },
]
const survivors = [
  { ...attacker, units: [fighters('9'), cargo('1')] },
  { ...defender, units: [] },
]
const losses = { ...attacker, units: [fighters('3'), cargo('1')] }
const at = Date.parse('2026-10-22T17:45:00Z')
const target = { galaxy: 1, system: 372, position: 10 }
const fire = (attack: string, attackerShots: string, defenderShots: string) => {
  const damage = {
    raw_attack_ticks: attack,
    shield_removed_ticks: '9000000',
    hull_removed_ticks: '38000000',
  }
  return [
    { ...attacker, ...damage, shots: attackerShots, explosions: '1' },
    { ...defender, ...damage, shots: defenderShots, explosions: '2' },
  ]
}

export const smallCombatObservation = {
  kind: 'Combat',
  at,
  target,
  target_name: 'Nova Roma',
  target_kind: 'Planet',
  mission: 'Attack',
  outcome: 'AttackerVictory',
  return_at: at + 5400000,
  participants: [
    {
      ...initial[0],
      technology: [3, 2, 3],
      location: {
        kind: 'Moon',
        name: 'Luna Outpost',
        coordinates: { galaxy: 2, system: 24, position: 5 },
      },
    },
    {
      ...initial[1],
      technology: [3, 2, 3],
      location: { kind: 'Planet', name: 'Nova Roma', coordinates: target },
    },
  ],
  survivors,
  gross_losses: [losses, initial[1]],
  recovered: [{ ...defender, units: [rockets('4')] }],
  permanent_losses: [
    losses,
    { ...defender, units: [fighters('4'), rockets('2')] },
  ],
  debris: { metal: '5400000000', crystal: '1800000000', deuterium: '0' },
  loot: { metal: '4200000000', crystal: '2100000000', deuterium: '850000000' },
  own_cargo_loss: { metal: '0', crystal: '0', deuterium: '0' },
  rounds: [
    {
      number: 1,
      start: initial,
      end: middle,
      fire: fire('62000000', '14', '10'),
    },
    {
      number: 2,
      start: middle,
      end: survivors,
      fire: fire('54000000', '11', '5'),
    },
  ],
} satisfies components['schemas']['CombatPayload4']
