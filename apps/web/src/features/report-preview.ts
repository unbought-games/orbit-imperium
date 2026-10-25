import { combatOutcome, hasCombatLoot } from './combat-report-model'
import { bodyIdentityLabel } from './body-identity-label'
import { formatDuration } from '../client-model/duration'
import type { components } from '../contracts'
import { coordinates, label } from '../ui/format'
import { formatWholeNumber } from '../ui/whole-number'

type S = components['schemas']
type Preview = S['ReportPreview4']
export type ReportFact = string | { resources: S['Resources']; label?: string }
const shipsText = (ships: S['PublicShip4'][]) =>
  ships.length
    ? ships
        .map((s) => `${formatWholeNumber(s.count)} ${label(s.ship_type)}`)
        .join(' · ')
    : 'No ships'
const totalUnits = (
  observation: Extract<Preview, { kind: 'Espionage' }>['fleet'],
) =>
  !observation || observation.visibility === 'Unknown'
    ? 'unknown'
    : formatWholeNumber(
        observation.value.reduce((sum, unit) => sum + BigInt(unit.count), 0n),
      )

/** Derive a list glance only from the report's historical, recipient-visible facts. */
export function reportPreview(
  preview: Preview | undefined,
  viewer?: string,
): {
  location: string
  coordinates?: S['Coordinates']
  targetKind?: 'moon'
  facts: ReportFact[]
} {
  if (!preview) return { location: '', facts: [] }
  const facts: ReportFact[] = []
  let at: S['Coordinates'] | undefined
  let identity = ''
  switch (preview.kind) {
    case 'Espionage':
      at = preview.target?.coordinates
      identity = bodyIdentityLabel(preview.target?.name, preview.target?.kind)
      facts.push(
        preview.resources?.visibility === 'Known'
          ? { resources: preview.resources.value }
          : 'Resources unknown',
      )
      facts.push(
        `Fleet: ${totalUnits(preview.fleet)}`,
        `Defenses: ${totalUnits(preview.defenses)}`,
      )
      if (preview.counterespionage?.detected) facts.push('Detected')
      break
    case 'Returned':
    case 'Recalled':
    case 'Harvested':
    case 'MissionFailed':
    case 'Deployed':
      at =
        preview.kind === 'Returned' || preview.kind === 'Recalled'
          ? preview.origin_coordinates
          : preview.destination_coordinates
      if (preview.ships) facts.push(shipsText(preview.ships))
      if (preview.cargo)
        facts.push(
          Object.values(preview.cargo).some((n) => BigInt(n) > 0n)
            ? { resources: preview.cargo, label: 'Cargo' }
            : 'No cargo',
        )
      break
    case 'Combat':
      at = preview.target
      identity = bodyIdentityLabel(preview.target_name, preview.target_kind)
      if (
        preview.loot &&
        hasCombatLoot(
          preview.outcome,
          preview.participants?.find(
            (participant) => participant.owner === viewer,
          )?.side,
          preview.loot,
        )
      )
        facts.push({ resources: preview.loot, label: 'Loot' })
      if (
        preview.debris &&
        Object.values(preview.debris).some((n) => BigInt(n) > 0n)
      )
        facts.push({ resources: preview.debris, label: 'Debris' })
      break
    case 'ContactLost':
      at = preview.target
      if (preview.own_lost_ships)
        facts.push(`Lost: ${shipsText(preview.own_lost_ships)}`)
      if (
        preview.own_cargo_loss &&
        Object.values(preview.own_cargo_loss).some((n) => BigInt(n) > 0n)
      )
        facts.push({ resources: preview.own_cargo_loss, label: 'Cargo lost' })
      break
    case 'Delivered':
      at = preview.target
      if (preview.cargo) facts.push({ resources: preview.cargo })
      break
    case 'SpyContact':
      at = preview.target
      if (preview.origin)
        facts.push(`From ${coordinates({ coordinates: preview.origin })}`)
      if (preview.detected !== undefined)
        facts.push(preview.detected ? 'Detected' : 'Undetected')
      break
    case 'Colonized':
    case 'ColonizationFailed':
      at = preview.destination_coordinates
      if (preview.kind === 'ColonizationFailed' && preview.reason)
        facts.push(label(preview.reason))
      break
  }
  return {
    location: at
      ? [identity, coordinates({ coordinates: at })].filter(Boolean).join(' · ')
      : identity,
    coordinates: at,
    ...(preview.kind === 'Combat' && preview.target_kind === 'Moon'
      ? { targetKind: 'moon' as const }
      : {}),
    facts,
  }
}

export function reportAge(observedAt: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - observedAt) / 60000)
  return minutes < 1 ? 'Just now' : `${formatDuration(minutes * 60000)} ago`
}

export function reportListTitle(report: S['ReportHeader4'], viewer?: string) {
  const preview = report.preview
  if (preview?.kind === 'Combat' && preview.outcome) {
    const side = preview.participants?.find(
      (participant) => participant.owner === viewer,
    )?.side
    return combatOutcome(preview.outcome, side)
  }
  return { title: label(report.kind), symbol: '', tone: 'neutral' }
}
