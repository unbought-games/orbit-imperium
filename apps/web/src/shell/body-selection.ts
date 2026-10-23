import type { BoundView } from '../client-model/commands'
import { bodyName, coordinates } from '../ui/format'
export function bodyGroups(
  bodies: BoundView['bodies'],
  query: string,
  selected?: string,
) {
  const search = query.trim().toLowerCase()
  const visible = bodies.filter(
    (body) =>
      body.id === selected ||
      `${bodyName(body)} ${body.kind} ${coordinates(body)}`
        .toLowerCase()
        .includes(search),
  )
  const groups = new Map<string, typeof visible>()
  for (const body of visible) {
    const key = coordinates(body)
    groups.set(key, [...(groups.get(key) ?? []), body])
  }
  return [...groups].map(([position, entries]) => ({
    position,
    entries: [...entries].sort((a, b) =>
      a.kind === b.kind ? 0 : a.kind === 'Planet' ? -1 : 1,
    ),
  }))
}
