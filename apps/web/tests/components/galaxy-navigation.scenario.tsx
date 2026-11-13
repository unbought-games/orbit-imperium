import { useState } from 'react'
import { GalaxyNavigation } from '../../src/features/galaxy-navigation'
import { FleetPresentationRoutes } from './galaxy-fleet.scenarios'

export function GalaxyNavigationScenario() {
  const [coordinates, setCoordinates] = useState({ galaxy: 2, system: 2 })
  const [mounted, setMounted] = useState(true)
  return (
    <FleetPresentationRoutes>
      <main>
        <button onClick={() => setMounted(!mounted)}>Toggle navigation</button>
        {mounted && (
          <GalaxyNavigation
            {...coordinates}
            galaxies={3}
            systems={3}
            browse={(galaxy, system) => setCoordinates({ galaxy, system })}
          />
        )}
        <output aria-label="Destination">
          {coordinates.galaxy}:{coordinates.system}
        </output>
        <textarea aria-label="Message" defaultValue="Hello" />
        <div contentEditable suppressContentEditableWarning aria-label="Editor">
          Editable text
        </div>
        <div role="dialog" aria-label="Mission">
          <button>Dialog action</button>
        </div>
        <div role="menu" aria-label="Actions">
          <button role="menuitem">Menu action</button>
        </div>
        <button onKeyDown={(event) => event.preventDefault()}>
          Own keyboard handler
        </button>
      </main>
    </FleetPresentationRoutes>
  )
}
