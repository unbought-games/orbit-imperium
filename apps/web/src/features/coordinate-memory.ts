import { atom } from 'jotai'
import type { components } from '../contracts'
import type { LocationKind } from '../shell/location-address'
// Interaction history, isolated by the session provider; not live game state.
export const copiedLocationAtom = atom<{
  coordinates: components['schemas']['Coordinates']
  target: LocationKind
} | null>(null)
