import type { BoundView } from '../client-model/commands'

export type PickerBody = BoundView['bodies'][number]
type BodyGroup = { body: PickerBody; moons: PickerBody[] }

export function groupPickerBodies(bodies: readonly PickerBody[]): BodyGroup[] {
  const groups = bodies.map((body): BodyGroup => ({ body, moons: [] }))
  const byId = new Map(groups.map((group) => [group.body.id, group]))
  const roots: BodyGroup[] = []
  for (const group of groups) {
    const { body } = group
    const parent =
      body.kind === 'Moon' && 'moon' in body && body.moon
        ? byId.get(body.moon.parent)
        : undefined
    if (parent?.body.kind === 'Planet') parent.moons.push(body)
    else roots.push(group)
  }
  return roots
}
