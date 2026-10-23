import type { components } from '../contracts'
type S = components['schemas']
type PreviewWork = Pick<
  S['BoundView3'],
  'constructions' | 'research' | 'viewer_revision'
> & {
  bodies: Pick<S['BodyV3'], 'id' | 'levels'>[]
  progression: Pick<S['BoundView3']['progression'], 'research_operation'>
}

/** Act as the sandbox server, never as a client-side completion prediction. */
export function completePreviewWork(view: PreviewWork, now: number) {
  let changed = false
  view.constructions = view.constructions.filter((work) => {
    if (work.due_at > now) return true
    const body = view.bodies.find((body) => body.id === work.body)
    if (!body) return true
    body.levels[work.building as keyof typeof body.levels] = work.target_level
    changed = true
    return false
  })
  const research = view.progression.research_operation
  if (research && research.due_at <= now) {
    const known = view.research.find(
      (entry) => entry.research === research.research,
    )
    if (known) known.level = research.target_level
    else
      view.research.push({
        research: research.research,
        level: research.target_level,
      })
    view.progression.research_operation = null
    changed = true
  }
  if (changed) view.viewer_revision = String(BigInt(view.viewer_revision) + 1n)
  return changed
}
