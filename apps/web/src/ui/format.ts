import type { components } from '../contracts'
export const label = (s: string) =>
  s.replaceAll('_', ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
export const coordinates = (b: {
  coordinates: components['schemas']['Coordinates']
}) =>
  `[${b.coordinates.galaxy}:${b.coordinates.system}:${b.coordinates.position}]`
