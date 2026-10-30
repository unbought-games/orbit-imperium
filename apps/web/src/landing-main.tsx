import './style.css'
import { startLanding } from './features/landing-entry'
import { readAnonymousLanding } from './adapters/anonymous-landing'

async function start() {
  const signupEnabled = readAnonymousLanding(document, location.pathname)
  if (signupEnabled !== null) {
    startLanding(signupEnabled)
    const { startAnalytics } = await import('./adapters/optional-services')
    void startAnalytics()
    return
  }
  const { startGame } = await import('./start-game')
  await startGame()
}
void start()
