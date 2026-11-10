import { usePlayerIdentity } from '../../shell/player-profiles-context'
import { useIdentityTitle } from '../../client-model/use-identity-title'
import { TutorialChapters } from './chapters'
import { ProgressionObjectiveCard, ObjectiveReward } from './objective-card'
import { Check } from 'lucide-react'
import { useGameScreen } from '../../shell/screen-context'
import { routeTarget } from '../../shell/route-target'
import { galaxyTarget } from '../../shell/galaxy-location'
import { siteLocation, personalSiteTitle } from './galaxy-sites-model'
import { Button, ButtonLink } from '../../ui/button'
import { Link } from '../../ui/link'
import { Heading, Text } from '../../ui/typography'
import { useTutorial } from './use-tutorial'
import {
  objectiveStatus,
  objectiveTitle,
  objectiveDescription,
  recommendation,
  siteContext,
  type Objective,
} from './model'
import type { TutorialData } from '../../client-model/tutorial-engine'
import type { components } from '../../contracts'
import styles from './tutorial.module.css'
type S = components['schemas']

export function TutorialBriefing() {
  const t = useTutorial()
  const { view } = useGameScreen()
  if (view.protocol !== 4) return null
  return (
    <section id="opening-guidance" tabIndex={-1} aria-label="Briefing">
      {t.error && (
        <div role="alert">
          <Text>{t.error}</Text>
          <Button onClick={t.retry}>Retry guidance</Button>
        </div>
      )}
      {!t.data ? (
        t.loading ? (
          <p role="status">Receiving your briefing…</p>
        ) : null
      ) : !t.data.enrolled ? (
        <Text>
          Your empire has no opening briefing. You can continue developing your
          planets through Empire.
        </Text>
      ) : (
        <ChapterJourney data={t.data} view={view} />
      )}
    </section>
  )
}
function ChapterJourney({
  data,
  view,
}: {
  data: TutorialData
  view: S['BoundView4']
}) {
  const { universeName } = useGameScreen()
  const next = recommendation(data, view)
  const identity = usePlayerIdentity(view.binding.player)
  const title = useIdentityTitle(identity?.title)
  const chapter = data.chapters.find((c) => !c.completed)
  const all = data.chapters.flatMap((c) => c.objectives)
  const started =
    all.some((o) => o.completed) || next?.next_action?.type === 'Attack'
  return (
    <>
      <header className={styles.intro} data-compact={started || undefined}>
        <span className={styles.eyebrow}>
          {data.completed
            ? 'Opening complete'
            : `${chapter?.title ?? 'Your opening'}`}
        </span>
        <Heading level={2}>
          {data.completed
            ? 'An empire of your own'
            : started
              ? (chapter?.title ?? 'Continue your opening')
              : `This world is yours, ${title.address}.`}
        </Heading>
        {!started && (
          <Text>
            I’ll help you establish the homeworld, build your first ships, and
            explore the stars.
          </Text>
        )}
      </header>
      {next && <NextObjective objective={next} data={data} view={view} />}
      {data.completed && (
        <div className={styles.next}>
          <Check aria-hidden="true" />
          <Heading level={3}>The full interface is yours</Heading>
          <Text>
            Your orders continue normally. Explore the galaxy, grow production
            and build the fleet you want.
          </Text>
        </div>
      )}
      <TutorialChapters data={data} view={view} universeName={universeName} />
    </>
  )
}
function NextObjective({
  objective: o,
  data,
  view,
}: {
  objective: Objective
  data: TutorialData
  view: S['BoundView4']
}) {
  const { universeName } = useGameScreen()
  const t = useTutorial()
  const status = objectiveStatus(o, data, view)
  const action = o.next_action
  const site = siteContext(
    data,
    action?.type === 'Attack' ? action.site?.id : undefined,
  )
  if (action?.type === 'Progression')
    return <ProgressionObjectiveCard objective={o} status={status} />
  return (
    <section className={styles.next} aria-label="Recommended next action">
      <span className={styles.eyebrow}>
        {status.ready ? 'Next action' : 'Keep your empire moving'}
      </span>
      <Heading level={3}>{objectiveTitle(o)}</Heading>
      <p role="status">{status.text}</p>
      {action?.type === 'ReviewProductionSettings' && (
        <>
          <Text>{objectiveDescription(o)}</Text>
          <ButtonLink
            {...routeTarget(
              universeName,
              'resource-settings',
              data.homeworld ?? undefined,
            )}
          >
            Open resource settings
          </ButtonLink>
        </>
      )}
      {action?.type === 'AwaitReturn' && (
        <>
          <Text>
            Raid loot remains aboard until the actual return. Milestone grants
            are separate payments to your homeworld.
          </Text>
          <ButtonLink
            {...routeTarget(
              universeName,
              'fleets',
              data.homeworld ?? undefined,
              action.fleets[0],
            )}
          >
            Follow your fleet
          </ButtonLink>
        </>
      )}
      {action?.type === 'Attack' &&
        (site ? (
          <div>
            <Text>
              {personalSiteTitle(site)} is near your homeworld. Inspect its
              defenses and stockpile in Galaxy before sending your fleet.
            </Text>
            <ButtonLink
              {...galaxyTarget(
                universeName,
                data.homeworld!,
                siteLocation(site),
              )}
            >
              View outpost in Galaxy
            </ButtonLink>
          </div>
        ) : (
          <>
            <Text>
              Use an eligible ordinary target, or prepare a personal
              introductory opportunity in beginner guidance. Your ships and
              normal mission rules apply.
            </Text>
            {data.beginner ? (
              <Button disabled={t.pending} onClick={() => void t.open()}>
                Prepare introductory operation
              </Button>
            ) : (
              <ButtonLink
                {...routeTarget(
                  universeName,
                  'galaxy',
                  data.homeworld ?? undefined,
                )}
              >
                Choose a target
              </ButtonLink>
            )}
            <Link
              {...routeTarget(
                universeName,
                'shipyard',
                data.homeworld ?? undefined,
                action.ships[0],
              )}
            >
              Build the recommended ships
            </Link>
          </>
        ))}
      <ObjectiveReward reward={o.reward} />
    </section>
  )
}
