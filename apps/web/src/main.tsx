import { startAnalytics, bindAnalytics } from './adapters/analytics'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { createAppRouter } from './router'
import './style.css'
import { browserDependencies, loadInitialRuntime } from './adapters/runtime'
import { BootstrapProvider } from './shell/bootstrap-context'
import { ConnectionScreen } from './features/connection-screen'
async function start() {
  void startAnalytics()
  let analyticsAttempts = 0
  const analyticsRetry = setInterval(() => {
    if (++analyticsAttempts >= 5) clearInterval(analyticsRetry)
    void bindAnalytics()
  }, 15000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void bindAnalytics()
  })
  const root = createRoot(document.getElementById('root')!)
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
