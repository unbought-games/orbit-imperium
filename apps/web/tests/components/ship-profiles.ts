import type { components } from '../../src/contracts'
import battlecruiser from '../../../../rules/content/battlecruiser.json'
import battleship from '../../../../rules/content/battleship.json'
import bomber from '../../../../rules/content/bomber.json'
import destroyer from '../../../../rules/content/destroyer.json'

type S = components['schemas']
const definitions = {
  Battlecruiser: battlecruiser,
  Battleship: battleship,
  Bomber: bomber,
  Destroyer: destroyer,
}
export type ProfileShip = keyof typeof definitions

export function shipProfile(id: ProfileShip): S['CatalogEntry3'] {
  const { ship, cost, combat, requirements } = definitions[id]
  return {
    key: { kind: 'Ship', id },
    enabled: true,
    mobile: true,
    body_kinds: ['Planet'],
    requirements: requirements as S['Requirement3'][],
    ship_statistics: {
      cost: [cost.metal, cost.crystal, cost.deuterium].map(String),
      propulsion: {
        drive: ship.drive as S['ResearchId3'],
        drive_coefficient: ship.drive_coefficient.map(String),
        base_speed: String(ship.base_speed),
        cargo_capacity: String(ship.capacity),
        fuel_consumption: String(ship.fuel),
        impulse_upgrade: null,
        ...(id === 'Bomber' && {
          hyperspace_upgrade: {
            minimum_level: 8,
            base_speed: '5000',
            fuel_consumption: '1000',
            drive_coefficient: ['3', '10'],
          },
        }),
      },
      combat: {
        attack_ticks: String(combat.attack_hundredths * 1000),
        shield_ticks: String(combat.shield_hundredths * 1000),
        hull_ticks: String((cost.metal + cost.crystal) * 10000),
        rapid_fire_against: [],
        rapid_fire_from: [],
      },
    },
  }
}
