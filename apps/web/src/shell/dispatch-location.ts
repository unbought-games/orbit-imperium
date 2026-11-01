import { validateGalaxySearch } from './galaxy-location'
import {
  validateLocationIntent,
  readAddress,
  type LocationIntent,
} from './location-address'
import type { DispatchDraft } from '../features/missions'
export function validateDispatchSearch(
  search: Record<string, unknown>,
): ReturnType<typeof validateGalaxySearch> &
  LocationIntent & { attackGroup?: string } {
  return {
    ...validateGalaxySearch(search),
    ...validateLocationIntent(search),
    attackGroup:
      typeof search.attackGroup === 'string' &&
      /^[0-9a-f-]{36}$/i.test(search.attackGroup)
        ? search.attackGroup
        : undefined,
  }
}
export function dispatchSearch(draft: DispatchDraft) {
  return {
    ...draft.coordinates,
    attackGroup: draft.attackGroup,
    mission: draft.mission,
    target:
      draft.targetKind ??
      (draft.target?.type === 'Body' && draft.target.expected_kind === 'Moon'
        ? 'moon'
        : draft.mission === 'Harvest'
          ? 'debris'
          : 'planet'),
  } as const
}
export function draftFromSearch(
  search: {
    attackGroup?: string
    galaxy?: number
    system?: number
    position?: number
  } & LocationIntent,
): DispatchDraft | null {
  const coordinates = readAddress(
    `${search.galaxy}:${search.system}:${search.position}`,
  )
  return coordinates
    ? {
        coordinates,
        attackGroup: search.attackGroup,
        targetKind: search.target ?? 'planet',
        mission:
          search.mission ??
          (search.target === 'debris' ? 'Harvest' : 'Transport'),
      }
    : null
}
