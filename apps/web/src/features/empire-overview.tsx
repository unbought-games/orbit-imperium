import { useStore } from 'zustand'
import {
  currentServerTime,
  pendingFleetCargo,
} from '../client-model/game-projection'
import { MissileFlight } from './missile-flight'
import { FleetCargo } from './fleet-cargo'
import { IncomingFleet } from './incoming-fleet'
import { incomingKey } from './command-hud/model'
import { MissionFleetCard } from './mission-fleet-card'
import { EmptyState } from '../ui/empty-state'
import { CoordinateLink } from './coordinate-link'
import { PlanetActions } from './planet-actions'
import { PlanetRename } from './planet-rename'
import type { Coordinator } from '../client-model/coordinator'
import { PlayerName } from './player-name'
import { useProfileSource } from '../shell/player-profiles-context'
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRight,
  Crosshair,
  Globe2,
  Rocket,
  Hourglass,
  Orbit,
  Radar,
  ShieldAlert,
  Shield,
} from 'lucide-react'
import type { CSSProperties } from 'react'
import type { BoundView } from '../client-model/commands'
import { resourceNames } from '../client-model/resources'
import { useCountdown } from '../client-model/use-clock'
import { useGameSession } from '../shell/session-context'
import { routeTarget } from '../shell/route-target'
import { resolveDestination, type Page } from '../shell/routes'
import { Link } from '../ui/link'
import { ResourceNumber, ResourceQuantity } from '../ui/number-value'
import { ResourceMark } from '../ui/resource-mark'
import { InfoTooltip } from '../ui/info-tooltip'
import { bodyName, coordinates, label } from '../ui/format'
import { currentResourceRates } from '../ui/resource-rates'
import { BodyIllustration } from './body-illustration'
import { WorkSummaries } from './work-summaries'
import {
  bodyTraffic,
  empireFlights,
  empireNodes,
  empirePaths,
  empireTotals,
  planetPhysicalFacts,
  storagePercent,
  type EmpireFlight,
} from './empire-model'
import styles from './empire-overview.module.css'

type Body = BoundView['bodies'][number]

function Destination({
  view,
  body,
  page,
  children,
  className,
}: {
  view: BoundView
  body: string
  page: Page
  children: React.ReactNode
  className?: string
}) {
  const { universeName } = useGameSession()
  return resolveDestination(
    { universe: view.binding.universe, body, page },
    view,
  ).available ? (
    <Link
      data-touch-control=""
      className={className}
      {...routeTarget(universeName, page, body)}
    >
      {children}
    </Link>
  ) : null
}

function FlightList({
  flights,
  view,
  body,
  fullRows = false,
}: {
  flights: EmpireFlight[]
  view: BoundView
  body: string
  fullRows?: boolean
}) {
  useProfileSource(
    flights.some((f) => f.sender) ? { type: 'Incoming' } : null,
    view.viewer_revision,
  )
  const countdown = useCountdown(view.sampled_at, 'compact')
  const { universeName, model } = useGameSession()
  const now = useStore(model.store, currentServerTime)
  const available = resolveDestination(
    { universe: view.binding.universe, page: 'fleets', body },
    view,
  ).available
  const ownFleets =
    fullRows && view.protocol === 4
      ? new Map(view.missions.fleets.map((fleet) => [fleet.id, fleet]))
      : null
  const incomingFleets =
    fullRows && view.protocol === 4
      ? new Map(
          view.missions.incoming.map((fleet, index) => [
            `incoming:${index}`,
            fleet,
          ]),
        )
      : null
  const ownMissiles =
    fullRows && view.protocol === 4
      ? new Map(
          (view.missiles ?? [])
            .filter((flight) => flight.outgoing)
            .map((flight) => [flight.id, flight]),
        )
      : null
  return (
    <ol className={fullRows ? styles.fleetRows : styles.flightList}>
      {flights.map((flight) => {
        const fleet =
          flight.kind === 'fleet' ? ownFleets?.get(flight.key) : undefined
        if (fullRows && view.protocol === 4 && fleet) {
          return (
            <MissionFleetCard
              key={flight.key}
              as="li"
              model={model}
              view={view}
              fleet={fleet}
              detail={false}
              origin={body}
              linkEnabled={available}
            />
          )
        }
        const incoming =
          flight.kind === 'fleet' ? incomingFleets?.get(flight.key) : undefined
        if (fullRows && view.protocol === 4 && incoming) {
          return (
            <IncomingFleet
              key={incomingKey(incoming)}
              as="li"
              fleet={incoming}
              view={view}
              now={now}
            />
          )
        }
        const missile =
          flight.kind === 'missile' ? ownMissiles?.get(flight.key) : undefined
        if (fullRows && view.protocol === 4 && missile) {
          return (
            <MissileFlight
              key={flight.key}
              as="li"
              flight={missile}
              view={view}
              now={now}
              origin={body}
              linkEnabled={available}
            />
          )
        }
        return (
          <li
            key={flight.key}
            className={`${styles.flightEntry} ${flight.hostile ? styles.combatFlight : styles.peacefulFlight}`}
          >
            <span className={styles.flightIcon}>
              {flight.hostile ? (
                <ShieldAlert size={18} />
              ) : flight.leg === 'Outbound' ? (
                <ArrowUpRight size={18} />
              ) : (
                <ArrowDownLeft size={18} />
              )}
            </span>
            <div className={styles.flightCopy}>
              <div className={styles.flightHeading}>
                <strong>{flight.mission}</strong>
                <span className={styles.leg}>{flight.leg}</span>
                <time
                  dateTime={new Date(flight.due).toISOString()}
                  title={new Date(flight.due).toLocaleString()}
                >
                  {countdown(flight.due)}
                </time>
              </div>
              {flight.sender && (
                <small>
                  From{' '}
                  <PlayerName
                    player={flight.sender}
                    names={view.protocol === 4 ? view.player_names : undefined}
                  />
                </small>
              )}
              <span className={styles.route}>{flight.route}</span>
              <small>{flight.ships || 'No ships reported'}</small>
              {flight.kind === 'fleet' && flight.leg !== 'Incoming' && (
                <FleetCargo cargo={flight.cargo} />
              )}
            </div>
            {available && (
              <Link
                data-touch-control=""
                className={styles.flightLink}
                {...routeTarget(universeName, 'fleets', body, flight.item)}
                aria-label={`View ${flight.mission} ${flight.leg.toLowerCase()} fleet`}
              >
                <ArrowRight size={16} />
              </Link>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function CommandMap({
  view,
  body,
  flights,
}: {
  view: BoundView
  body: Body
  flights: EmpireFlight[]
}) {
  const { universeName, model } = useGameSession()
  const nodes = empireNodes(view.bodies)
  const traffic = bodyTraffic(flights, body.id)
  return (
    <section className={styles.commandMap} aria-label="Empire orbital network">
      <div className={styles.mapHeading}>
        <span>
          <Crosshair size={14} /> Orbital network
        </span>
        <span>Schematic · not to scale</span>
      </div>
      <div className={styles.starfield} aria-hidden="true" />
      <div
        className={`${styles.mapStage} ${nodes.length > 8 ? styles.denseMap : ''}`}
      >
        <svg
          className={styles.orbits}
          viewBox="0 0 1000 600"
          preserveAspectRatio="none"
          fill="none"
          aria-hidden="true"
        >
          <ellipse cx="500" cy="300" rx="340" ry="192" />
          <ellipse cx="500" cy="300" rx="390" ry="235" strokeDasharray="2 9" />
          <ellipse cx="500" cy="300" rx="240" ry="150" />
          <path d="M500 20V580M30 300H970" strokeDasharray="2 12" />
          {empirePaths(nodes, flights).map((route) => (
            <path
              className={styles.flightPath}
              key={route.key}
              d={route.path}
            />
          ))}
        </svg>
        <div className={styles.focusPlanet}>
          <div className={styles.reticle} aria-hidden="true" />
          <BodyIllustration
            body={body}
            className={styles.heroArt}
            sizes="320px"
          />
          <div className={styles.focusLabel}>
            <span>Command focus</span>
            <strong>
              {bodyName(body)}{' '}
              <CoordinateLink
                at={body.coordinates}
                target={body.kind === 'Moon' ? 'moon' : 'planet'}
              />
            </strong>
            <small>
              {traffic.incoming.length} inbound / {traffic.outgoing.length}{' '}
              outbound
            </small>
          </div>
        </div>
        <div
          className={nodes.length > 8 ? styles.nodeRoster : styles.nodeLayer}
        >
          {nodes.map(({ body: node, x, y }) => (
            <Link
              data-touch-control=""
              key={node.id}
              {...routeTarget(universeName, 'overview', node.id)}
              onClick={() => void model.recordPresence('BodyVisit', node.id)}
              className={`${styles.mapNode} ${node.id === body.id ? styles.selectedNode : ''}`}
              style={
                { '--node-x': `${x}%`, '--node-y': `${y}%` } as CSSProperties
              }
              aria-label={`Focus ${bodyName(node)} ${coordinates(node)}`}
              aria-current={node.id === body.id ? 'true' : undefined}
            >
              <BodyIllustration
                body={node}
                className={styles.nodeArt}
                sizes="72px"
              />
              <span>
                {bodyName(node)} <b>{coordinates(node)}</b>
              </span>
            </Link>
          ))}
        </div>
      </div>
      <div className={styles.mapFooter}>
        <span>
          <i /> {view.bodies.length} controlled bodies
        </span>
        <Destination view={view} body={body.id} page="galaxy">
          Explore galaxy <ArrowUpRight size={14} />
        </Destination>
      </div>
    </section>
  )
}

function FleetBoard({
  view,
  body,
  flights,
}: {
  view: BoundView
  body: Body
  flights: EmpireFlight[]
}) {
  const threats = flights.filter((f) => f.hostile).length
  const fleetAvailable = resolveDestination(
    { universe: view.binding.universe, body: body.id, page: 'fleets' },
    view,
  ).available
  return (
    <section className={styles.fleetBoard} aria-label="Fleet movements">
      <div className={styles.panelHeading}>
        <div>
          <p className={styles.eyebrow}>Traffic control</p>
          <h3>Fleet movements</h3>
        </div>
        <span className={styles.counter}>
          {String(flights.length).padStart(2, '0')}
        </span>
      </div>
      <div className={`${styles.fleetStatus} ${threats ? styles.warning : ''}`}>
        <span className={styles.statusDot} />
        {!fleetAvailable
          ? 'Fleet missions unavailable in this universe'
          : threats
            ? `${threats} incoming hostile fleet${threats === 1 ? '' : 's'} detected`
            : 'No incoming hostile fleets detected'}
      </div>
      <div className={styles.fleetBody}>
        {flights.length ? (
          <FlightList flights={flights} view={view} body={body.id} fullRows />
        ) : (
          <EmptyState
            icon={Radar}
            variant="compact"
            headingLevel={3}
            title="The lanes are quiet."
            description="No visible fleet movements. Your next move starts here."
          />
        )}
      </div>
      <Destination
        view={view}
        body={body.id}
        page="fleets"
        className={styles.boardLink}
      >
        Fleet command <ArrowRight size={16} />
      </Destination>
    </section>
  )
}

function PlanetClimate({
  view,
  body,
  temperature,
}: {
  view: BoundView
  body: Body
  temperature?: string
}) {
  if (body.kind !== 'Planet') return null
  const satellite =
    view.protocol !== 2
      ? view.progression.production.find(
          (production) => production.body === body.id,
        )?.solar_satellite
      : undefined
  return (
    <InfoTooltip
      className={styles.climate}
      label={temperature ?? 'Temperature unavailable'}
      description={
        <>
          Maximum temperature affects deuterium production and solar satellite
          energy output.
          {satellite && (
            <>
              <br />
              <br />
              Each solar satellite produces{' '}
              <ResourceQuantity
                resource="energy"
                value={satellite.unit_energy}
              />{' '}
              at 100% production.
            </>
          )}
          {temperature === undefined && (
            <>
              <br />
              <br />
              This server has not supplied temperature metadata for this planet.
            </>
          )}
        </>
      }
    >
      {temperature ?? 'Temperature unavailable'}
    </InfoTooltip>
  )
}

function StationedUnits({
  body,
  kind,
}: {
  body: Body
  kind: 'Ship' | 'Defense'
}) {
  const items = body.inventories.filter(
    (entry) => entry.item.kind === kind && BigInt(entry.count) > 0n,
  )
  const title = kind === 'Ship' ? 'Orbital fleet' : 'Planetary defenses'
  const Icon = kind === 'Ship' ? Orbit : Shield
  const total = items.reduce((sum, item) => sum + BigInt(item.count), 0n)
  const unit = kind === 'Ship' ? 'ship' : 'defense'
  return (
    <details className={styles.inventory}>
      <summary>
        <span>
          <Icon size={15} /> {title}
        </span>
        <span>
          {total.toLocaleString('en-US')} {unit}
          {total === 1n ? '' : 's'}
        </span>
      </summary>
      <section aria-label={title}>
        {items.length ? (
          <dl>
            {items.map((item) => (
              <div key={item.item.id}>
                <dt>{label(item.item.id)}</dt>
                <dd>{item.count}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <EmptyState
            icon={Icon}
            variant="compact"
            headingLevel={3}
            title={
              kind === 'Ship'
                ? 'No ships stationed here.'
                : 'No defenses stationed here.'
            }
          />
        )}
      </section>
    </details>
  )
}

function PlanetDossier({
  model,
  view,
  body,
  selected,
  flights,
}: {
  view: BoundView
  body: Body
  selected: boolean
  model: Coordinator
  flights: EmpireFlight[]
}) {
  const physicalFacts = planetPhysicalFacts(body)
  const rates = currentResourceRates(view, body)
  const traffic = bodyTraffic(flights, body.id)
  const energy = BigInt(body.energy.supply) - BigInt(body.energy.demand)
  const research =
    view.protocol !== 2 && view.progression.research_operation?.host === body.id
  return (
    <article
      className={`${styles.dossier} ${selected ? styles.selectedDossier : ''}`}
      aria-label={`${bodyName(body)} ${coordinates(body)} dossier`}
    >
      <header className={styles.planetHeader}>
        <BodyIllustration
          body={body}
          className={styles.cardArt}
          sizes="100px"
        />
        <div>
          <span className={styles.kicker}>
            {view.protocol === 4 &&
            body.kind === 'Planet' &&
            body.id === view.homeworld_id
              ? 'Homeworld'
              : body.kind}
            {selected && <b>Command focus</b>}
          </span>
          {view.protocol === 4 && body.kind === 'Planet' ? (
            <PlanetRename model={model} body={body} />
          ) : (
            <h3 className={styles.planetName}>{bodyName(body)}</h3>
          )}
          <span className={styles.planetCoordinates}>
            <CoordinateLink
              at={body.coordinates}
              target={body.kind === 'Moon' ? 'moon' : 'planet'}
            />
          </span>
          <span className={styles.bodyFacts}>
            {body.fields_used}/{body.fields} fields · {body.fields_reserved}{' '}
            reserved
          </span>
          {body.kind === 'Planet' && (
            <span className={styles.bodyFacts}>
              {physicalFacts.diameter && `${physicalFacts.diameter} · `}
              <PlanetClimate
                view={view}
                body={body}
                temperature={physicalFacts.temperature}
              />
            </span>
          )}
        </div>
        <Destination
          view={view}
          body={body.id}
          page="resources"
          className={styles.openPlanet}
        >
          <ArrowUpRight size={20} />
          <span className={styles.srOnly}>
            Manage {bodyName(body)} {coordinates(body)}
          </span>
        </Destination>
        {view.protocol === 4 && body.kind === 'Planet' && (
          <PlanetActions model={model} body={body} />
        )}
      </header>
      <dl className={styles.resources} aria-label="Planet resources">
        {resourceNames.map((name) => (
          <div
            key={name}
            style={
              { '--resource-color': `var(--resource-${name})` } as CSSProperties
            }
          >
            <dt>{label(name)}</dt>
            <dd>
              <strong>
                <ResourceQuantity resource={name} value={body.amounts[name]} />
              </strong>
              <meter
                min={0}
                max={100}
                value={storagePercent(body.amounts[name], body.capacity[name])}
                aria-label={`${name} storage utilization`}
              />
              <span>
                {rates ? (
                  <>
                    <ResourceQuantity resource={name} value={rates[name]} /> /h
                  </>
                ) : (
                  'Rate unavailable'
                )}
              </span>
              <small>
                Cap{' '}
                <ResourceQuantity resource={name} value={body.capacity[name]} />
              </small>
              {BigInt(body.amounts[name]) >= BigInt(body.capacity[name]) && (
                <b className={styles.storageFull}>Storage full</b>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <div className={styles.energyLine}>
        <span className={energy < 0n ? styles.warning : ''}>
          <ResourceMark resource="energy" width={13} height={13} />{' '}
          <ResourceNumber value={energy} /> energy
        </span>
        <span>
          {research
            ? 'Research host'
            : body.kind === 'Moon'
              ? 'Lunar outpost'
              : 'Planetary operations'}
        </span>
      </div>
      <WorkSummaries
        view={view}
        body={body}
        currentPage="overview"
        includeResearch={false}
        layout="compact"
      />
      <details className={styles.trafficDetails}>
        <summary>
          <span>
            <Radar size={15} /> Fleet traffic
          </span>
          <span>
            <ArrowDownLeft size={13} /> {traffic.incoming.length} in{' '}
            <ArrowUpRight size={13} /> {traffic.outgoing.length} out
          </span>
        </summary>
        {traffic.incoming.length + traffic.outgoing.length ? (
          <FlightList
            flights={flights.filter(
              (f) => f.from === body.id || f.to === body.id,
            )}
            view={view}
            body={body.id}
          />
        ) : (
          <EmptyState
            icon={Radar}
            variant="compact"
            headingLevel={3}
            title="No visible fleets in transit."
          />
        )}
      </details>
      <StationedUnits body={body} kind="Ship" />
      <StationedUnits body={body} kind="Defense" />
    </article>
  )
}

export function EmpireOverview({
  model,
  view,
  body,
}: {
  view: BoundView
  body: Body
  model: Coordinator
}) {
  const flights = empireFlights(view)
  const state = useStore(model.store)
  const pendingCargo = pendingFleetCargo(state)
  const totals = empireTotals(view, pendingCargo)
  const planets = view.bodies.filter((b) => b.kind === 'Planet').length
  const moons = view.bodies.length - planets
  const researchHost =
    view.protocol !== 2
      ? view.bodies.find(
          (b) => b.id === view.progression.research_operation?.host,
        )
      : undefined
  return (
    <section className={styles.empire} aria-label="Empire overview">
      <header className={styles.heading}>
        <div>
          <h2>Empire</h2>
        </div>
        <dl className={styles.strength}>
          <div>
            <dt>Planets</dt>
            <dd>{String(planets).padStart(2, '0')}</dd>
          </div>
          <div>
            <dt>Moons</dt>
            <dd>{String(moons).padStart(2, '0')}</dd>
          </div>
          <div>
            <dt>In transit</dt>
            <dd>{String(flights.length).padStart(2, '0')}</dd>
          </div>
        </dl>
      </header>
      <div className={styles.empireLedger} aria-label="Empire resource totals">
        <div className={styles.ledgerLabel}>
          <Globe2 size={17} />
          <span>
            Empire wealth<small>Worlds & owned fleet cargo</small>
          </span>
        </div>
        {resourceNames.map((name) => (
          <div
            className={styles.total}
            key={name}
            role="group"
            aria-label={`${label(name)} wealth`}
          >
            <ResourceMark resource={name} width={22} height={22} />
            <span className={styles.totalContent}>{name}</span>
            <strong>
              <ResourceNumber value={totals.total[name]} />
            </strong>
            <dl
              className={styles.wealthBreakdown}
              style={
                {
                  '--wealth-guide-color': `var(--resource-${name})`,
                } as CSSProperties
              }
            >
              <div title="On planets and moons">
                <dt>
                  <Globe2 size={14} aria-hidden="true" />
                  <span className={styles.srOnly}>On planets and moons</span>
                </dt>
                <dd>
                  <ResourceNumber value={totals.onWorlds[name]} />
                </dd>
              </div>
              <div title="On fleets in transit">
                <dt>
                  <Rocket size={14} aria-hidden="true" />
                  <span className={styles.srOnly}>On fleets in transit</span>
                </dt>
                <dd>
                  <ResourceNumber value={totals.inTransit[name]} />
                </dd>
              </div>
              {pendingCargo.length > 0 && (
                <div title="Launching">
                  <dt>
                    <Hourglass size={14} aria-hidden="true" />
                    <span className={styles.srOnly}>Launching</span>
                  </dt>
                  <dd>
                    <ResourceNumber value={totals.launching[name]} />
                  </dd>
                </div>
              )}
            </dl>
          </div>
        ))}
      </div>
      <div className={styles.commandDeck}>
        <FleetBoard view={view} body={body} flights={flights} />
      </div>
      <section className={styles.research} aria-label="Empire research">
        <div className={styles.researchLabel}>
          <span className={styles.eyebrow}>Empire-wide research</span>
          <h3>Research directive</h3>
        </div>
        <WorkSummaries
          view={view}
          body={researchHost ?? body}
          currentPage="overview"
          only="research"
          layout="directive"
        />
      </section>
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>Planetary command</p>
          <h2>Your dominion</h2>
        </div>
        <span>
          {planets} planet{planets === 1 ? '' : 's'} · {moons} moon
          {moons === 1 ? '' : 's'}
        </span>
      </div>
      <div className={styles.planetGrid}>
        {empireNodes(view.bodies).map(({ body: planet }) => (
          <PlanetDossier
            model={model}
            key={planet.id}
            body={planet}
            view={view}
            selected={planet.id === body.id}
            flights={flights}
          />
        ))}
      </div>
      <details className={styles.mapDisclosure}>
        <summary>Empire orbital network</summary>
        <CommandMap view={view} body={body} flights={flights} />
      </details>
    </section>
  )
}
