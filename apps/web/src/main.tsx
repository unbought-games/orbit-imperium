import './style.css'
import { readAnonymousLanding } from './adapters/anonymous-landing'

async function start() {
  const signupEnabled = readAnonymousLanding(document, location.pathname)
  if (signupEnabled !== null) {
    const { startLanding } = await import('./features/landing-entry')
    startLanding(signupEnabled)
    const { startAnalytics } = await import('./adapters/optional-services')
    void startAnalytics()
    return
  }
  const { startGame } = await import('./start-game')
  await startGame()
}
void start()
