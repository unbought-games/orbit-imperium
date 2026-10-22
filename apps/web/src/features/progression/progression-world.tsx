import { pageTitles } from '../../shell/navigation-model'
import { ResourceNumber } from '../../ui/number-value'
import type { BoundView } from '../../client-model/commands'
import type { ReactNode } from 'react'
import { ResourceMark } from '../../ui/resource-mark'
import { resolveBodyArt } from '../../ui/artwork'
import { CatalogImage } from '../../ui/image-catalog'
import { coordinates, label } from '../../ui/format'
import { currentResourceRates } from '../../ui/resource-rates'
import { catalogContent } from './catalog-content'
import type { ProgressionProps } from './shared'
import type { components } from '../../contracts'
import styles from './progression-world.module.css'

type Entry = components['schemas']['CatalogEntry3']
export function ProgressionHeading({
  page,
  body,
  compact = false,
}: {
  page: ProgressionProps['page']
  body: Pick<ProgressionProps['body'], 'coordinates' | 'kind'>
  compact?: boolean
}) {
  return (
    <header className={styles.heading}>
      {!compact && <h2>{pageTitles[page]}</h2>}
      {page === 'research' && (
        <p className={styles.context}>
          Universe-wide research · host and funding body {coordinates(body)}
        </p>
      )}
    </header>
  )
}
export function OrbitDiagram() {
  return (
    <svg
      className={styles.orbits}
      viewBox="0 0 800 500"
      aria-hidden="true"
      fill="none"
    >
      <ellipse cx="400" cy="255" rx="355" ry="130" />
      <ellipse cx="400" cy="255" rx="290" ry="200" strokeDasharray="2 7" />
      <ellipse cx="400" cy="255" rx="215" ry="215" />
      <path d="M400 20v460M35 255h730" strokeDasharray="2 9" />
      <circle cx="185" cy="255" r="5" />
      <circle cx="615" cy="255" r="5" />
    </svg>
  )
}
export function ResourceWorld({
  view,
  body,
  onSelect,
}: {
  view: BoundView
  body: BoundView['bodies'][number]
  onSelect: (id: string, opener: HTMLElement) => void
}) {
  const artwork = resolveBodyArt(body)
  const rates = currentResourceRates(view, body)
  const balance = (
    BigInt(body.energy.supply) - BigInt(body.energy.demand)
  ).toString()
  return (
    <div className={styles.resourceWorld}>
      <div className={styles.planetStage}>
        <img
          className={styles.planet}
          src={artwork.src}
          srcSet={artwork.srcSet}
          sizes="(max-width: 650px) 100vw, 55vw"
          width={artwork.width}
          height={artwork.height}
          decoding="async"
          onError={(event) => {
            event.currentTarget.style.opacity = '0'
          }}
          onLoad={(event) => {
            event.currentTarget.style.opacity = '1'
          }}
          alt=""
        />
        <OrbitDiagram />
        {(
          [
            ['metal', 'MetalMine'],
            ['crystal', 'CrystalMine'],
            ['deuterium', 'DeuteriumSynthesizer'],
          ] as const
        ).map(([name, building], index) => (
          <button
            key={name}
            type="button"
            className={`${styles.materialNode} ${styles[`node${index}`]}`}
            aria-label={`Inspect ${label(building)}`}
            onClick={(event) => onSelect(building, event.currentTarget)}
          >
            <ResourceMark resource={name} width={28} height={28} />
            <span>
              {name}
              <strong>
                <ResourceNumber value={body.amounts[name]} />
              </strong>
            </span>
          </button>
        ))}
        <div className={styles.energy} aria-label="Planet energy">
          <span>Energy balance</span>
          <strong>
            <ResourceNumber value={balance} />
          </strong>
          <dl>
            <div>
              <dt>Supply</dt>
              <dd>
                <ResourceNumber value={body.energy.supply} />
              </dd>
            </div>
            <div>
              <dt>Demand</dt>
              <dd>
                <ResourceNumber value={body.energy.demand} />
              </dd>
            </div>
          </dl>
        </div>
      </div>
      <dl className={styles.ledger} aria-label="Resource economy">
        {(['metal', 'crystal', 'deuterium'] as const).map((name) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>
              <strong>
                <ResourceNumber value={body.amounts[name]} />
              </strong>
              <span>
                Capacity <ResourceNumber value={body.capacity[name]} />
              </span>
              <span>
                {rates ? (
                  <>
                    <ResourceNumber value={rates[name]} /> / hour
                  </>
                ) : (
                  'Production unavailable'
                )}
              </span>
              {BigInt(body.capacity[name]) > 0n &&
                BigInt(body.amounts[name]) >= BigInt(body.capacity[name]) && (
                  <small>Storage full · production suppressed</small>
                )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
export function TechnologyWorld({
  entries,
  body,
  page,
  onSelect,
}: Pick<ProgressionProps, 'body' | 'page'> & {
  entries: Entry[]
  onSelect: (entry: Entry, opener: HTMLElement) => void
}) {
  const featured = entries
    .filter((x) => x.enabled && x.body_kinds.includes(body.kind))
    .slice(0, page === 'facilities' || page === 'research' ? 3 : 1)
  return (
    <div
      className={styles.objectWorld}
      role="region"
      aria-label={`${label(page)} objects`}
    >
      <OrbitDiagram />
      <div
        className={featured.length === 1 ? styles.singleObject : styles.objects}
      >
        {featured.map((entry) => (
          <button
            type="button"
            key={entry.key.id}
            onClick={(event) => onSelect(entry, event.currentTarget)}
            aria-label={`Inspect ${label(entry.key.id)}`}
          >
            <CatalogImage art={catalogContent(entry.key).art} />
            <span>{label(entry.key.id)}</span>
            <small>
              Inspect{' '}
              {entry.key.kind === 'Building'
                ? `· Level ${body.levels[entry.key.id as keyof typeof body.levels] ?? 0}`
                : '→'}
            </small>
          </button>
        ))}
      </div>
      <p className={styles.worldCaption}>
        {page === 'facilities'
          ? `${body.fields_used} used · ${body.fields_reserved} reserved · ${body.fields} total fields`
          : page === 'research'
            ? 'Research levels belong to your player across the universe.'
            : 'Select a design to inspect its costs and place an order.'}
      </p>
    </div>
  )
}
export function ObjectOrbit({ children }: { children: ReactNode }) {
  return (
    <div className={styles.objectOrbit}>
      <OrbitDiagram />
      {children}
    </div>
  )
}
