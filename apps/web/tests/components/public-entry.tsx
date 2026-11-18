import { useState } from 'react'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from '@tanstack/react-router'
import { Login } from '../../src/features/login'

export function PublicEntry() {
  const [router] = useState(() =>
    createRouter({
      routeTree: createRootRoute().addChildren([]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    }),
  )
  const params = new URLSearchParams(location.search)
  return (
    <RouterContextProvider router={router}>
      <Login
        signup={params.get('mode') === 'signup'}
        signupEnabled
        busy={false}
        message={
          params.has('error') ? 'Could not confirm your credentials.' : ''
        }
        errorRef={null}
        onSubmit={(event) => event.preventDefault()}
      />
    </RouterContextProvider>
  )
}
