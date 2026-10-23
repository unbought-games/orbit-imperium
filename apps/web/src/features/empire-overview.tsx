import { Button } from '../ui/button'
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
  Orbit,
  Radar,
  ShieldAlert,
  Zap,
} from 'lucide-react'
import { useId, useState, type CSSProperties } from 'react'
import type { BoundView } from '../client-model/commands'
import { resourceNames } from '../client-model/resources'
import { useCountdown } from '../client-model/use-clock'
import { useGameSession } from '../shell/session-context'
import { routeTarget } from '../shell/route-target'
import { resolveDestination, type Page } from '../shell/routes'
import { Link } from '../ui/link'
import { ResourceNumber } from '../ui/number-value'
import { ResourceMark } from '../ui/resource-mark'
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
    <Link className={className} {...routeTarget(universeName, page, body)}>
      {children}
    </Link>
  ) : null
}

function FlightList({
  flights,
  view,
  body,
}: {
  flights: EmpireFlight[]
  view: BoundView
  body: string
}) {
  useProfileSource(
    flights.some((f) => f.sender) ? { type: 'Incoming' } : null,
    view.viewer_revision,
  )
  const countdown = useCountdown(view.sampled_at, 'compact')
  const { universeName } = useGameSession()
  const available = resolveDestination(
    { universe: view.binding.universe, page: 'fleets', body },
    view,
  ).available
  return (
    <ol className={styles.flightList}>
      {flights.map((flight) => (
        <li
          key={flight.key}
          className={flight.hostile ? styles.hostileFlight : ''}
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
            <div>
              <strong>{flight.mission}</strong>
              <span className={styles.leg}>{flight.leg}</span>
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
            <time
              dateTime={new Date(flight.due).toISOString()}
              title={new Date(flight.due).toLocaleString()}
            >
              {countdown(flight.due)}
            </time>
          </div>
          {available && (
            <Link
              className={styles.flightLink}
              {...routeTarget(universeName, 'fleets', body, flight.item)}
              aria-label={`View ${flight.mission} ${flight.leg.toLowerCase()} fleet`}
            >
              <ArrowRight size={16} />
            </Link>
          )}
        </li>
      ))}
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
              {bodyName(body)} {coordinates(body)}
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
  const [expanded, setExpanded] = useState(false)
  const panelId = useId()
  const threats = flights.filter((f) => f.hostile).length
  const fleetAvailable = resolveDestination(
    { universe: view.binding.universe, body: body.id, page: 'fleets' },
    view,
  ).available
  return (
    <section
      data-expanded={expanded}
      className={styles.fleetBoard}
      aria-label="Fleet movements"
    >
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
            ? `${threats} incoming attack${threats === 1 ? '' : 's'} detected`
            : 'No incoming attacks detected'}
      </div>
      <Button
        variant="secondary"
        type="button"
        className={styles.mobileFleetToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? 'Hide movements' : `Show ${flights.length} fleet movements`}{' '}
        <span aria-hidden="true">{expanded ? '−' : '+'}</span>
      </Button>
      <div className={styles.fleetBody} id={panelId}>
        {flights.length ? (
          <div className={styles.fleetScroll}>
            <FlightList flights={flights} view={view} body={body.id} />
          </div>
        ) : (
          <div className={styles.quietSpace}>
            <Radar size={56} strokeWidth={0.7} />
            <strong>The lanes are quiet.</strong>
            <p>
              No visible fleet movements.
              <br />
              Your next move starts here.
            </p>
          </div>
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
            {body.kind}
            {selected && <b>Command focus</b>}
          </span>
          <h3 className={styles.planetName}>{bodyName(body)}</h3>
          <span className={styles.planetCoordinates}>{coordinates(body)}</span>
          <span className={styles.bodyFacts}>
            {body.fields_used}/{body.fields} fields · {body.fields_reserved}{' '}
            reserved
          </span>
          {'colony' in body && body.colony && (
            <span className={styles.bodyFacts}>
              {body.colony.diameter_km} km · {body.colony.min_temperature} to{' '}
              {body.colony.max_temperature} °C
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
      </header>
      {view.protocol === 4 && body.kind === 'Planet' && (
        <PlanetRename model={model} body={body} />
      )}
      <dl className={styles.resources} aria-label="Planet resources">
        {resourceNames.map((name) => (
          <div
            key={name}
            style={
              { '--resource-color': `var(--resource-${name})` } as CSSProperties
            }
          >
            <dt>
              <ResourceMark resource={name} width={13} height={13} />
              {label(name)}
            </dt>
            <dd>
              <strong>
                <ResourceNumber value={body.amounts[name]} />
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
                    <ResourceNumber value={rates[name]} /> /h
                  </>
                ) : (
                  'Rate unavailable'
                )}
              </span>
              <small>
                Cap <ResourceNumber value={body.capacity[name]} />
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
          <Zap size={13} /> <ResourceNumber value={energy} /> energy
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
          <p className={styles.empty}>No visible fleets in transit.</p>
        )}
      </details>
      <details className={styles.inventory}>
        <summary>
          <span>
            <Orbit size={15} /> Orbital fleet
          </span>
          <span>{body.inventories.length} unit types</span>
        </summary>
        <section aria-label="Orbital fleet">
          {body.inventories.length ? (
            <dl>
              {body.inventories.map((item) => (
                <div key={`${item.item.kind}:${item.item.id}`}>
                  <dt>{label(item.item.id)}</dt>
                  <dd>{item.count}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className={styles.empty}>No units stationed here.</p>
          )}
        </section>
      </details>
      <div className={styles.cardFooter}>
        <Destination view={view} body={body.id} page="facilities">
          Facilities <ArrowUpRight size={13} />
        </Destination>
        <Destination view={view} body={body.id} page="dispatch">
          Dispatch fleet <ArrowUpRight size={13} />
        </Destination>
      </div>
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
  const totals = empireTotals(view)
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
            Empire reserves<small>Across all planets & moons</small>
          </span>
        </div>
        {resourceNames.map((name) => (
          <div className={styles.total} key={name}>
            <ResourceMark resource={name} width={22} height={22} />
            <span>
              {name}
              <strong>
                <ResourceNumber value={totals[name]} />
              </strong>
            </span>
          </div>
        ))}
      </div>
      <div className={styles.commandDeck}>
        <FleetBoard view={view} body={body} flights={flights} />
      </div>
      <section className={styles.research} aria-label="Empire research">
        <div className={styles.researchLabel}>
          <span className={styles.eyebrow}>Shared across your empire</span>
          <h3>Research directive</h3>
        </div>
        <WorkSummaries
          view={view}
          body={researchHost ?? body}
          currentPage="overview"
          only="research"
          layout="compact"
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
