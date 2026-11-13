import { settingsEntryTarget } from '../shell/settings-navigation-model'
import { useEffect } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useGameScreen } from '../shell/screen-context'
import { SettingsNavigation } from '../shell/settings-navigation'
import { routeTarget } from '../shell/route-target'
import { useDesktopNavigation } from '../shell/use-desktop-navigation'
import { DestinationLayout } from '../ui/destination-layout'

export function SettingsIndexScreen() {
  const { universeName, body, view } = useGameScreen()
  const desktop = useDesktopNavigation()
  const navigate = useNavigate()
  const location = useRouterState({ select: (state) => state.location })
  // Router location changes before a lazy detail route finishes mounting. The
  // outgoing index must not redirect that new location a second time.
  const atIndex = /\/settings\/?$/.test(location.pathname)
  const target = atIndex
    ? settingsEntryTarget(desktop, location.hash)
    : undefined
  useEffect(() => {
    if (target)
      void navigate({
        ...routeTarget(universeName, 'settings', body?.id, target.section),
        search: location.search,
        hash: target.hash,
        replace: true,
      })
  }, [
    target?.section,
    target?.hash,
    universeName,
    body?.id,
    navigate,
    location.search,
    location.hash,
  ])
  if (target || !atIndex) return null
  return (
    <DestinationLayout>
      <SettingsNavigation
        universeName={universeName}
        body={body?.id}
        appearance="page"
        protocol={view.protocol}
      />
    </DestinationLayout>
  )
}
