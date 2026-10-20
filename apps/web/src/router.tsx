import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import type { Page } from './shell/routes'
export function createAppRouter(
  options: Partial<Pick<Parameters<typeof createRouter>[0], 'history'>> = {},
) {
  return createRouter({
    routeTree,
    defaultPreload: false,
    scrollRestoration: true,
    ...options,
  })
}
declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
  interface StaticDataRouteOption {
    page?: Page | null
  }
}
