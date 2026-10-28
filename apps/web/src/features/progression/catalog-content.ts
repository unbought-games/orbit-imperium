import { resolveCatalogArt } from '../../ui/artwork'
import type { components } from '../../contracts'
import type { CatalogArt } from '../../ui/image-catalog'
import { resourceBuildings } from './resource-buildings'
type Key = components['schemas']['CatalogKey3']
export type CatalogContent = {
  id: string
  art: CatalogArt
  description: string
}
const content: Record<string, string> = {
  RoboticsFactory: 'Robotic workers accelerate construction on this planet.',
  Shipyard:
    'Builds ships and defensive structures. Higher levels reduce manufacturing time.',
  ResearchLab:
    'Hosts research projects and unlocks new technologies. Laboratory construction and research cannot overlap.',
  EnergyTechnology:
    'Improves Fusion Reactor energy output and unlocks more advanced systems.',
  ComputerTechnology:
    'Improves fleet coordination and increases the number of fleet missions you can operate.',
  EspionageTechnology:
    'Improves intelligence gathering and the information available in espionage reports.',
  CombustionDrive:
    'Provides propulsion for early spacecraft. Higher levels improve the speed of ships using this drive.',
  ImpulseDrive:
    'Increases the base speed of ships using impulse propulsion by 20% per level. Small Cargos switch to impulse propulsion at level 5, with higher base speed and fuel consumption.',
  Astrophysics:
    'Increases colony capacity: level 1 allows one colony, then each odd level adds another. Positions 4–12 unlock at level 1, 3 and 13 at level 4, 2 and 14 at level 6, and 1 and 15 at level 8. Colonization requires this universe’s enabled Colony Ship and mission. Expeditions are unavailable.',
  ColonyShip:
    'Establishes a planet at an eligible empty position. Requires Shipyard 4 and Impulse Drive 3. Success consumes one ship and deposits cargo; escorts and extra Colony Ships return. Uses impulse propulsion with 7,500 cargo capacity shared with mission fuel.',
  SmallCargo:
    'Transports resources between planets. Cargo capacity is shared by resources and mission fuel.',
  LargeCargo:
    'A bulk transport powered by combustion engines for moving large resource shipments between planets. Cargo capacity is shared by resources and mission fuel.',
  LightFighter: 'A small combat ship for attacking and defending planets.',
  HeavyFighter:
    'An impulse-powered combat ship with heavier armour and stronger weapons than the Light Fighter. Cargo capacity is shared by resources and mission fuel.',
  Cruiser:
    'A fast impulse-powered combat ship with rapid fire against Light Fighters, Rocket Launchers and Espionage Probes. Cargo capacity is shared by resources and mission fuel.',
  Bomber:
    'An impulse-powered siege ship with rapid fire against Rocket Launchers, Light Lasers, Heavy Lasers, Ion Cannons, Espionage Probes and Solar Satellites. Cargo capacity is shared by resources and mission fuel. Uses Impulse Drive until the Hyperspace Drive level 8 upgrade in the standard rules; see technical statistics for this universe’s propulsion profiles.',
  Destroyer:
    'A heavy combat ship powered by Hyperspace Drive, with rapid fire against Light Lasers, Espionage Probes and Solar Satellites. Requires Shipyard 9, Hyperspace Drive 6 and Hyperspace Technology 5 in the standard rules. Cargo capacity is shared by resources and mission fuel.',
  Recycler: 'Collects metal and crystal from debris fields.',
  EspionageProbe:
    'Gathers intelligence about another planet on an espionage mission.',
  RocketLauncher:
    'A stationary missile battery that defends this planet against attacking fleets.',
  LightLaser:
    'A stationary laser battery that defends this planet against attacking fleets. Requires Shipyard 2, Energy Technology 1 and Laser Technology 3.',
  HeavyLaser:
    'A stationary heavy laser battery that defends this planet against attacking fleets. Requires Shipyard 4, Energy Technology 3 and Laser Technology 6.',
  IonCannon:
    'A stationary cannon with strong shields that defends this planet against attacking fleets. Requires Shipyard 4 and Ion Technology 4.',
  GaussCannon:
    'A stationary electromagnetic cannon with powerful attacks against enemy fleets. Requires Shipyard 6, Energy Technology 6, Weapons Technology 3 and Shielding Technology 1.',
  PlasmaTurret:
    'A stationary plasma turret with powerful attacks against enemy fleets. Requires Shipyard 8 and Plasma Technology 7. Plasma research unlocks construction; Weapons, Shielding and Armour Technology improve combat stats.',
  SmallShieldDome:
    'A stationary dome whose shield protects itself, not other units. Only one small shield dome can be stationed or queued here; a large shield dome can coexist with it.',
  LargeShieldDome:
    'A stationary dome with five times the base shield strength of the Small Shield Dome. Its shield protects itself, not other units. Requires Shipyard 6 and Shielding Technology 6. Only one large shield dome can be stationed or queued here; a small shield dome can coexist with it.',
  LaserTechnology:
    'Unlocks concentrated energy weapons, including Light Lasers at level 3 and Heavy Lasers at level 6. Requires Research Lab 1 and Energy Technology 2. Weapon damage is improved by Weapons Technology.',
  IonTechnology:
    'Opens the way to Cruisers at level 2 and Ion Cannons at level 4. Level 5 is required for Plasma Technology. Ion research does not improve combat stats or reduce demolition costs.',
  PlasmaTechnology:
    'Requires Research Lab 4, Energy Technology 8, Laser Technology 10 and Ion Technology 5. Unlocks Plasma Turrets at level 7 and Bombers at level 5 with Shipyard 8 in the standard rules. Bombers also require Impulse Drive 6. Provides no per-level production or combat bonuses.',
  HyperspaceDrive:
    'Powers Destroyers, which unlock at level 6 with Shipyard 9 and Hyperspace Technology 5. At level 8, Bombers switch to a 5,000 base speed with a 30% speed bonus per completed Hyperspace Drive level in the standard rules. The bonus adds to base speed and replaces Impulse propulsion. Base fuel consumption remains 1,000 deuterium.',
  HyperspaceTechnology:
    'Unlocks Hyperspace Drive at level 3 in the standard rules. Provides no per-level cargo, speed, combat or production bonuses. Unlocks Destroyers at level 5 with Shipyard 9 and Hyperspace Drive 6.',
  ArmourTechnology:
    'Improves the structural resilience of ships and defensive units.',
  WeaponsTechnology: 'Improves weapon performance in combat.',
  ShieldingTechnology: 'Improves the shields of ships and defensive units.',
}
export function catalogContent(key: Key): CatalogContent {
  const resource =
    key.kind === 'Building'
      ? resourceBuildings.find((x) => x.id === key.id)
      : undefined
  if (resource) return resource
  const entry = content[key.id]
  return {
    id: key.id,
    art: resolveCatalogArt(key),
    description:
      entry ??
      'This technology is part of the universe catalog. Availability and prerequisites are determined by this universe’s ruleset.',
  }
}
export const facilityIds = [
  'RoboticsFactory',
  'Shipyard',
  'ResearchLab',
  'NaniteFactory',
  'Terraformer',
  'MissileSilo',
  'AllianceDepot',
  'LunarBase',
  'SensorPhalanx',
  'JumpGate',
]
export function catalogGroup(key: Key) {
  if (key.kind === 'Building') return 'Facility buildings'
  if (key.kind === 'Defense') return 'Defensive structures'
  if (key.kind === 'Ship')
    return [
      'SmallCargo',
      'LargeCargo',
      'Recycler',
      'EspionageProbe',
      'ColonyShip',
      'SolarSatellite',
    ].includes(key.id)
      ? 'Civil ships'
      : 'Combat ships'
  if (key.kind === 'Research') {
    if (key.id.endsWith('Drive')) return 'Drive research'
    if (
      ['WeaponsTechnology', 'ShieldingTechnology', 'ArmourTechnology'].includes(
        key.id,
      )
    )
      return 'Combat research'
    if (
      [
        'ComputerTechnology',
        'EspionageTechnology',
        'Astrophysics',
        'IntergalacticResearchNetwork',
        'GravitonTechnology',
      ].includes(key.id)
    )
      return 'Advanced research'
    return 'Basic research'
  }
  return 'Other technology'
}
