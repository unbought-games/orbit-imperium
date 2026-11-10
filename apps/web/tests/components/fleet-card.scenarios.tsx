import { useState } from 'react'
import { useRouter, useRouterState } from '@tanstack/react-router'
import { FleetPresentationRoutes } from './galaxy-fleet.scenarios'
import {
  fleetPresentationFixture,
  fleetFixtureTime,
} from '../../src/test-support/fleet-presentation'
import { id } from '../../src/test-support/bootstrap'
import {
  MissionFleetCardPresentation,
  FleetRecallPresentation,
} from '../../src/features/mission-fleet-card'
import { IncomingFleet } from '../../src/features/incoming-fleet'
import { Button } from '../../src/ui/button'
import type { components } from '../../src/contracts'
import styles from '../../src/features/mission-fleets.module.css'

type S = components['schemas']

function CardExamples({ as }: { as: 'article' | 'li' }) {
  const [fixture] = useState(fleetPresentationFixture)
  const [pending, setPending] = useState(false)
  const [recalls, setRecalls] = useState(0)
  const [revision, setRevision] = useState(0)
  const [details, setDetails] = useState(false)
  const [visibility, setVisibility] = useState<'Exact' | 'Total' | 'Unknown'>(
    'Exact',
  )
  const router = useRouter()
  const destination = useRouterState({
    select: (state) => state.location.pathname,
  })
  const view = structuredClone(fixture.view)
  const own: S['OwnMission4'] = {
    ...fixture.fleet,
    intent: {
      ...fixture.fleet.intent,
      mission: 'Attack',
      destination: {
        type: 'Body',
        id: id(91),
        expected_kind: 'Planet',
        expected_owner: id(90),
      },
      ships: [
        { owner: view.binding.player, ship_type: 'LargeCargo', count: '2' },
        { owner: view.binding.player, ship_type: 'Cruiser', count: '11' },
      ],
    },
    leg: 'Outbound',
    can_recall: true,
    ships: [
      { ship_type: 'LargeCargo', count: '2' },
      { ship_type: 'Cruiser', count: '11' },
    ],
    destination: { galaxy: 1, system: 19, position: 9 },
    due_at: fleetFixtureTime + 600_000,
  }
  const incoming: S['IncomingMission4'] = {
    sender: id(90),
    origin: { galaxy: 1, system: 19, position: 9 },
    origin_body: id(91),
    target: fixture.body.id,
    mission: 'Attack',
    arrival_at: fleetFixtureTime + 360_000,
    ships:
      visibility === 'Exact'
        ? {
            visibility: 'Exact',
            total: '30',
            ships: [{ ship_type: 'Cruiser', count: '30' }],
          }
        : visibility === 'Total'
          ? { visibility: 'Total', total: '30' }
          : { visibility: 'Unknown' },
  }
  view.player_names = { [id(90)]: 'Commander Vega' }
  view.destinations = [
    {
      id: id(91),
      kind: 'Planet',
      name: 'Vega Prime',
      coordinates: incoming.origin,
    },
  ]
  const List = as === 'li' ? 'ol' : 'div'
  return (
    <main style={{ padding: 16 }}>
      <Button
        onClick={() => {
          void router.navigate({ to: '/' })
        }}
      >
        Reset route
      </Button>
      <Button onClick={() => setRevision(revision + 1)}>
        Refresh fleet snapshot
      </Button>
      <Button onClick={() => setDetails(!details)}>Toggle detail mode</Button>
      <Button onClick={() => setVisibility('Total')}>
        Show total intelligence
      </Button>
      <Button onClick={() => setVisibility('Unknown')}>
        Hide intelligence
      </Button>
      <output aria-label="Card route">{destination}</output>
      <output aria-label="Recall callbacks">{recalls}</output>
      <List className={styles.list} style={{ padding: 0, margin: '20px 0' }}>
        <MissionFleetCardPresentation
          key={String(details)}
          as={as}
          view={view}
          fleet={own}
          detail={details}
          origin={fixture.body.id}
          universeName="Andromeda"
          now={fleetFixtureTime + revision * 1000}
          tutorial={null}
          actions={
            <FleetRecallPresentation
              fleet={own}
              pending={pending}
              now={fleetFixtureTime + revision * 1000}
              onRecall={() => {
                setRecalls(recalls + 1)
                setPending(true)
              }}
            />
          }
        />
        <IncomingFleet
          as={as}
          fleet={incoming}
          view={view}
          now={fleetFixtureTime + revision * 1000}
        />
      </List>
    </main>
  )
}

export function FleetArticleScenario() {
  return (
    <FleetPresentationRoutes>
      <CardExamples as="article" />
    </FleetPresentationRoutes>
  )
}
export function FleetListScenario() {
  return (
    <FleetPresentationRoutes>
      <CardExamples as="li" />
    </FleetPresentationRoutes>
  )
}
