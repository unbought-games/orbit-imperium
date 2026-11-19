import { useSyncExternalStore } from 'react'
import { useRouter } from '@tanstack/react-router'
import { PreparedLinkContext } from '../../src/test-support/prepared-link-context'
import { CoordinateLink } from '../../src/features/coordinate-link'

function ActiveLocation() {
  const { history } = useRouter()
  const href = useSyncExternalStore(
    history.subscribe,
    () => history.location.href,
  )
  return <output aria-label="Coordinate route">{href}</output>
}

export function ShellCoordinates() {
  return (
    <PreparedLinkContext>
      <main>
        <CoordinateLink
          at={{ galaxy: 1, system: 2, position: 4 }}
          label="origin"
        />
        <CoordinateLink
          at={{ galaxy: 1, system: 5, position: 12 }}
          label="destination"
        />
        <ActiveLocation />
      </main>
    </PreparedLinkContext>
  )
}
