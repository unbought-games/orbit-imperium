import { useEffect, useState } from 'react'
import { ShipAppearancesController } from '../../src/client-model/ship-appearances'
import type {
  ShipAppearanceAction,
  ShipAppearanceState,
} from '../../src/client-model/ship-appearance-types'
import { ShipCustomizer } from '../../src/features/ship-customization/ship-customizer'
import { ShipAppearancesContext } from '../../src/shell/ship-appearances-context'
import { Button } from '../../src/ui/button'

const compass =
  '/api/media/insignias/compass/d07116e0f20572f45284a7ad35203fa68395324df3381d3ac5e6165d272d3739.svg'
const preview = '/art/ship-skins/orbit-light-fighter/concord-v1/preview.webp'
function initialState(): ShipAppearanceState {
  return {
    binding: {
      account: '00000000-0000-4000-8000-000000000001',
      universe: '00000000-0000-4000-8000-000000000002',
      player: '00000000-0000-4000-8000-000000000003',
      epoch: '00000000-0000-4000-8000-000000000004',
    },
    request_id: '00000000-0000-4000-8000-000000000005',
    catalog: [
      {
        id: 'orbit-light-fighter',
        name: 'Concord',
        target: 'LightFighter',
        package_revision: 'concord-v1',
        package_url:
          '/art/ship-skins/orbit-light-fighter/concord-v1/manifest.json',
        preview_url: preview,
        available: true,
      },
    ],
    dyes: [
      {
        id: 'porcelain',
        name: 'Porcelain',
        color: '#dedbd2',
        availability: 'available',
      },
      { id: 'navy', name: 'Navy', color: '#233f61', availability: 'available' },
      {
        id: 'copper',
        name: 'Copper',
        color: '#b66f42',
        availability: 'available',
      },
    ],
    library: [
      {
        id: '00000000-0000-4000-8000-000000000006',
        name: 'First light',
        target: 'LightFighter',
        revision: 1,
        recipe: {
          version: 1,
          skin_id: 'orbit-light-fighter',
          package_revision: 'concord-v1',
          primary: 'porcelain',
          accent: 'navy',
          emblem: { treatment: 'full', placement: 'paired' },
        },
      },
    ],
    equipment: [
      {
        target: 'LightFighter',
        revision: 1,
        design_id: '00000000-0000-4000-8000-000000000006',
        design_revision: 1,
        render: {
          id: '00000000-0000-4000-8000-000000000007',
          stage: 'ready',
          can_cancel: false,
          can_retry: false,
        },
        artwork: {
          id: '00000000-0000-4000-8000-000000000008',
          variants: [{ width: 1536, height: 1024, url: preview }],
        },
      },
    ],
    emblem: {
      recipe: {
        version: 1,
        symbol: 'compass',
        foreground: '#f4ead2',
        background: '#233f61',
      },
      asset_url: compass,
    },
    emblem_revision: 1,
  }
}

export type ShipCustomizationControl = {
  snapshot: () => ShipAppearanceState
  pending: () => ShipAppearanceAction | null
  observe: (snapshot: ShipAppearanceState) => Promise<void>
  accept: (snapshot: ShipAppearanceState) => void
  loseResponse: (committed: ShipAppearanceState) => void
  reject: () => void
  dispose: () => void
}
declare global {
  interface Window {
    shipCustomizationScene?: ShipCustomizationControl
  }
}

/** Controlled external API; every observation still travels through the real controller. */
function createScene() {
  let server = initialState()
  let pending: {
    action: ShipAppearanceAction
    resolve: (value: ShipAppearanceState) => void
    reject: () => void
    requestId: string
    signal: AbortSignal
  } | null = null
  const controller = new ShipAppearancesController(
    async (action, signal, requestId) => {
      if (action.type === 'Load')
        return { ...structuredClone(server), request_id: requestId }
      if (pending)
        throw Error('The scene already has an unacknowledged mutation')
      return new Promise<ShipAppearanceState>((resolve, reject) => {
        const abort = () => {
          pending = null
          reject(new DOMException('Scene request aborted', 'AbortError'))
        }
        signal.addEventListener('abort', abort, { once: true })
        pending = {
          action: structuredClone(action),
          requestId,
          signal,
          reject: () => {
            signal.removeEventListener('abort', abort)
            reject(Error('Controlled response loss'))
          },
          resolve: (value) => {
            signal.removeEventListener('abort', abort)
            resolve(value)
          },
        }
      })
    },
  )
  const control: ShipCustomizationControl = {
    snapshot: () => structuredClone(server),
    pending: () => (pending ? structuredClone(pending.action) : null),
    observe: async (snapshot) => {
      server = structuredClone(snapshot)
      await controller.reload()
    },
    accept: (snapshot) => {
      if (!pending || pending.signal.aborted)
        throw Error('No active mutation to acknowledge')
      const request = pending
      pending = null
      server = structuredClone(snapshot)
      request.resolve({
        ...structuredClone(server),
        request_id: request.requestId,
      })
    },
    loseResponse: (committed) => {
      server = structuredClone(committed)
      control.reject()
    },
    reject: () => {
      if (!pending || pending.signal.aborted)
        throw Error('No active mutation to reject')
      const request = pending
      pending = null
      request.reject()
    },
    dispose: controller.stop,
  }
  return { controller, control }
}

export function ShipCustomizationScenario() {
  const [scene] = useState(createScene)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    window.shipCustomizationScene = scene.control
    const stop = scene.controller.start()
    return () => {
      stop()
      if (window.shipCustomizationScene === scene.control)
        delete window.shipCustomizationScene
    }
  }, [scene])
  return (
    <ShipAppearancesContext.Provider value={scene.controller}>
      <main style={{ padding: 24 }}>
        <h1>Shipyard</h1>
        <Button onClick={() => setOpen(true)}>Customize Light Fighter</Button>
        {open && (
          <ShipCustomizer
            target="LightFighter"
            onClose={() => setOpen(false)}
          />
        )}
      </main>
    </ShipAppearancesContext.Provider>
  )
}
