import type { components } from '../contracts'
import { universeSlug } from '../client-model/universe-name'
import { readCoordinates } from './galaxy-location'
type Coordinates = components['schemas']['Coordinates']
export const locationMissions = [
  'Transport',
  'Espionage',
  'Harvest',
  'Attack',
  'Colonize',
  'Deploy',
] as const
export type LocationMission = (typeof locationMissions)[number]
export type LocationKind = 'planet' | 'moon' | 'debris'
export type LocationIntent = {
  target?: LocationKind
  mission?: LocationMission
}
export function coordinateText(c: Coordinates) {
  return `${c.galaxy}:${c.system}:${c.position}`
}
export function readAddress(value: string): Coordinates | null {
  if (!/^\d+:\d+:\d+$/.test(value)) return null
  const [galaxy, system, position] = value.split(':').map(Number)
  return readCoordinates({ galaxy, system, position })
}
export function validateLocationIntent(
  search: Record<string, unknown>,
): LocationIntent {
  const target = search.target
  if (
    target !== undefined &&
    !['planet', 'moon', 'debris'].includes(String(target))
  )
    throw Error('Invalid target kind.')
  const mission =
    search.mission === undefined
      ? undefined
      : locationMissions.find(
          (m) => m.toLowerCase() === String(search.mission).toLowerCase(),
        )
  if (search.mission !== undefined && !mission) throw Error('Invalid mission.')
  if (
    (target === 'moon' && (mission === 'Harvest' || mission === 'Colonize')) ||
    (target === 'debris' && mission !== undefined && mission !== 'Harvest')
  )
    throw Error('This mission does not match the target kind.')
  return {
    ...(target ? { target: target as LocationKind } : {}),
    ...(mission ? { mission } : {}),
  }
}
export function locationPath(
  universe: string,
  coordinates: Coordinates,
  intent: LocationIntent = {},
) {
  const query = new URLSearchParams()
  if (intent.target && intent.target !== 'planet')
    query.set('target', intent.target)
  if (intent.mission) query.set('mission', intent.mission.toLowerCase())
  return `/u/${universeSlug(universe)}/location/${coordinateText(coordinates)}${query.size ? `?${query}` : ''}`
}
/** Never silently drop a pasted link's server, universe or target kind. */
export function parseLocationLink(
  text: string,
  origin: string,
  universe: string,
) {
  try {
    const url = new URL(text.trim(), origin)
    if (url.origin !== origin) return null
    const match = url.pathname.match(/^\/u\/([^/]+)\/location\/([^/]+)$/)
    if (!match || decodeURIComponent(match[1]) !== universeSlug(universe))
      return null
    const coordinates = readAddress(decodeURIComponent(match[2]))
    return coordinates
      ? {
          coordinates,
          ...validateLocationIntent(Object.fromEntries(url.searchParams)),
        }
      : null
  } catch {
    return null
  }
}
