import { buildPages } from './navigation-model'
import type { BoundView } from '../client-model/commands'
import { universeSlug } from '../client-model/universe-name'
import { bodyPages, resolveNamedDestination, type Page } from './routes'

export type ShellParams = {
  universe?: string
  body?: string
  item?: string
  section?: string
  coordinates?: string
}

/** Resolve authorized context before deciding whether the route may render.
 * Legacy search input never overrides a body in the path or repairs foreign context. */
export function resolveShellRoute(
  page: Page | null,
  params: ShellParams,
  search: { body?: string; alliance?: string },
  view: BoundView,
  universeName: string,
) {
  const route = resolveNamedDestination(
    {
      universe: params.universe,
      page,
      body:
        params.body ??
        search.body ??
        (page && bodyPages.includes(page) ? view.bodies[0]?.id : undefined),
      item:
        page === 'alliance' && params.section
          ? `${params.item}/${params.section}`
          : params.item,
    },
    view,
    universeName,
  )
  const body = view.bodies.find((b) => b.id === route.body)
  const canonicalPage =
    route.page === 'alliance' && search.alliance
      ? 'alliance-discover'
      : route.page
  const canonicalizing =
    route.available &&
    !params.coordinates &&
    !!body &&
    (!params.body || search.body !== undefined || canonicalPage !== route.page)
  const lostMoon =
    params.body &&
    view.protocol === 4 &&
    params.universe === universeSlug(universeName) &&
    !route.available
      ? view.destroyed_moons?.find(({ moon }) => moon === params.body)
      : undefined
  const parent =
    lostMoon &&
    view.bodies.find(
      ({ id, kind }) => id === lostMoon.parent && kind === 'Planet',
    )
  return {
    route,
    body,
    canonicalPage,
    canonicalizing,
    parentAfterDestruction: parent?.id,
  }
}

/** These screens supply their own visible title. The route heading remains a focus target. */
export function usesVisuallyHiddenHeading(
  page: Page,
  available: boolean,
  protocol: BoundView['protocol'],
) {
  return (
    available &&
    (page === 'overview' ||
      buildPages.includes(page) ||
      page === 'galaxy' ||
      page === 'fleets' ||
      (page === 'dispatch' && protocol === 4) ||
      page === 'settings' ||
      page === 'rewards' ||
      page === 'menu' ||
      page === 'alliance' ||
      page === 'alliance-create' ||
      page === 'alliance-discover' ||
      (protocol === 4 && (page === 'reports' || page === 'messages')))
  )
}
