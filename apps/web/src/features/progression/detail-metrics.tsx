import { formatDuration } from '../../client-model/duration'
import type { ReactNode } from 'react'
import { ResourceCosts } from '../../ui/resource-costs'
import { resourceShortfalls } from '../../ui/resource-cost-values'
import type { components } from '../../contracts'
import { ResourceMark } from '../../ui/resource-mark'
import { Popover } from '../../ui/popover'
import {
  ResourceShortfall,
  ResourceNumber,
  ResourceQuantity,
  NumberValue,
} from '../../ui/number-value'
import { Link } from '../../ui/link'
import { label } from '../../ui/format'
import { useUniverseName } from '../../shell/session-context'
import { routeTarget } from '../../shell/route-target'
import { catalogPage } from '../../shell/catalog-routes'
import { buildingInsights, energySources } from './detail-insights'
import type { ProgressionProps } from './shared'
import { DetailRow } from './detail-layout'
import styles from './detail-layout.module.css'

type Insight = ReturnType<typeof buildingInsights>
export const benefitLabels = {
  MetalPerHour: 'Mine output',
  CrystalPerHour: 'Mine output',
  DeuteriumPerHour: 'Mine output',
  Energy: 'Energy supplied',
  MetalCapacity: 'Metal capacity',
  CrystalCapacity: 'Crystal capacity',
  DeuteriumCapacity: 'Deuterium capacity',
} as const
export function BenefitValue({
  insight,
  target = false,
  potential = false,
}: {
  insight: NonNullable<Insight['benefit']>
  target?: boolean
  potential?: boolean
}) {
  return (
    <DetailResourceValue
      resource={
        insight.kind.startsWith('Metal')
          ? 'metal'
          : insight.kind.startsWith('Crystal')
            ? 'crystal'
            : insight.kind.startsWith('Deuterium')
              ? 'deuterium'
              : 'energy'
      }
    >
      <ResourceNumber
        value={
          potential && insight.fullPowerTarget
            ? insight.fullPowerTarget
            : target
              ? insight.target
              : insight.current
        }
      />
      {insight.kind.endsWith('PerHour') ? ' / h' : ''}
    </DetailResourceValue>
  )
}
export function DetailResourceValue({
  resource,
  children,
}: {
  resource: 'metal' | 'crystal' | 'deuterium' | 'energy'
  children: ReactNode
}) {
  return (
    <span className={styles.resourceValue} data-resource={resource}>
      <ResourceMark
        resource={resource}
        width={18}
        height={18}
        role="img"
        aria-label={label(resource)}
        aria-hidden={false}
      />
      <span>{children}</span>
    </span>
  )
}
export function SignedEnergy({ value }: { value: string }) {
  return (
    <>
      {BigInt(value) > 0n ? '+' : ''}
      <ResourceNumber value={value} />
    </>
  )
}
export function StorageInsight({
  storage,
}: {
  storage: NonNullable<Insight['storage']>
}) {
  return (
    <div
      className={styles.storage}
      aria-label={`${label(storage.resource)} storage forecast`}
    >
      <div>
        <DetailResourceValue resource={storage.resource}>
          <ResourceNumber value={storage.amount} /> /{' '}
          <ResourceNumber value={storage.capacity} /> stored
        </DetailResourceValue>
        <strong>
          {storage.state === 'full' ? (
            'Storage full'
          ) : storage.milliseconds !== null ? (
            <>Full in ~{formatDuration(storage.milliseconds)}</>
          ) : storage.state === 'idle' ? (
            'Not filling'
          ) : (
            'Fill time unavailable'
          )}
        </strong>
      </div>
      <progress
        value={storage.percent}
        max={100}
        aria-label={`${label(storage.resource)} storage used`}
      />
      {storage.rate !== null && (
        <small>
          {storage.resource === 'deuterium'
            ? 'Planet total (net of fuel)'
            : 'Planet total (incl. base)'}
          :{' '}
          <ResourceQuantity resource={storage.resource} value={storage.rate} />{' '}
          / h
        </small>
      )}
    </div>
  )
}
export function EnergyComparison({
  energy,
  firstBuild = false,
  view,
  body,
}: {
  energy: Insight['energy']
  firstBuild?: boolean
  view: ProgressionProps['view']
  body: ProgressionProps['body']
}) {
  const short = energy.after !== null && BigInt(energy.after) < 0n
  const change = energy.change === null ? 0n : BigInt(energy.change)
  const hasChange = change !== 0n
  return (
    <>
      {!firstBuild && (
        <DetailRow label="Energy balance" warning={short}>
          <EnergyDetails energy={energy} view={view} body={body}>
            <DetailResourceValue resource="energy">
              <SignedEnergy value={energy.current} />{' '}
              <span aria-hidden="true">→</span>{' '}
              <strong>
                {energy.after === null ? (
                  'Estimate unavailable'
                ) : (
                  <SignedEnergy value={energy.after} />
                )}
              </strong>
              {short && energy.afterUtilization !== null && (
                <>
                  {' '}
                  (
                  <NumberValue
                    value={energy.afterUtilization}
                    divisor={10000}
                  />
                  %)
                </>
              )}
            </DetailResourceValue>
          </EnergyDetails>
        </DetailRow>
      )}
      {firstBuild && (hasChange || energy.constructionBlocked) && (
        <DetailRow
          label={hasChange ? 'Power to operate' : 'Construction power'}
        >
          <EnergyDetails energy={energy} view={view} body={body} firstBuild>
            <DetailResourceValue resource="energy">
              {hasChange ? (
                <ResourceNumber value={change < 0n ? -change : change} />
              ) : (
                'More power needed'
              )}
            </DetailResourceValue>
          </EnergyDetails>
        </DetailRow>
      )}
    </>
  )
}

function EnergyDetails({
  energy,
  view,
  body,
  firstBuild = false,
  children,
}: {
  energy: Insight['energy']
  view: ProgressionProps['view']
  body: ProgressionProps['body']
  firstBuild?: boolean
  children: ReactNode
}) {
  const short = energy.after !== null && BigInt(energy.after) < 0n
  const change = energy.change === null ? null : BigInt(energy.change)
  return (
    <Popover
      label={firstBuild ? 'Operating power' : 'Energy balance'}
      className={styles.metricTrigger}
      trigger={children}
    >
      <p>
        Current balance:{' '}
        <DetailResourceValue resource="energy">
          <SignedEnergy value={energy.current} />
        </DetailResourceValue>
      </p>
      <p>
        After construction:{' '}
        {energy.after === null ? (
          'Estimate unavailable'
        ) : (
          <DetailResourceValue resource="energy">
            <SignedEnergy value={energy.after} />
          </DetailResourceValue>
        )}
      </p>
      {change !== null && change !== 0n && (
        <p>
          {change > 0n ? 'Additional demand' : 'Demand saved'}:{' '}
          <ResourceQuantity
            resource="energy"
            value={change < 0n ? -change : change}
          />
        </p>
      )}
      {energy.afterUtilization !== null && (
        <p>
          Production efficiency:{' '}
          <NumberValue value={energy.afterUtilization} divisor={10000} />
          %. Available power divided by total demand, capped at 100%.
        </p>
      )}
      <p>Estimates use your saved production settings.</p>
      {(short || energy.constructionBlocked) && (
        <p>
          <EnergyAdvice
            view={view}
            body={body}
            firstBuild={firstBuild}
            construction={energy.constructionBlocked}
          />
        </p>
      )}
    </Popover>
  )
}

export function DecisionCosts({
  cost,
  available,
  wait,
  title = 'Cost',
}: {
  cost: components['schemas']['Resources']
  available: components['schemas']['Resources']
  wait: number | null
  title?: string
}) {
  const missing = resourceShortfalls(cost, available)
  return (
    <DetailRow
      label={title}
      hint={
        missing.length > 0 && (
          <span aria-label="Missing resources">
            <Popover
              label="Resource availability"
              className={`${styles.metricTrigger} ${styles.shortfallSummary}`}
              trigger={
                <>
                  <span>Missing</span>
                  {missing.map(({ resource, amount }) => (
                    <DetailResourceValue key={resource} resource={resource}>
                      <ResourceShortfall value={amount} />
                    </DetailResourceValue>
                  ))}
                  <span className={styles.shortfallTime}>
                    {wait === null
                      ? 'Timing unavailable'
                      : `Ready in ~${formatDuration(wait)}`}
                  </span>
                </>
              }
            >
              {missing.map(({ resource, amount }) => (
                <p key={resource}>
                  {label(resource)}:{' '}
                  <DetailResourceValue resource={resource}>
                    <ResourceShortfall value={amount} />
                  </DetailResourceValue>{' '}
                  more needed.
                </p>
              ))}
              <p>
                {wait === null
                  ? 'Current production cannot provide a reliable wait estimate. You may need more production, storage capacity, or delivered resources.'
                  : `These resources should be available in about ${formatDuration(wait)} at current production, if nothing else is spent.`}
              </p>
              <p>Other requirements still apply.</p>
            </Popover>
          </span>
        )
      }
    >
      <ResourceCosts
        cost={cost}
        available={available}
        compact
        showShortfalls={false}
      />
    </DetailRow>
  )
}

export function EnergyAdvice({
  view,
  body,
  construction = false,
  firstBuild = false,
}: {
  view: ProgressionProps['view']
  body: ProgressionProps['body']
  construction?: boolean
  firstBuild?: boolean
}) {
  const universe = useUniverseName()
  const sources = energySources(view, body)
  return (
    <span className={styles.energyHelp}>
      {construction
        ? 'More power is required to start.'
        : firstBuild
          ? 'For full output:'
          : 'An energy deficit will limit production.'}{' '}
      {sources.length ? (
        <>
          {sources.map((entry, i) => (
            <span key={entry.key.id}>
              {i > 0 && ' · '}
              <Link
                {...routeTarget(
                  universe,
                  catalogPage(entry.key),
                  body.id,
                  entry.key.id,
                )}
              >
                {label(entry.key.id)}
              </Link>
              {entry.key.id === 'FusionReactor' && ' (uses deuterium)'}
            </span>
          ))}
        </>
      ) : (
        'No power source is enabled for this body.'
      )}
    </span>
  )
}
