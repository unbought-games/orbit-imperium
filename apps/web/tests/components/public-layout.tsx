import { HomeLanding } from '../../src/features/home-landing'
export function PublicLayout() {
  return (
    <HomeLanding
      signupEnabled={
        new URLSearchParams(location.search).get('signup') !== 'false'
      }
    />
  )
}
