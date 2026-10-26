import { useAuthSession } from '../shell/auth-context'
import { DefaultDestination } from '../shell/default-destination'
import { HomeLanding } from './home-landing'
import { useHomeMetadata } from './home-metadata'

export function Home() {
  const { runtime } = useAuthSession()
  useHomeMetadata(runtime.status === 'anonymous')
  if (runtime.status === 'authenticated') return <DefaultDestination />
  return <HomeLanding signupEnabled={runtime.signupEnabled} />
}
