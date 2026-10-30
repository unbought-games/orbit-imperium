import { renderToString } from 'react-dom/server'
import { Landing } from './features/landing'

export function renderLanding(signupEnabled: boolean) {
  return renderToString(<Landing signupEnabled={signupEnabled} />)
}
