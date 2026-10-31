import type { components } from '../contracts'
import { resolveCatalogArt } from '../ui/artwork'

type Building = components['schemas']['BuildingId3']
type Research = components['schemas']['ResearchId3']

// Historical reports may contain IDs this client does not recognize. Keep their
// labels and levels, without requesting an invented artwork URL.
const kinds = {
  MetalMine: 'Building',
  CrystalMine: 'Building',
  DeuteriumSynthesizer: 'Building',
  SolarPlant: 'Building',
  FusionReactor: 'Building',
  MetalStorage: 'Building',
  CrystalStorage: 'Building',
  DeuteriumTank: 'Building',
  RoboticsFactory: 'Building',
  NaniteFactory: 'Building',
  Shipyard: 'Building',
  ResearchLab: 'Building',
  Terraformer: 'Building',
  MissileSilo: 'Building',
  AllianceDepot: 'Building',
  LunarBase: 'Building',
  SensorPhalanx: 'Building',
  JumpGate: 'Building',
  CombustionDrive: 'Research',
  ComputerTechnology: 'Research',
  EnergyTechnology: 'Research',
  EspionageTechnology: 'Research',
  WeaponsTechnology: 'Research',
  ShieldingTechnology: 'Research',
  ArmourTechnology: 'Research',
  LaserTechnology: 'Research',
  IonTechnology: 'Research',
  PlasmaTechnology: 'Research',
  HyperspaceTechnology: 'Research',
  ImpulseDrive: 'Research',
  HyperspaceDrive: 'Research',
  Astrophysics: 'Research',
  IntergalacticResearchNetwork: 'Research',
  GravitonTechnology: 'Research',
} satisfies Record<Building, 'Building'> & Record<Research, 'Research'>

export function reportLevelArt(name: string) {
  if (!Object.hasOwn(kinds, name)) return undefined
  const kind = kinds[name as keyof typeof kinds]
  return resolveCatalogArt(
    kind === 'Building'
      ? { kind, id: name as Building }
      : { kind, id: name as Research },
  )
}
