import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  type RouteComponent,
} from '@tanstack/react-router'
import { catalogPages } from '../shell/catalog-routes'

/** Resolve real catalog links without loading application routes or the shell. */
export function createCatalogPreviewRouter(
  initialPath = '/',
  component?: RouteComponent,
) {
  const root = createRootRoute({ component })
  const routes = catalogPages.flatMap((page) =>
    ['', '/$item'].map((suffix) =>
      createRoute({
        getParentRoute: () => root,
        path: `/u/$universe/b/$body/${page}${suffix}`,
      }),
    ),
  )
  return createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
}
