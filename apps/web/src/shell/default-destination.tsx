import { Navigate } from '@tanstack/react-router'
import { useGameSession } from './session-context'
import { routeTarget } from './route-target'
export function DefaultDestination() {
  const { view } = useGameSession()
  return (
    <Navigate
      {...routeTarget(view.binding.universe, 'overview', view.bodies[0]?.id)}
      replace
    />
  )
}
