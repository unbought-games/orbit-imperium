import { useRef, useState, type ReactNode } from 'react'
import { createAppRouter } from '../../src/router'
import {
  createMemoryHistory,
  RouterContextProvider,
} from '@tanstack/react-router'
import { GalaxyHarvestPresentation } from '../../src/features/galaxy-harvest-action'
import { GalaxyActionMenu } from '../../src/features/galaxy-action-menu'
import { GalaxyFlightSummary } from '../../src/features/galaxy-flight-summary'
import { GalaxyPlayerStatuses } from '../../src/features/galaxy-player-status'
import { FleetInventoryView } from '../../src/features/fleet-inventory'
import {
  fleetPresentationFixture,
  fleetFixtureTime,
} from '../../src/test-support/fleet-presentation'
import {
  harvestCountError,
  harvestSuggestion,
  type HarvestPosition,
} from '../../src/client-model/galaxy-harvest'
import type { GalaxyFlight } from '../../src/client-model/galaxy-fleets'
import { Button } from '../../src/ui/button'
import type { components } from '../../src/contracts'

type S = components['schemas']

function Routes({ children }: { children: ReactNode }) {
  const [router] = useState(() =>
    createAppRouter({
      history: createMemoryHistory({ initialEntries: ['/'] }),
    }),
  )
  return (
    <RouterContextProvider router={router}>{children}</RouterContextProvider>
  )
}

export function GalaxyHarvestScenario() {
  const opener = useRef<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState('')
  const [blocked, setBlocked] = useState(false)
  const [target, setTarget] = useState(2)
  const position: HarvestPosition = {
    coordinates: { galaxy: 1, system: 371, position: target },
    debris: {
      field_identity: 'field',
      metal: '180000',
      crystal: '120000',
      deuterium: '20000',
    },
  }
  const suggestion = harvestSuggestion(
    '180000',
    '120000',
    '20000',
    '8',
    '20000',
  )
  const count = edit ?? suggestion.suggested
  return (
    <main style={{ padding: 16 }}>
      <Button onClick={() => setBlocked(!blocked)}>
        Toggle unavailable ships
      </Button>
      <Button onClick={() => setTarget(target === 2 ? 3 : 2)}>
        Change target
      </Button>
      <div
        style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 60 }}
      >
        <GalaxyActionMenu
          target="[1:371:2]"
          coordinates={position.coordinates}
          actions={[{ mission: 'Harvest' }]}
          missileIdentity="stable-row"
          onDraft={(_at, _mission, element) => {
            opener.current = element ?? null
            setOpen(true)
          }}
        />
      </div>
      <GalaxyHarvestPresentation
        open={open}
        position={position}
        returnFocusRef={opener}
        onClose={() => setOpen(false)}
        onCustomize={() => {
          setSubmitted(`Customize ${count} at ${target}`)
          setOpen(false)
        }}
        onRecover={() => setSubmitted('Recover')}
        harvest={{
          ...suggestion,
          available: '8',
          count,
          blockers: blocked
            ? [
                'No recyclers available on the selected planet.',
                'No fleet slots available. Wait for a fleet to return.',
              ]
            : [],
          setEdit,
          invalid: harvestCountError(count, '8'),
          send: async () => {
            setSubmitted(`Submit ${count} at ${target}`)
            setOpen(false)
          },
          error: '',
          busy: false,
          paused: false,
          uncertain: false,
          commandId: null,
        }}
      />
      <output aria-label="Harvest callback">{submitted}</output>
    </main>
  )
}

export function FleetInventoryScenario() {
  const [fixture] = useState(fleetPresentationFixture)
  const [origin, setOrigin] = useState(fixture.body.id)
  const [groups, setGroups] = useState(false)
  const [empty, setEmpty] = useState(false)
  const [catalogAvailable, setCatalogAvailable] = useState(true)
  const view = structuredClone(fixture.view)
  if (groups)
    view.bodies[0].inventories = [
      { item: { kind: 'Ship', id: 'SmallCargo' }, count: '42' },
      { item: { kind: 'Ship', id: 'LightFighter' }, count: '16' },
      { item: { kind: 'Ship', id: 'SolarSatellite' }, count: '8' },
    ]
  if (!catalogAvailable) view.catalog = []
  if (empty) {
    view.bodies[0].inventories = []
    view.missions.fleets = []
    view.progression.manufacturing = []
  }
  return (
    <Routes>
      <main style={{ padding: 16 }}>
        <Button
          onClick={() =>
            setOrigin(
              origin === fixture.body.id ? fixture.moon.id : fixture.body.id,
            )
          }
        >
          Switch world
        </Button>
        <Button onClick={() => setGroups(true)}>Show all groups</Button>
        <Button onClick={() => setEmpty(true)}>Clear inventory</Button>
        <Button onClick={() => setCatalogAvailable(false)}>
          Clear catalog
        </Button>
        <FleetInventoryView view={view} origin={origin} universe="Andromeda" />
      </main>
    </Routes>
  )
}

export function GalaxyDisclosureScenario() {
  const [revision, setRevision] = useState(0)
  const [inactiveLong, setInactiveLong] = useState(false)
  const flights: GalaxyFlight[] = Array.from({ length: 6 }, (_, index) => ({
    id: `fleet-${index}`,
    mission: index % 2 ? ('Harvest' as const) : ('Espionage' as const),
    dueAt: fleetFixtureTime + 60_000 + index * 1000,
    phase: 'en route' as const,
  })).filter((_, index) => revision === 0 || index !== 0)
  const body: NonNullable<S['GalaxyPosition4']['body']> = {
    id: 'target',
    owner: 'other',
    kind: 'Planet',
    vacation: true,
    inactivity: inactiveLong ? 'Inactive28' : 'Inactive7',
    activity: { type: 'None' },
    espionage_eligible: false,
  }
  return (
    <main style={{ padding: 24 }}>
      <Button onClick={() => setRevision(revision + 1)}>
        Refresh snapshot
      </Button>
      <Button onClick={() => setInactiveLong(true)}>
        Mark long inactivity
      </Button>
      <GalaxyPlayerStatuses body={body} protectedTarget />
      <GalaxyFlightSummary
        flights={flights}
        now={fleetFixtureTime + revision * 1000}
        target="[1:371:2]"
      />
      <Button>Outside target</Button>
    </main>
  )
}
