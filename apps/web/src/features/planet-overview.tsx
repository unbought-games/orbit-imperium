import { useUniverseName } from '../shell/session-context'
import { ResourceNumber } from '../ui/number-value'
import type { BoundView } from '../client-model/commands'
import { routeTarget } from '../shell/route-target'
import { resolveDestination } from '../shell/routes'
import { coordinates, label } from '../ui/format'
import { Heading } from '../ui/typography'
import { Link } from '../ui/link'
import { ArrowRight, Radar } from 'lucide-react'
import { WorkSummaries } from './work-summaries'
import { overviewArrivals } from './overview-arrivals'
import { useCountdown } from '../client-model/use-clock'
import styles from './planet-overview.module.css'
import { resolveBodyArt, atmosphereArt } from '../ui/artwork'

export function PlanetOverview({
  view,
  body,
}: {
  view: BoundView
  body: BoundView['bodies'][number]
}) {
  const universeName = useUniverseName()
  const art = resolveBodyArt(body)
  const countdown = useCountdown(view.sampled_at, 'compact')
  const arrivals = overviewArrivals(view, body.id)
  const fleetAvailable = resolveDestination(
    { universe: view.binding.universe, page: 'fleets', body: body.id },
    view,
  ).available
  return (
    <section className={styles.overview} aria-label="Planet overview">
      <div className={styles.world}>
        <img
          className={styles.atmosphere}
          src={atmosphereArt.src}
          srcSet={atmosphereArt.srcSet}
          sizes="(max-width: 767px) 100vw, 50vw"
          alt=""
          onError={(event) => {
            event.currentTarget.style.opacity = '0'
          }}
          onLoad={(event) => {
            event.currentTarget.style.opacity = '1'
          }}
          decoding="async"
        />
        <div className={styles.designation}>
          <span>
            {body.kind} / {coordinates(body)}
          </span>
          <small>Your selected world</small>
        </div>
        <div
          key={art.key}
          className={styles.globe}
          style={{ backgroundImage: `url(${art.thumbnail})` }}
        >
          <img
            src={art.src}
            srcSet={art.srcSet}
            sizes="(max-width: 767px) 420px, 48vw"
            width={art.width}
            height={art.height}
            alt=""
            onError={(event) => {
              event.currentTarget.style.opacity = '0'
            }}
            onLoad={(event) => {
              event.currentTarget.style.opacity = '1'
            }}
            decoding="async"
          />
        </div>
        <svg
          className={styles.orbits}
          viewBox="0 0 700 700"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="350" cy="350" r="305" />
          <circle cx="350" cy="350" r="318" strokeDasharray="1 6" />
          <ellipse
            cx="350"
            cy="350"
            rx="335"
            ry="95"
            transform="rotate(16 350 350)"
          />
          <ellipse
            cx="350"
            cy="350"
            rx="296"
            ry="310"
            transform="rotate(-21 350 350)"
            strokeDasharray="2 8"
          />
          <path d="M350 38V660M48 350H652M74 120H150L189 171M516 166L561 121H640" />
          <circle cx="350" cy="38" r="2" fill="currentColor" />
        </svg>
        <dl className={styles.facts}>
          <div>
            <dt>Fields</dt>
            <dd>
              {body.fields_used} / {body.fields}
              <small>{body.fields_reserved} reserved</small>
            </dd>
          </div>
          <div>
            <dt>Energy balance</dt>
            <dd>
              <ResourceNumber
                value={(
                  BigInt(body.energy.supply) - BigInt(body.energy.demand)
                ).toString()}
              />
            </dd>
          </div>
        </dl>
      </div>
      <div className={styles.editorial}>
        <div className={styles.introduction}>
          <p className={styles.eyebrow}>World overview</p>
          <Heading level={2}>Your foothold in the stars.</Heading>
          <p>
            A world to develop. A fleet to command.
            <br />
            Plan your next move from {coordinates(body)}.
          </p>
        </div>
        <section className={styles.arrivals} aria-label="Next to arrive">
          <div className={styles.sectionHeading}>
            <Heading level={2}>Next to arrive</Heading>
            <span>{arrivals.length} visible</span>
          </div>
          {!arrivals.length ? (
            <p className={styles.empty}>
              {fleetAvailable
                ? 'No visible fleet arrivals for this world.'
                : 'Fleet missions are unavailable in this universe.'}
            </p>
          ) : (
            <ol className={styles.arrivalList}>
              {arrivals.slice(0, 3).map((arrival) => (
                <li key={arrival.key}>
                  <Radar size={24} aria-hidden="true" />
                  <div>
                    <strong>{arrival.mission}</strong>
                    <small>{arrival.ships}</small>
                    <small>{arrival.route}</small>
                  </div>
                  <div className={styles.deadline}>
                    <span>{countdown(arrival.due)}</span>
                    <time dateTime={new Date(arrival.due).toISOString()}>
                      {new Date(arrival.due).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'long',
                      })}
                    </time>
                  </div>
                  {fleetAvailable && (
                    <Link
                      {...routeTarget(
                        universeName,
                        'fleets',
                        body.id,
                        arrival.item,
                      )}
                      aria-label={`View ${arrival.mission} fleet`}
                    >
                      <ArrowRight size={20} aria-hidden="true" />
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          )}
          {fleetAvailable && arrivals.length > 3 && (
            <Link {...routeTarget(universeName, 'fleets', body.id)}>
              View all {arrivals.length} arrivals
            </Link>
          )}
        </section>
        <section className={styles.work} aria-label="Work in progress">
          <div className={styles.sectionHeading}>
            <Heading level={2}>Work in progress</Heading>
          </div>
          <WorkSummaries view={view} body={body} layout="editorial" />
          <Link
            className={styles.manage}
            {...routeTarget(universeName, 'resources', body.id)}
          >
            Manage resources <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </section>
        <section className={styles.inventory} aria-label="Stationed inventory">
          <Heading level={2}>Stationed inventory</Heading>
          {!body.inventories.length ? (
            <p>No units stationed here.</p>
          ) : (
            <dl>
              {body.inventories.map((item) => (
                <div key={`${item.item.kind}:${item.item.id}`}>
                  <dt>{label(item.item.id)}</dt>
                  <dd>{item.count}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      </div>
    </section>
  )
}
