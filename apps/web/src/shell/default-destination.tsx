import { useUniverseName } from './session-context'
import { Navigate } from '@tanstack/react-router'
import { useGameSession } from './session-context'
import { routeTarget } from './route-target'
export function DefaultDestination() {
  const universeName = useUniverseName()
  const { view } = useGameSession()
  return (
    <Navigate
      {...routeTarget(universeName, 'overview', view.bodies[0]?.id)}
      replace
    />
  )
}
