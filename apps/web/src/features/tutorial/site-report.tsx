import type { components } from '../../contracts'
import { useGameSession } from '../../shell/session-context'
import { useTutorial } from './use-tutorial'
import { siteContext } from './model'
import { siteBattleSummary } from './site-report-model'
import { ButtonLink } from '../../ui/button'
import { routeTarget } from '../../shell/route-target'
import { Heading, Text } from '../../ui/typography'
import { ResourceSummary, NumberValue } from '../../ui/number-value'
import { coordinates, label } from '../../ui/format'
import styles from './tutorial.module.css'
type S = components['schemas']
export function SiteEncounterReport({
  payload,
  viewer,
}: {
  payload: S['SiteEncounterPayload4']
  viewer?: string
}) {
  const { universeName, view } = useGameSession()
  const { data } = useTutorial()
  const site = siteContext(data, payload.site)
  const summary = siteBattleSummary(payload, viewer)
  const fleet =
    view.protocol === 4
      ? view.missions.fleets.find((f) => f.id === payload.fleet)
      : undefined
  return (
    <section aria-label="NPC encounter report" className={styles.site}>
      <span className={styles.eyebrow}>Personal NPC encounter</span>
      <Heading level={2}>{summary.outcome}</Heading>
      <Text>
        {site?.title ?? 'Personal introductory site'} ·{' '}
        {coordinates({ coordinates: payload.coordinates })}
        {site?.site.retired ? ' · opportunity ended' : ''}
      </Text>
      <Text>
        The encounter used normal combat rules. This temporary opportunity is
        separate from player-owned planets.
      </Text>
      <div className={styles.facts}>
        <div>
          <Heading level={3}>Your survivors</Heading>
          <ReportUnits units={summary.ownSurvivors} />
        </div>
        <div>
          <Heading level={3}>Your losses</Heading>
          <ReportUnits units={summary.ownLosses} />
        </div>
        <div>
          <Heading level={3}>NPC losses</Heading>
          <ReportUnits units={summary.npcLosses} />
        </div>
        <div>
          <Heading level={3}>NPC survivors</Heading>
          <ReportUnits units={summary.npcSurvivors} />
        </div>
      </div>
      <Heading level={3}>Stockpile loot loaded</Heading>
      <ResourceSummary value={payload.loot} />
      <Text>
        This loot was loaded at contact. Surviving ships must return before it
        reaches your return destination.
      </Text>
      <Heading level={3}>Total cargo at contact</Heading>
      <ResourceSummary value={payload.cargo} />
      <Heading level={3}>Debris created · unavailable for collection</Heading>
      <ResourceSummary value={payload.debris} />
      <Text>
        {payload.debris_policy === 'RetainedSiteLocal'
          ? 'This is actual site-local destruction debris. It cannot be harvested and remains only as report history when the opportunity ends.'
          : 'This encounter does not retain a collectible debris field.'}{' '}
        Small Cargo carries stockpile loot, not debris.
      </Text>
      <Text>
        Milestone rewards are separate automatic homeworld payments. Opening
        reward history shows what you earned, including while offline.
      </Text>
      <div className={styles.actions}>
        {fleet && (
          <ButtonLink
            {...routeTarget(
              universeName,
              'fleets',
              fleet.intent.origin,
              fleet.id,
            )}
          >
            Follow returning fleet
          </ButtonLink>
        )}
        <ButtonLink
          variant="secondary"
          hash="opening-history"
          {...routeTarget(
            universeName,
            'overview',
            data?.homeworld ?? undefined,
          )}
        >
          Opening &amp; reward history
        </ButtonLink>
      </div>
      <details className={styles.history}>
        <summary>
          Combat record · {payload.battle.rounds.length}{' '}
          {payload.battle.rounds.length === 1 ? 'round' : 'rounds'}
        </summary>
        {payload.battle.rounds.map((round) => (
          <section key={round.number}>
            <Heading level={3}>Round {round.number}</Heading>
            {round.end.map((participant, i) => (
              <div key={i} className={styles.roundParticipant}>
                <strong>
                  {'Npc' in participant.owner ? 'NPC force' : 'Attacking fleet'}
                </strong>
                <ReportUnits units={participant.units} />
              </div>
            ))}
          </section>
        ))}
      </details>
    </section>
  )
}
function ReportUnits({ units }: { units: S['SiteBattleCounts4']['units'] }) {
  return units.length ? (
    <ul>
      {units.map((unit, i) => (
        <li key={i}>
          {label(unit.item.id)} × <NumberValue value={unit.count} />
        </li>
      ))}
    </ul>
  ) : (
    <span>None</span>
  )
}
