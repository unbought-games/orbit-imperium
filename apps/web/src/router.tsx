import type { DispatchDraft } from './features/missions'
import { galaxyOwnsScroll } from './shell/galaxy-location'
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import type { Page } from './shell/routes'
export function createAppRouter(
  options: Partial<Pick<Parameters<typeof createRouter>[0], 'history'>> = {},
) {
  return createRouter({
    routeTree,
    defaultPreload: false,
    scrollRestoration: ({ location }) =>
      !galaxyOwnsScroll(location.pathname, location.search),
    ...options,
  })
}
declare module '@tanstack/react-router' {
  interface HistoryState {
    dispatchObservation?: Pick<DispatchDraft, 'observedAt' | 'target'>
  }

  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
  interface StaticDataRouteOption {
    page?: Page | null
  }
}
