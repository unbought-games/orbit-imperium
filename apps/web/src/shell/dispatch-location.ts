import { validateGalaxySearch } from './galaxy-location'
import {
  validateLocationIntent,
  readAddress,
  type LocationIntent,
} from './location-address'
import type { DispatchDraft } from '../features/missions'
export function validateDispatchSearch(search: Record<string, unknown>) {
  return { ...validateGalaxySearch(search), ...validateLocationIntent(search) }
}
export function dispatchSearch(draft: DispatchDraft) {
  return {
    ...draft.coordinates,
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
        targetKind: search.target ?? 'planet',
        mission:
          search.mission ??
          (search.target === 'debris' ? 'Harvest' : 'Transport'),
      }
    : null
}
