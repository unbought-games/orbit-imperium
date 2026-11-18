import { useLayoutEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import type {
  InsigniaAction,
  InsigniaState,
} from '../../src/adapters/insignias'
import { InsigniaController } from '../../src/client-model/insignias'
import { InsigniaEditor } from '../../src/features/insignia-editor'
import { InsigniaContext } from '../../src/shell/insignia-context'

declare global {
  interface Window {
    insigniaSnapshot: InsigniaState
    remountInsignia: () => void
  }
}

// The external library echoes accepted edits. Access, preview, draft selection
// and command construction are all exercised in the real editor and controller.
async function library(action: InsigniaAction) {
  const snapshot = window.insigniaSnapshot
  const library = snapshot.library
  switch (action.type) {
    case 'Save': {
      const design = {
        ...structuredClone(action.design),
        revision: action.design.revision + 1,
      }
      library.designs = library.designs
        .filter((d) => d.id !== design.id)
        .concat(design)
      if (action.equip) library.equipped = design.id
      break
    }
    case 'Equip':
      library.equipped = action.design_id
      break
    case 'Delete':
      library.designs = library.designs.filter((d) => d.id !== action.design_id)
      if (library.equipped === action.design_id) library.equipped = null
      break
  }
  if (action.type !== 'Load') {
    const equipped = library.designs.find((d) => d.id === library.equipped)
    snapshot.appearance = equipped
      ? { recipe: equipped.recipe, asset_url: snapshot.catalog[0].asset_url }
      : null
  }
  return structuredClone(snapshot)
}
function Editor() {
  const [controller] = useState(() => new InsigniaController(library, () => {}))
  return (
    <InsigniaContext.Provider value={controller}>
      <InsigniaEditor />
    </InsigniaContext.Provider>
  )
}
function Surface() {
  const [revision, setRevision] = useState(0)
  useLayoutEffect(() => {
    window.remountInsignia = () => flushSync(() => setRevision((n) => n + 1))
  }, [])
  return (
    <main style={{ padding: 16, maxWidth: 1000, margin: 'auto' }}>
      <Editor key={revision} />
    </main>
  )
}
export function InsigniaScenario() {
  const [router] = useState(() => {
    const root = createRootRoute({ component: Surface })
    return createRouter({
      routeTree: root.addChildren([
        createRoute({ getParentRoute: () => root, path: '$' }),
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
  })
  return <RouterProvider router={router} />
}
