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
    'Advances energy technology and unlocks more advanced systems.',
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
  LightFighter: 'A small combat ship for attacking and defending planets.',
  HeavyFighter:
    'An impulse-powered combat ship with heavier armour and stronger weapons than the Light Fighter. Cargo capacity is shared by resources and mission fuel.',
  Recycler: 'Collects metal and crystal from debris fields.',
  EspionageProbe:
    'Gathers intelligence about another planet on an espionage mission.',
  RocketLauncher:
    'A stationary missile battery that defends this planet against attacking fleets.',
  SmallShieldDome:
    'A planetary shield that supports the defense of this planet. Only one small shield dome can be stationed or queued here.',
  LaserTechnology:
    'Develops concentrated energy weapons and unlocks advanced technology.',
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
