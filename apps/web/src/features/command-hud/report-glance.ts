import {
  CornerDownLeft,
  Crosshair,
  Eclipse,
  Flag,
  Globe,
  MapPinOff,
  Moon,
  Radar,
  RadioOff,
  Recycle,
  Rocket,
  Shield,
  Swords,
  Telescope,
  Truck,
  Undo2,
  type LucideIcon,
} from 'lucide-react'
import type { components } from '../../contracts'
import { coordinates, label } from '../../ui/format'
import { formatWholeNumber } from '../../ui/whole-number'
import { combatOutcome, combatPerspective } from '../combat-report-model'

type S = components['schemas']
type Preview = S['ReportPreview4']
type Combat = Extract<Preview, { kind: 'Combat' }>
type Tone = 'primary' | 'win' | 'loss' | 'neutral' | 'spy'

export type OrbReportGlance = {
  title: string
  location: string
  icon: LucideIcon
  tone: Tone
  player?: string
  harvested?: S['Resources']
}

const ageUnits = [
  { minutes: 7 * 24 * 60, mark: 'w', name: 'week' },
  { minutes: 24 * 60, mark: 'd', name: 'day' },
  { minutes: 60, mark: 'h', name: 'hour' },
  { minutes: 1, mark: 'm', name: 'minute' },
] as const

export function orbReportAge(observedAt: number, now: number) {
  const minutes = Math.floor((now - observedAt) / 60_000)
  const unit = ageUnits.find((unit) => minutes >= unit.minutes)
  if (!unit) return { short: 'now', full: 'Just now' }
  const count = Math.floor(minutes / unit.minutes)
  return {
    short: `${count}${unit.mark}`,
    full: `${count} ${unit.name}${count === 1 ? '' : 's'} ago`,
  }
}

const at = (value?: S['Coordinates']) =>
  value ? coordinates({ coordinates: value }) : ''
const words = (...parts: Array<string | undefined>) =>
  parts.filter(Boolean).join(' ')
const facts = (...parts: string[]) => parts.filter(Boolean).join(' · ')
const withPrefix = (prefix: string, value: string) =>
  value ? `${prefix} ${value}` : ''

function endpoint(
  value?: S['Coordinates'],
  kind?: string | null,
  name?: string | null,
) {
  return words(
    name?.trim(),
    kind === 'Moon' ? (name?.trim() ? '(Moon)' : 'moon') : '',
    at(value),
  )
}

function glance(
  title: string,
  location: string,
  icon: LucideIcon,
  tone: Tone = 'primary',
): OrbReportGlance {
  return { title, location, icon, tone }
}

function outcomeLabel(outcome: string, side?: string) {
  const result = combatOutcome(outcome, side)
  const tone =
    result.tone === 'win' || result.tone === 'loss' ? result.tone : 'neutral'
  return {
    title:
      outcome === 'MutualDestruction' ? 'Mutual destruction' : result.title,
    tone,
  } as const
}

function combatGlance(p: Combat, viewer?: string) {
  if (p.moon_destruction) {
    const { moon_destroyed, fleet_lost } = p.moon_destruction
    return glance(
      facts(
        moon_destroyed ? 'Moon destroyed' : 'Moon survived',
        fleet_lost ? 'Attacking fleet lost' : 'Attacking fleet escaped',
      ),
      endpoint(p.target, p.target_kind, p.target_name),
      Eclipse,
      'neutral',
    )
  }
  const { side } = combatPerspective(p.participants, viewer)
  const role =
    side === 'Attacker' ? 'Attack' : side === 'Defender' ? 'Defense' : 'Battle'
  const preposition =
    side === 'Attacker' ? 'on' : side === 'Defender' ? 'of' : 'at'
  const name = p.target_name?.trim()
  const place = endpoint(name ? undefined : p.target, p.target_kind, name)
  const title = words(role, withPrefix(preposition, place))
  const outcome = p.outcome && outcomeLabel(p.outcome, side)
  return glance(
    facts(title, outcome?.title ?? ''),
    name ? at(p.target) : '',
    side === 'Defender' ? Shield : Swords,
    outcome?.tone ?? 'loss',
  )
}

function missileTitle(p: Extract<Preview, { kind: 'MissileImpact' }>) {
  if (p.outcome === 'NoTarget') return 'Missile target unavailable'
  if (p.penetrating && BigInt(p.penetrating) > 0n)
    return `${formatWholeNumber(p.penetrating)} missile${BigInt(p.penetrating) === 1n ? '' : 's'} penetrated`
  if (
    p.sent &&
    p.intercepted &&
    BigInt(p.sent) > 0n &&
    BigInt(p.sent) === BigInt(p.intercepted) &&
    (!p.penetrating || BigInt(p.penetrating) === 0n)
  )
    return 'All missiles intercepted'
  return 'Missile impact'
}

function lostFleet(p: Extract<Preview, { kind: 'ContactLost' }>) {
  const ships = p.own_lost_ships ?? []
  const count = ships.reduce((total, ship) => total + BigInt(ship.count), 0n)
  const noun = ships.every((ship) => ship.ship_type === 'EspionageProbe')
    ? 'probe'
    : 'ship'
  const lost =
    count > 0n
      ? `${formatWholeNumber(count)} ${noun}${count === 1n ? '' : 's'} lost`
      : ''
  return words(
    lost,
    withPrefix(lost ? 'at' : 'At', endpoint(p.target, p.target_kind)),
  )
}

const colonyReasons = {
  Occupied: 'Position occupied',
  PositionLocked: 'Position locked',
  ColonyCapacity: 'Planet limit reached',
} as const

/** Only describe facts saved for this report's recipient. */
export function orbReportGlance(
  header: Pick<S['ReportHeader4'], 'preview' | 'kind'>,
  viewer?: string,
): OrbReportGlance {
  const p = header.preview
  if (!p) {
    const kind = header.kind
    const title = kind === 'SiteEncounter' ? 'NPC encounter' : label(kind)
    const tone =
      kind === 'Espionage' || kind === 'SpyContact'
        ? 'spy'
        : kind === 'Combat' || kind === 'ContactLost'
          ? 'loss'
          : kind === 'Delivered'
            ? 'win'
            : 'primary'
    return glance(
      `${title} report`,
      '',
      kind === 'SpyContact' ? Crosshair : Telescope,
      tone,
    )
  }
  switch (p.kind) {
    case 'SpyContact': {
      const origin = endpoint(p.origin, p.origin_kind)
      const target =
        p.target_kind === 'Moon'
          ? 'your moon'
          : p.target_kind === 'Planet'
            ? 'your planet'
            : ''
      return {
        ...glance(
          origin ? `Probed from ${origin}` : 'Espionage contact',
          words(target, at(p.target)),
          Crosshair,
          'spy',
        ),
        player: p.sender,
      }
    }
    case 'Espionage': {
      const name = p.target?.name?.trim()
      return {
        ...glance(
          name ? `Scouted ${name}` : 'Espionage scan',
          endpoint(p.target?.coordinates, p.target?.kind),
          Radar,
          'spy',
        ),
        player: p.target?.owner,
      }
    }
    case 'Combat':
      return combatGlance(p, viewer)
    case 'ContactLost':
      return glance('Fleet contact lost', lostFleet(p), RadioOff, 'loss')
    case 'Returned':
      return glance(
        'Fleet returned',
        facts(
          withPrefix('Home', endpoint(p.origin_coordinates, p.origin_kind)),
          withPrefix(
            'Mission target',
            endpoint(p.destination_coordinates, p.target_kind),
          ),
        ),
        CornerDownLeft,
      )
    case 'Delivered':
      return glance(
        'Cargo delivered',
        withPrefix('To', endpoint(p.target, p.target_kind, p.target_name)),
        Truck,
        'win',
      )
    case 'Harvested': {
      const location = withPrefix('Debris field', at(p.destination_coordinates))
      if (!p.harvested) return glance('Harvest complete', location, Recycle)
      if (Object.values(p.harvested).every((amount) => BigInt(amount) === 0n))
        return glance('No debris collected', location, Recycle)
      return {
        ...glance('Harvested', location, Recycle),
        harvested: p.harvested,
      }
    }
    case 'Deployed':
      return glance(
        'Fleet deployed',
        withPrefix('To', endpoint(p.destination_coordinates, p.target_kind)),
        Rocket,
      )
    case 'Recalled':
      return glance(
        'Fleet recalled',
        withPrefix(
          'Homeward to',
          endpoint(p.origin_coordinates, p.origin_kind),
        ),
        Undo2,
      )
    case 'MissionFailed':
      return glance(
        'Mission failed',
        withPrefix(
          'Target',
          endpoint(p.destination_coordinates, p.target_kind),
        ),
        Rocket,
      )
    case 'Colonized':
      return glance('Colony founded', at(p.destination_coordinates), Flag)
    case 'ColonizationFailed':
      return glance(
        facts('Colony failed', p.reason ? colonyReasons[p.reason] : ''),
        at(p.destination_coordinates),
        Flag,
      )
    case 'MissileImpact':
      return glance(
        missileTitle(p),
        withPrefix('Target', endpoint(p.target, p.target_kind)),
        Rocket,
      )
    case 'PlanetAbandoned':
      return glance('Planet abandoned', at(p.coordinates), MapPinOff)
    case 'MoonDestroyed':
      return glance(
        'Moon destroyed',
        facts(
          at(p.coordinates),
          `${formatWholeNumber(p.diameter_km)} km diameter`,
        ),
        Eclipse,
        'loss',
      )
    case 'MoonFleetRedirected':
      return glance(
        'Fleet redirected to parent',
        facts(label(p.mission), at(p.coordinates)),
        CornerDownLeft,
      )
    case 'MoonTargetLost':
      return glance(
        'Fleet target lost',
        facts(label(p.mission), endpoint(p.coordinates, 'Moon')),
        MapPinOff,
      )
    case 'MoonCreated':
      return glance(
        'Moon formed',
        facts(
          at(p.coordinates),
          `${formatWholeNumber(p.diameter_km)} km diameter`,
        ),
        Moon,
      )
    case 'SiteEncounter': {
      const outcome = p.outcome && outcomeLabel(p.outcome, 'Attacker')
      return glance(
        outcome ? `${outcome.title} at NPC site` : 'NPC encounter',
        withPrefix('Personal site', at(p.coordinates)),
        Globe,
        outcome?.tone,
      )
    }
    case 'Phalanx':
      return glance(
        'Phalanx scan completed',
        words(label(p.target.kind), at(p.target.coordinates)),
        Radar,
      )
  }
}
