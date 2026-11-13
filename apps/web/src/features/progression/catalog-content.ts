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
  LunarBase:
    'Pressurized habitats and engineering works carve a foothold into a barren moon. From this fragile beginning, an isolated rock can grow into a strategic outpost above the planet below.',
  SensorPhalanx:
    'A vast lunar sensor array watches the traffic between worlds. By revealing approaching and departing fleets, it turns distant movements into opportunities for a carefully timed strike.',
  JumpGate:
    'A gateway designed to bridge the gulf between distant moons. The promise of moving a fleet across that divide in an instant could transform scattered outposts into a united military presence.',
  MissileSilo:
    'Beneath reinforced launch doors waits a world’s missile arsenal. The silo anchors both the interceptors guarding your skies and the long-range weapons poised to threaten enemy strongholds.',
  AntiBallisticMissile:
    'A vigilant interceptor launched to meet an incoming missile before it reaches your defenses. Its brief flight can preserve the batteries standing between your world and an enemy fleet.',
  InterplanetaryMissile:
    'A long-range strike weapon sent ahead of the fleet to tear into enemy fortifications. Carefully chosen targets can turn a daunting siege into an opening for your warships.',
  AllianceDepot:
    'A supply station for the allied fleets standing watch over your world. Its fuel keeps distant friends on station, turning a temporary rally into a sustained defense.',
  Terraformer:
    'Immense engineering works reclaim terrain once thought beyond settlement. Where harsh landscapes constrained your ambitions, the terraformer opens new ground for a world that still has room to grow.',
  NaniteFactory:
    'Swarms of microscopic assemblers turn intricate designs into finished structures and machines. Buildings rise and ships take shape at extraordinary speed, giving an industrial world the pace of your ambitions.',
  RoboticsFactory:
    'Tireless construction machines raise the structures of a growing colony. Their coordinated labour turns bare ground into working infrastructure and brings ambitious building projects within reach.',
  Shipyard:
    'Orbital ambitions take physical form on the shipyard’s assembly lines. Here, raw materials become the vessels that cross the stars and the defensive batteries that guard their home.',
  ResearchLab:
    'An empire’s next great advantage begins as an unanswered question. Within these laboratories, scientists turn unfamiliar principles into the engines, weapons, and instruments that will shape its future.',
  EnergyTechnology:
    'The science of harnessing power on an ever greater scale. Advances in energy control push fusion engineering further and open the way to technologies once beyond your reach.',
  IntergalacticResearchNetwork:
    'A shared scientific frontier spanning your settled worlds. Linked laboratories bring their expertise to the same problem, turning isolated discoveries into a faster march toward the next breakthrough.',
  ComputerTechnology:
    'The coordination behind an empire in motion. Powerful computing systems keep far-flung operations in step, giving commanders the reach to direct more fleets across an increasingly busy galaxy.',
  EspionageTechnology:
    'The quiet contest to see more than your rivals reveal. Advanced sensors and intelligence analysis uncover the strength behind distant worlds, helping you distinguish a rich opportunity from a costly mistake.',
  CombustionDrive:
    'Reliable engines that carry an emerging empire beyond its homeworld. Refinements in combustion propulsion bring distant destinations closer for the workhorse vessels on which early expansion depends.',
  ImpulseDrive:
    'Powerful propulsion that gives a growing fleet a sharper sense of urgency. Impulse engines carry raiders toward fleeting opportunities and pioneers toward the worlds waiting beyond familiar space.',
  Astrophysics:
    'The study of distant worlds and the conditions that make settlement possible. Each discovery extends the horizon of your empire, bringing unfamiliar orbits and new homes within reach.',
  ColonyShip:
    'The beginning of a new home among the stars. A colony ship carries your empire beyond familiar skies, establishing a foothold from which new industries, fleets, and ambitions can grow.',
  SmallCargo:
    'A compact transport that keeps your empire moving. It supplies distant colonies, brings home the spoils of raids, and turns opportunities beyond your homeworld into progress.',
  LargeCargo:
    'The industrial lifeline of an expanding empire. These freighters connect mining worlds with hungry shipyards, carrying the material behind your next great construction project or gathering war fleet.',
  LightFighter:
    'A small warship whose strength lies in numbers. Massed squadrons fill the battlespace, overwhelm isolated opponents, and draw enemy fire away from the fleet’s heavy hitters.',
  HeavyFighter:
    'A rugged assault craft built to push through resistance that would shred lighter fighters. Heavier armour and hard-hitting weapons make it a formidable raider and a menace to exposed transports.',
  Cruiser:
    'A fast attack ship that tears through fighter screens and lightly defended outposts. Cruisers give a fleet the speed to seize an opening and the firepower to widen it.',
  Battleship:
    'The backbone of a battle fleet, combining heavy armour with punishing firepower. Squadrons of battleships bring the weight needed to challenge enemy warships and turn a raid into a major offensive.',
  Battlecruiser:
    'A dedicated fleet hunter, built to dismantle enemy warship formations. Battlecruisers excel at striking exposed cruisers and battleships, turning a rival’s moment of carelessness into a field of wreckage.',
  Bomber:
    'A siege ship built to batter planetary defenses. Its bombardment tears into entrenched weapon batteries, opening heavily guarded worlds to the fleet advancing behind it.',
  Destroyer:
    'A heavily armoured warship built for brutal engagements with powerful opponents. Its devastating weapons make it a formidable answer to enemy battlecruisers and a hammer against stubborn defenses.',
  Recycler:
    'A salvage vessel that turns shattered fleets into the beginnings of new ones. After the weapons fall silent, recyclers work the wreckage—and rivals race to claim what remains.',
  EspionageProbe:
    'A tiny reconnaissance craft sent ahead into uncertain territory. Its intelligence reveals tempting targets and dangerous opposition, giving commanders the knowledge to choose where the next battle begins.',
  RocketLauncher:
    'A rugged missile battery that gives a young colony its first teeth. Massed launchers fill the approach with fire, making an undefended prize into a world worth thinking twice about.',
  LightLaser:
    'A compact laser emplacement that brings precise, sustained fire to the defensive line. Deployed across a world’s approaches, these batteries make light raiding forces pay for every attack.',
  HeavyLaser:
    'A powerful laser battery built to cut down light assault craft. Its concentrated beams give a defensive line the punch to break fighter swarms before they overwhelm the heavier guns.',
  IonCannon:
    'A resilient weapon emplacement wrapped in formidable shielding. Ion cannons endure punishing exchanges with lighter attackers, giving a defensive line positions that are difficult to silence.',
  GaussCannon:
    'An electromagnetic cannon that hurls solid projectiles with devastating force. Its heavy strikes threaten substantial warships, bringing the firepower of a serious fortress to your planetary defenses.',
  PlasmaTurret:
    'A towering weapon that throws searing plasma into the heart of an attacking fleet. Its devastating strikes threaten even heavy warships, making a fortified world a dangerous prize.',
  SmallShieldDome:
    'A compact defensive bastion enclosed in a powerful energy barrier. Light weapons struggle to breach its shell, forcing raiders to bring more than a handful of lightly armed ships.',
  LargeShieldDome:
    'A massive shield installation built to endure a storm of hostile fire. Its immense energy barrier presents attackers with a stubborn bastion that only substantial firepower can hope to break.',
  LaserTechnology:
    'The mastery of light concentrated into a weapon. Precision emitters and focusing systems lay the foundation for laser batteries and the sophisticated armaments of advanced warships.',
  IonTechnology:
    'The science of charged particles harnessed for war. Ion research opens a new generation of combat engineering, from formidable planetary cannons to the weapons carried into battle by cruisers.',
  PlasmaTechnology:
    'The art of containing and directing intensely hot, energized matter. Plasma engineering brings devastating siege weapons and formidable defensive turrets from laboratory experiments into the struggle for distant worlds.',
  HyperspaceDrive:
    'An engine that reaches beyond ordinary space to carry heavy warships between the stars. Hyperspace propulsion gives a battle fleet the reach to make its presence felt across distant systems.',
  HyperspaceTechnology:
    'Research into the hidden dimensions beyond familiar space. Understanding this strange frontier lays the foundations for advanced propulsion and the engineering behind some of your most formidable warships.',
  ArmourTechnology:
    'Stronger materials and resilient structures help ships and defenses endure the violence of battle. Behind every surviving hull lies the engineering that held together when the enemy’s weapons struck home.',
  WeaponsTechnology:
    'The pursuit of a harder, more decisive strike. Advances in weapons engineering sharpen the firepower of your fleets and defenses, giving familiar designs new force on the battlefield.',
  ShieldingTechnology:
    'Energy barriers stand between hostile fire and the machinery beneath. Better shielding helps ships and defensive positions weather the opening blows and remain in the fight.',
  SolarSatellite:
    'Delicate collectors spread across orbit, catching starlight to power the industry below. Their glittering arrays let a growing world reach into space for the energy behind its ambitions.',
  Dreadnought:
    'A vast fortress of a warship, built to bring overwhelming force to a siege. Its arrival casts a shadow over even the most heavily defended world.',
  GravitonTechnology:
    'An investigation into gravity itself, reaching toward forces that shape stars and bend the paths of worlds. At this frontier, scientists imagine engineering on a scale that dwarfs familiar warships.',
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
  if (key.kind === 'Missile') return 'Missile warfare'
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
