import { linkOptions } from '@tanstack/react-router'
import type { components } from '../contracts'
import { universeSlug } from '../client-model/universe-name'

import type { LocationKind } from './location-address'

type Coordinates = components['schemas']['Coordinates']
export type GalaxySearch = {
  galaxy?: number
  system?: number
  position?: number
  target?: LocationKind
}
const positiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0

export function readCoordinates(value: unknown): Coordinates | null {
  if (!value || typeof value !== 'object') return null
  const c = value as Record<string, unknown>
  return positiveInteger(c.galaxy) &&
    positiveInteger(c.system) &&
    positiveInteger(c.position)
    ? { galaxy: c.galaxy, system: c.system, position: c.position }
    : null
}

export function validateGalaxySearch(
  search: Record<string, unknown>,
): GalaxySearch {
  const result: GalaxySearch = {}
  for (const key of ['galaxy', 'system', 'position'] as const) {
    if (search[key] === undefined) continue
    if (!positiveInteger(search[key]))
      throw new Error('This address contains invalid galaxy coordinates.')
    result[key] = search[key]
  }
  if (search.target !== undefined) {
    if (!['planet', 'moon', 'debris'].includes(String(search.target)))
      throw Error('Invalid target kind.')
    result.target = search.target as LocationKind
  }
  return result
}

export function galaxyTarget(
  universeName: string,
  body: string,
  location: GalaxySearch,
) {
  return linkOptions({
    to: '/u/$universe/b/$body/galaxy',
    params: { universe: universeSlug(universeName), body },
    search: location,
  })
}

/** A requested position is revealed after its system loads, including on Back. */
export function galaxyOwnsScroll(
  pathname: string,
  search: Record<string, unknown>,
) {
  return pathname.endsWith('/galaxy') && positiveInteger(search.position)
}
