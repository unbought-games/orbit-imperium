import { expect, it } from 'vitest'
import type {
  SimulationInputs,
  SimulationResponse,
} from './combat-simulation-model'
import { simulationUnitOutcomes } from './simulation-unit-outcomes'

const fighter = { kind: 'Ship', id: 'LightFighter' } as const
const defense = { kind: 'Defense', id: 'RocketLauncher' } as const
const inputs: SimulationInputs = {
  attacker: { technology: [0, 0, 0], units: [{ item: fighter, count: 10 }] },
  defender: { technology: [0, 0, 0], units: [{ item: defense, count: 4 }] },
  attacking_allies: [
    { technology: [0, 0, 0], units: [{ item: fighter, count: 5 }] },
  ],
  defending_allies: [
    { technology: [0, 0, 0], units: [{ item: fighter, count: 3 }] },
  ],
}
const response: SimulationResponse = {
  binding: {
    universe: 'universe',
    player: 'player',
    account: 'account',
    epoch: 'epoch',
  },
  request_id: 'request',
  profile_hash: 'profile',
  loot_rules_enabled: false,
  samples: [2, 3].map((count) => ({
    outcome: 'Draw',
    rounds: 6,
    attacker: [{ item: fighter, count }],
    defender: count === 2 ? [{ item: defense, count: 1 }] : [],
    surviving_cargo_capacity: '0',
    debris: { metal: '0', crystal: '0', deuterium: '0' },
    estimated_loot: null,
  })),
}

it('averages survivors over all samples for the combined fleet', () => {
  expect(simulationUnitOutcomes(response, inputs, 'attacker')).toEqual({
    'Ship:LightFighter': { remaining: 2.5 },
  })
})

it('counts absent defenders as zero and reports remaining defenses before repairs', () => {
  expect(simulationUnitOutcomes(response, inputs, 'defender')).toEqual({
    'Defense:RocketLauncher': { remaining: 0.5 },
    'Ship:LightFighter': { remaining: 0 },
  })
})

it('leaves outcomes unavailable without a current result, valid inputs, or samples', () => {
  expect(simulationUnitOutcomes(null, inputs, 'attacker')).toBeNull()
  expect(simulationUnitOutcomes(response, null, 'attacker')).toBeNull()
  expect(
    simulationUnitOutcomes({ ...response, samples: [] }, inputs, 'attacker'),
  ).toBeNull()
})
