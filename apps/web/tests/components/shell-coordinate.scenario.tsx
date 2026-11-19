import { PreparedLinkContext } from '../../src/test-support/prepared-link-context'
import { CoordinateLink } from '../../src/features/coordinate-link'

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
      </main>
    </PreparedLinkContext>
  )
}
