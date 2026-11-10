import { useRef, useState } from 'react'
import { FleetPresentationRoutes } from './galaxy-fleet.scenarios'
import { fleetPresentationFixture } from '../../src/test-support/fleet-presentation'
import { id } from '../../src/test-support/bootstrap'
import { GalaxyPosition } from '../../src/features/galaxy-position'
import { GalaxyHarvestPresentation } from '../../src/features/galaxy-harvest-action'
import {
  galaxyHarvest,
  harvestCountError,
} from '../../src/client-model/galaxy-harvest'
import { createGameStore } from '../../src/client-model/game-store'
import { colonizationStatus } from '../../src/client-model/colonization'
import { Button } from '../../src/ui/button'
import type { components } from '../../src/contracts'
import styles from '../../src/features/galaxy.module.css'

type S = components['schemas']
const fields = [
  { metal: '300000', crystal: '180000', deuterium: '60000' },
  { metal: '999999999', crystal: '123456789', deuterium: '0' },
  { metal: '0', crystal: '0', deuterium: '40001' },
  { metal: '300000', crystal: '180000', deuterium: '0' },
  { metal: '0', crystal: '400' },
]

export function GalaxyPositionScenario() {
  const [fixture] = useState(fleetPresentationFixture)
  const [baseState] = useState(() => createGameStore().getState())
  const [blocked, setBlocked] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const [edit, setEdit] = useState<string | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const view = structuredClone(fixture.view)
  view.bodies[0].inventories = [
    { item: { kind: 'Ship', id: 'Recycler' }, count: blocked ? '0' : '30' },
  ]
  view.missions.fleets = []
  view.missions.fleet_slots = blocked ? '0' : '3'
  view.capabilities = [
    { capability: 'Harvest', enabled: true, reason: 'Available' },
  ]
  view.catalog = [
    {
      key: { kind: 'Ship', id: 'Recycler' },
      enabled: true,
      mobile: true,
      body_kinds: ['Planet'],
      requirements: [],
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
    },
  ]
  const positions: S['GalaxyPosition4'][] = fields.map((debris, index) => ({
    coordinates: { galaxy: 1, system: 371, position: index + 2 },
    body:
      index < 2
        ? {
            id: id(21 + index),
            owner: id(31 + index),
            kind: 'Planet',
            activity: { type: 'None' },
            inactivity: 'Active',
            vacation: false,
            espionage_eligible: true,
          }
        : null,
    debris: { ...debris, field_identity: id(42 + index) },
  }))
  const position =
    positions.find((item) => item.coordinates.position === selected) ??
    positions[0]
  const state = { ...baseState, binding: view.binding, view, ready: true }
  const availability = galaxyHarvest(state, fixture.body.id, position)
  const count = edit ?? availability.suggested
  const open = selected !== null
  return (
    <FleetPresentationRoutes>
      {/* Galaxy cancels its caller's inline gutter on mobile. Preserve that
          container contract without mounting the session-owning game shell. */}
      <main style={{ paddingInline: 'var(--shell-inline-gutter)' }}>
        <div className={styles.screen}>
          <Button onClick={() => setBlocked(!blocked)}>
            Toggle blocked harvest
          </Button>
          <section className={styles.positions} aria-label="Galaxy positions">
            <ul className={styles.positionList}>
              {positions.map((item) => (
                <li key={item.coordinates.position}>
                  <GalaxyPosition
                    position={item}
                    player={view.binding.player}
                    origin={fixture.body.id}
                    playerNames={{
                      [id(31)]: 'CommanderAndromedaTheUnreasonablyLongName',
                      [id(32)]: 'Vega',
                    }}
                    missions={{
                      transport: true,
                      attack: true,
                      deploy: true,
                      harvest: true,
                    }}
                    colony={colonizationStatus(view, item.coordinates.position)}
                    onDraft={(at, mission, element) => {
                      if (mission !== 'Harvest') return
                      opener.current = element ?? null
                      setSelected(at.position)
                      setEdit(null)
                    }}
                    espionage={{
                      send: () => {},
                      busy: false,
                      reason: null,
                      error: null,
                    }}
                  />
                </li>
              ))}
            </ul>
          </section>
          <GalaxyHarvestPresentation
            harvest={{
              ...availability,
              count,
              setEdit,
              invalid: harvestCountError(count, availability.available),
              send: async () => {},
              error: '',
              busy: false,
              paused: false,
              uncertain: false,
              commandId: null,
            }}
            position={position}
            open={open}
            onClose={() => setSelected(null)}
            onCustomize={() => setSelected(null)}
            returnFocusRef={opener}
            onRecover={() => {}}
          />
        </div>
      </main>
    </FleetPresentationRoutes>
  )
}
