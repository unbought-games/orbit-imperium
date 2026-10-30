import { createRoot, hydrateRoot } from 'react-dom/client'
import { Landing } from './landing'
import { useHomeMetadata } from './home-metadata'

function BrowserLanding({ signupEnabled }: { signupEnabled: boolean }) {
  useHomeMetadata()
  return <Landing signupEnabled={signupEnabled} />
}

export function startLanding(signupEnabled: boolean) {
  const root = document.getElementById('root')!
  const page = <BrowserLanding signupEnabled={signupEnabled} />
  if (root.hasChildNodes()) hydrateRoot(root, page)
  else createRoot(root).render(page)
}
