import { createRootRoute } from '@tanstack/react-router'
import { App } from '../app'
import { InvalidRoute } from '../shell/invalid-route'
export const Route = createRootRoute({
  component: App,
  errorComponent: InvalidRoute,
  notFoundComponent: () => <InvalidRoute />,
})
