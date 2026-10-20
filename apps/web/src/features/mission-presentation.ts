import type { components } from '../contracts'
import { formatRemaining } from '../client-model/clock'
import { label } from '../ui/format'
type S = components['schemas']

export function arrivalCountdown(deadline: number, now: number) {
  return formatRemaining(
    deadline <= now ? null : Math.ceil((deadline - now) / 1000),
  )
}
const timestampFormat = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZoneName: 'short',
})
export function exactTime(timestamp: number) {
  return timestampFormat.format(timestamp)
}
export function observationAge(observedAt: number, now: number) {
  const seconds = Math.max(0, Math.floor((now - observedAt) / 1000))
  return seconds < 60
    ? 'Less than a minute ago'
    : `${formatRemaining(seconds)} ago`
}
export function shipManifest(ships: S['PublicShip4'][]) {
  return ships
    .map((ship) => `${ship.count} ${label(ship.ship_type)}`)
    .join(' · ')
}
export function incomingManifest(ships: S['IncomingShips4']) {
  switch (ships.visibility) {
    case 'Unknown':
      return 'Ship composition unknown'
    case 'Total':
      return `${ships.total} ships · Types unknown`
    case 'Types':
      return `${ships.total} ships · ${ships.types.map(label).join(', ')}`
    case 'Exact':
      return shipManifest(ships.ships)
  }
}
export function recallEstimate(fleet: S['OwnMission4'], now: number) {
  return fleet.can_recall && fleet.leg === 'Outbound' && now < fleet.due_at
    ? now + Math.max(0, now - fleet.launched_at)
    : null
}
