import { startAnalytics, bindAnalytics } from './adapters/analytics'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { createAppRouter } from './router'
import './style.css'
import { browserDependencies, loadInitialRuntime } from './adapters/runtime'
import { BootstrapProvider } from './shell/bootstrap-context'
import { ConnectionScreen } from './features/connection-screen'
async function start() {
  const root = createRoot(document.getElementById('root')!)
  // Local UX playground; no session, membership, or backend changes.
  if (import.meta.env.DEV && location.pathname === '/supporter-preview') {
    const { SupporterPreview } = await import('./features/supporter-preview')
    root.render(<SupporterPreview />)
    return
  }
  void startAnalytics()
  let analyticsAttempts = 0
  const analyticsRetry = setInterval(() => {
    if (++analyticsAttempts >= 5) clearInterval(analyticsRetry)
    void bindAnalytics()
  }, 15000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void bindAnalytics()
  })
  root.render(<ConnectionScreen />)
  const initialRuntime = await loadInitialRuntime(browserDependencies())
  const router = createAppRouter()
  root.render(
    <BootstrapProvider initialRuntime={initialRuntime}>
      <RouterProvider router={router} />
    </BootstrapProvider>,
  )
}
void start()
