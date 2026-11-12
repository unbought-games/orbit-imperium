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
  if (import.meta.env.DEV && location.pathname === '/identity-playground') {
    const { IdentityPlayground } = await import('./dev/identity-playground')
    root.render(<IdentityPlayground />)
    return
  }
  if (import.meta.env.DEV && location.pathname === '/supporter-preview') {
    const { SupporterPreview } = await import('./features/supporter-preview')
    root.render(<SupporterPreview />)
    return
  }
  if (import.meta.env.DEV && location.pathname === '/action-sheet-playground') {
    const { ActionSheetPlayground } = await import(
      './dev/action-sheet-playground'
    )
    root.render(<ActionSheetPlayground />)
    return
  }
  if (import.meta.env.DEV && location.pathname === '/hud-playground') {
    const { HudPlayground } = await import('./dev/hud/hud-playground')
    root.render(<HudPlayground />)
    return
  }
  if (import.meta.env.DEV && location.pathname === '/detail-playground') {
    const { DetailPlayground } = await import('./dev/detail-playground')
    root.render(<DetailPlayground />)
    return
  }
  const empireProfile = /^\/profiles\/empire\/([0-9a-f-]+)\/?$/i.exec(
    location.pathname,
  )
  if (empireProfile) {
    const { EmpireProfilePage } = await import(
      './features/empire-history/profile-page'
    )
    root.render(<EmpireProfilePage player={empireProfile[1]} />)
    return
  }
  const orbitProfile = /^\/profiles\/([0-9a-f-]+)\/?$/i.exec(location.pathname)
  if (orbitProfile || location.pathname === '/profile') {
    const { OrbitProfilePage } = await import(
      './features/empire-history/overview-page'
    )
    root.render(<OrbitProfilePage profile={orbitProfile?.[1]} />)
    return
  }
  const commemoration = /^\/commemorations\/([0-9a-f-]+)\/?$/i.exec(
    location.pathname,
  )
  if (commemoration) {
    const { CommemorationPage } = await import(
      './features/empire-history/commemoration-page'
    )
    root.render(<CommemorationPage publication={commemoration[1]} />)
    return
  }
  const invitation = /^\/invite\/([^/]+)\/([^/]+)\/?$/i.exec(location.pathname)
  if (invitation) {
    const { PublicAlliancePage } = await import(
      './features/alliances/public-page'
    )
    root.render(
      <PublicAlliancePage
        universe={invitation[1]}
        invitation={invitation[2]}
      />,
    )
    void startAnalytics()
    return
  }
  const directory = /^\/alliances(?:\/([^/]+))?\/?$/i.exec(location.pathname)
  if (directory) {
    const { PublicRecruitmentDirectory } = await import(
      './features/alliances/recruitment-directory'
    )
    root.render(<PublicRecruitmentDirectory universe={directory[1]} />)
    void startAnalytics()
    return
  }
  const publicAlliance = /^\/alliances\/([^/]+)\/([^/]+)\/?$/i.exec(
    location.pathname,
  )
  if (publicAlliance) {
    void startAnalytics()
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
  // Public /invite documents deliberately embed anonymous bootstrap data.
  // The recipient route must explicitly resolve the current session after OAuth;
  // otherwise a freshly signed-in invitee would be shown sign-in again forever.
  const initialRuntime = await loadInitialRuntime(
    browserDependencies(),
    /^\/invite\/[^/]+\/?$/.test(location.pathname),
  )
  const router = createAppRouter()
  root.render(
    <BootstrapProvider initialRuntime={initialRuntime}>
      <RouterProvider router={router} />
    </BootstrapProvider>,
  )
}
