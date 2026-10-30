import { HomeLanding } from './home-landing'
import { SkipLink } from '../ui/skip-link'

/** Shared by build-time rendering and browser hydration. */
export function Landing({ signupEnabled }: { signupEnabled: boolean }) {
  return (
    <>
      <SkipLink />
      <HomeLanding signupEnabled={signupEnabled} />
    </>
  )
}
