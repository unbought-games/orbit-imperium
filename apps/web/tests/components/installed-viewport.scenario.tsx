import { configureInstalledViewport } from '../../src/adapters/installed-viewport'

// The application calls the adapter before rendering; each browser context
// gets a fresh document, viewport meta element, and native touch environment.
configureInstalledViewport()
export function InstalledViewport() {
  return <main style={{ minHeight: '100vh' }}>Touch viewport</main>
}
