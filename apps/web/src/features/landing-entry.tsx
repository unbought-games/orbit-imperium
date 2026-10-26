import { createRoot } from 'react-dom/client'
import { HomeLanding } from './home-landing'
import { useHomeMetadata } from './home-metadata'
import { SkipLink } from '../ui/skip-link'

function Landing({ signupEnabled }: { signupEnabled: boolean }) {
  useHomeMetadata()
  return (
    <>
      <SkipLink />
      <HomeLanding signupEnabled={signupEnabled} />
    </>
  )
}

export function startLanding(signupEnabled: boolean) {
  createRoot(document.getElementById('root')!).render(
    <Landing signupEnabled={signupEnabled} />,
  )
}
