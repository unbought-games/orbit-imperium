import { useEffect } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useGameScreen } from '../shell/screen-context'
import { SettingsNavigation } from '../shell/settings-navigation'
import { routeTarget } from '../shell/route-target'
import { useDesktopNavigation } from '../shell/use-desktop-navigation'
import { DestinationLayout } from '../ui/destination-layout'

export function SettingsIndexScreen() {
  const { universeName, body } = useGameScreen()
  const desktop = useDesktopNavigation()
  const navigate = useNavigate()
  const location = useRouterState({ select: (state) => state.location })
  useEffect(() => {
    if (desktop)
      void navigate({
        ...routeTarget(universeName, 'settings', body?.id, 'identity'),
        search: location.search,
        hash: location.hash,
        replace: true,
      })
  }, [
    desktop,
    universeName,
    body?.id,
    navigate,
    location.search,
    location.hash,
  ])
  if (desktop) return null
  return (
    <DestinationLayout>
      <SettingsNavigation
        universeName={universeName}
        body={body?.id}
        appearance="page"
      />
    </DestinationLayout>
  )
}
