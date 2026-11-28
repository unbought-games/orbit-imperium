import type { components } from '../contracts'
import { Panel } from '../ui/panel'
import { Heading, Text } from '../ui/typography'
import { label } from '../ui/format'
import { formatWholeNumber } from '../ui/whole-number'
import { CoordinateLink } from './coordinate-link'
import { AbandonmentLosses } from './abandonment-losses'
import { exactTime } from './mission-presentation'

type S = components['schemas']
const percent = new Intl.NumberFormat(undefined, {
  style: 'percent',
  maximumFractionDigits: 4,
})
export function destructionChance(ppm: number) {
  return percent.format(ppm / 1_000_000)
}

export function MoonDestructionOutcome({
  outcome,
}: {
  outcome?: S['MoonDestructionResult4']
}) {
  return (
    <section aria-label="Moon destruction outcome">
      <Heading level={3}>
        {outcome?.moon_destroyed ? 'Moon destroyed' : 'Moon survived'}
      </Heading>
      {outcome ? (
        <>
          <Text>
            {formatWholeNumber(outcome.surviving_dreadnoughts)}{' '}
            {outcome.surviving_dreadnoughts === '1'
              ? 'Dreadnought survived'
              : 'Dreadnoughts survived'}{' '}
            combat. The chance to destroy this{' '}
            {formatWholeNumber(outcome.diameter_km)} km moon was{' '}
            {destructionChance(outcome.moon_chance_ppm)}.
          </Text>
          <Text>
            {outcome.fleet_lost
              ? 'The attacking fleet was lost with all escorts, cargo and loot.'
              : 'The surviving attackers escaped with their cargo and loot.'}{' '}
            Fleet loss chance was {destructionChance(outcome.fleet_loss_ppm)}.
          </Text>
        </>
      ) : (
        <Text>
          The attackers needed a victory and a surviving Dreadnought to attempt
          destruction.
        </Text>
      )}
    </section>
  )
}

type Notice =
  | S['MoonDestroyedPayload4']
  | S['MoonTargetLostPayload4']
  | S['MoonFleetRedirectedPayload4']
export function MoonLossReport({ notice }: { notice: Notice }) {
  if (notice.kind === 'MoonDestroyed') {
    return (
      <Panel as="section" aria-label="Moon loss report">
        <Heading level={3}>Moon destroyed</Heading>
        <Text>
          Your {formatWholeNumber(notice.diameter_km)} km moon was destroyed.
          The following assets were lost after combat.
        </Text>
        <AbandonmentLosses losses={[notice.losses]} />
      </Panel>
    )
  }
  const deadline =
    notice.leg === 'Returning'
      ? 'Return'
      : notice.leg === 'Holding'
        ? 'Hold ends'
        : 'Arrival'
  return (
    <Panel as="section" aria-label="Fleet destination report">
      <Heading level={3}>
        {notice.kind === 'MoonTargetLost'
          ? 'Fleet target lost'
          : 'Fleet redirected'}
      </Heading>
      <Text>
        The moon at <CoordinateLink at={notice.coordinates} target="moon" /> was
        destroyed during your{' '}
        {notice.mission === 'DestroyMoon'
          ? 'moon destruction'
          : label(notice.mission).toLowerCase()}{' '}
        mission.
      </Text>
      {notice.home_redirected && (
        <Text>The fleet will return to the parent planet.</Text>
      )}
      {notice.destination_redirected && (
        <Text>The fleet will arrive at the parent planet.</Text>
      )}
      {notice.kind === 'MoonTargetLost' && (
        <Text>
          The fleet will reach the former moon’s position and return without
          engaging.
        </Text>
      )}
      <Text>
        {deadline} ·{' '}
        <time dateTime={new Date(notice.due_at).toISOString()}>
          {exactTime(notice.due_at)}
        </time>
      </Text>
    </Panel>
  )
}
