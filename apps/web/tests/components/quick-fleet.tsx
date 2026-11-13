import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { createDispatchFixture, type DispatchFixture } from './dispatch-fixture'
import { originId, id } from './dispatch-data'
import { GalaxyHarvestAction } from '../../src/features/galaxy-harvest-action'
import { useGalaxyEspionage } from '../../src/features/use-galaxy-espionage'
import { GalaxySpyButton } from '../../src/features/galaxy-spy-button'
import { ErrorBannerProvider, ErrorBannerSlot } from '../../src/ui/error-banner'
import { Button } from '../../src/ui/button'
import { FleetPresentationRoutes } from './galaxy-fleet.scenarios'
import type { components } from '../../src/contracts'

type S = components['schemas']
declare global {
  interface Window {
    quickFleet?: DispatchFixture
  }
}
const position = {
  coordinates: { galaxy: 1, system: 371, position: 2 },
  debris: { field_identity: id(42), metal: '40000', crystal: '10000' },
}
const target: NonNullable<S['GalaxyPosition4']['body']> = {
  id: id(20),
  owner: id(30),
  kind: 'Planet',
  activity: { type: 'None' },
  inactivity: 'Active',
  vacation: false,
  espionage_eligible: true,
}
function Controls({ fixture }: { fixture: DispatchFixture }) {
  const { model } = fixture
  const state = useStore(model.store)
  const opener = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [selection, setSelection] = useState(0)
  const espionage = useGalaxyEspionage(model, originId)
  return (
    <ErrorBannerProvider model={model}>
      <main style={{ padding: 20 }}>
        <ErrorBannerSlot model={model} />
        <Button
          ref={opener}
          onClick={() => {
            setSelection((value) => value + 1)
            setOpen(true)
          }}
        >
          Harvest
        </Button>
        {[target, { ...target, id: id(21), kind: 'Moon' as const }].map(
          (body) => {
            const spy = espionage.forTarget(body)
            return (
              <GalaxySpyButton
                key={body.id}
                name={body.kind}
                onSend={spy.send}
                {...spy}
              />
            )
          },
        )}
        <GalaxyHarvestAction
          key={selection}
          model={model}
          origin={originId}
          position={position}
          open={open}
          onClose={() => setOpen(false)}
          onCustomize={() => setOpen(false)}
          returnFocusRef={opener}
        />
        <output aria-label="Active fleet orders">{state.attempts.size}</output>
      </main>
    </ErrorBannerProvider>
  )
}
export function QuickFleetScene() {
  const [fixture, setFixture] = useState<DispatchFixture | null>(null)
  useEffect(() => {
    let disposed = false
    let active: DispatchFixture | undefined
    void createDispatchFixture().then(async (next) => {
      active = next
      if (disposed) {
        next.dispose()
        return
      }
      const { view } = next.snapshot()
      view.bodies[0].inventories = [
        { item: { kind: 'Ship', id: 'Recycler' }, count: '5' },
        { item: { kind: 'Ship', id: 'EspionageProbe' }, count: '3' },
      ]
      view.catalog = view.catalog.map((entry) =>
        entry.key.kind === 'Ship' && entry.key.id === 'Recycler'
          ? {
              ...entry,
              ship_statistics: {
                combat: null,
                propulsion: {
                  cargo_capacity: '20000',
                  base_speed: '2000',
                  fuel_consumption: '300',
                  drive: 'CombustionDrive',
                  impulse_upgrade: null,
                },
              },
            }
          : entry,
      )
      await next.configure({ view })
      if (disposed) {
        next.dispose()
        return
      }
      window.quickFleet = next
      setFixture(next)
    })
    return () => {
      disposed = true
      delete window.quickFleet
      active?.dispose()
    }
  }, [])
  return fixture ? (
    <FleetPresentationRoutes>
      <Controls fixture={fixture} />
    </FleetPresentationRoutes>
  ) : null
}
