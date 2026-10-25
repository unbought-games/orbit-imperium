import { parsePastedCoordinates } from '../client-model/dispatch-validation'
import { coordinateText, parseLocationLink } from '../shell/location-address'
export function coordinateFields(text: string) {
  const [galaxy = '', system = '', ...position] = text.split(':')
  return { galaxy, system, position: position.join(':') }
}
export function pastedCoordinateInput(
  text: string,
  origin: string,
  universe: string,
) {
  const link = parseLocationLink(text, origin, universe)
  if (link)
    return {
      text: coordinateText(link.coordinates),
      target: link.target ?? ('planet' as const),
    }
  const values = parsePastedCoordinates(text)
  return values
    ? { text: `${values.galaxy}:${values.system}:${values.position}` }
    : null
}
export function nextCoordinateSegment(value: string, caret: number) {
  const next = value.indexOf(':', caret)
  if (next >= 0) return { value, caret: next + 1 }
  if (value.split(':').length >= 3) return { value, caret }
  return {
    value: value.slice(0, caret) + ':' + value.slice(caret),
    caret: caret + 1,
  }
}
