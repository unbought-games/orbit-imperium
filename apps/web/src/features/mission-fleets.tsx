import { AttackGroups } from './attack-groups'
import { AllianceDepot } from './alliance-depot'
import { useStore } from 'zustand'
import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import { occupiedFleetSlots } from '../client-model/game-projection'
import { useProfileSource } from '../shell/player-profiles-context'
import { useUniverseName } from '../shell/session-context'
import { routeTarget } from '../shell/route-target'
import { ButtonLink } from '../ui/button'
import { Link } from '../ui/link'
import { TaskHeader } from '../ui/task-header'
import { FleetSlots } from './fleet-slots'
import { FleetInventory } from './fleet-inventory'
import { FleetTraffic } from './fleet-traffic'
import styles from './missions.module.css'
import fleetStyles from './mission-fleets.module.css'
type S = components['schemas']

export function MissionFleets({
  model,
  view,
  item,
  origin,
}: {
  model: Coordinator
  view: S['BoundView4']
  item: string | null
  origin: string
}) {
  const universeName = useUniverseName()
  const state = useStore(model.store)
  useProfileSource(item ? null : { type: 'Incoming' }, view.viewer_revision)
  return (
    <section className={styles.screen}>
      <TaskHeader title={item ? 'Mission details' : 'Fleets'}>
        <div className={fleetStyles.headerActions}>
          {item && (
            <Link
              data-touch-control=""
              {...routeTarget(universeName, 'fleets', origin)}
            >
              All fleets
            </Link>
          )}
          {!item && (
            <ButtonLink
              variant="secondary"
              size="small"
              {...routeTarget(universeName, 'shipyard', origin)}
            >
              Shipyard
            </ButtonLink>
          )}
          <div className={fleetStyles.dispatchActions}>
            <FleetSlots
              used={occupiedFleetSlots(state)}
              total={view.missions.fleet_slots}
            />
            <ButtonLink
              size="small"
              {...routeTarget(universeName, 'dispatch', origin)}
            >
              Dispatch Fleet
            </ButtonLink>
          </div>
        </div>
      </TaskHeader>
      {!item && <FleetInventory model={model} origin={origin} />}
      {!item && <AttackGroups model={model} view={view} />}
      <FleetTraffic model={model} view={view} item={item} origin={origin} />
      {!item &&
        view.bodies
          .filter((b) => (view.holdings ?? []).some((f) => f.target === b.id))
          .map((body) => (
            <AllianceDepot
              key={body.id}
              model={model}
              view={view}
              body={body}
            />
          ))}
    </section>
  )
}
