import type { TutorialData } from '../../client-model/tutorial-engine'
import { routeTarget } from '../../shell/route-target'

/** Report content can arrive before guidance; never require its read to build a link. */
export function briefingRoute(
  universe: string,
  tutorial: TutorialData | null,
  fallbackBody?: string,
) {
  const body = tutorial?.homeworld ?? fallbackBody
  return body ? routeTarget(universe, 'briefing', body) : null
}
