import { startAnalytics } from './adapters/optional-services'
import { configureInstalledViewport } from './adapters/installed-viewport'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { createAppRouter } from './router'
import { browserDependencies, loadInitialRuntime } from './adapters/runtime'
import { BootstrapProvider } from './shell/bootstrap-context'
import { ConnectionScreen } from './features/connection-screen'
export async function startGame() {
  // A returning session can redirect straight from / into the game. Homepage
  // canonical/share data must not survive that client-side navigation.
  const homeMetadata = document.querySelectorAll('[data-orbit-home-head]')
  if (homeMetadata.length) {
    homeMetadata.forEach((node) => node.remove())
    document.title = 'Orbit Imperium'
  }
  configureInstalledViewport()
  const root = createRoot(document.getElementById('root')!)
  // Local UX playground; no session, membership, or backend changes.
  if (import.meta.env.DEV && location.pathname === '/supporter-preview') {
    const { SupporterPreview } = await import('./features/supporter-preview')
    root.render(<SupporterPreview />)
    return
  }
  if (import.meta.env.DEV && location.pathname === '/detail-playground') {
    const { DetailPlayground } = await import('./dev/detail-playground')
    root.render(<DetailPlayground />)
    return
  }
  const publicAlliance = /^\/alliances\/([^/]+)\/([^/]+)\/?$/i.exec(
    location.pathname,
  )
  if (publicAlliance) {
    const { PublicAlliancePage } = await import(
      './features/alliances/public-page'
    )
    root.render(
      <PublicAlliancePage
        universe={publicAlliance[1]}
        alliance={publicAlliance[2]}
      />,
    )
    return
  }
  const shared = /^\/reports\/shared\/([^/]+)\/?$/i.exec(location.pathname)
  if (shared) {
    const { SharedReportPage } = await import('./features/shared-report-page')
    root.render(<SharedReportPage token={shared[1]} />)
    return
  }
  root.render(<ConnectionScreen />)
  void startAnalytics()
  const initialRuntime = await loadInitialRuntime(browserDependencies())
  const router = createAppRouter()
  root.render(
    <BootstrapProvider initialRuntime={initialRuntime}>
      <RouterProvider router={router} />
    </BootstrapProvider>,
  )
}
