import { useState, useLayoutEffect } from 'react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { Check, ArrowRight, Orbit } from 'lucide-react'
import { useGameScreen } from '../../shell/screen-context'
import { useGameSession } from '../../shell/session-context'
import { routeTarget } from '../../shell/route-target'
import type { Page } from '../../shell/routes'
import { Button, ButtonLink } from '../../ui/button'
import { Link } from '../../ui/link'
import { Heading, Text } from '../../ui/typography'
import { ResourceSummary, NumberValue } from '../../ui/number-value'
import { bodyName, label, coordinates } from '../../ui/format'
import { useTutorial } from './use-tutorial'
import {
  accomplishmentTitle,
  receiptAcknowledgement,
  objectiveStatus,
  objectiveTitle,
  progressionTarget,
  recommendation,
  siteContext,
  tutorialPages,
  type Objective,
} from './model'
import type { TutorialData } from '../../client-model/tutorial-engine'
import type { components } from '../../contracts'
import styles from './tutorial.module.css'
type S = components['schemas']

export function GuidanceBar({ page, body }: { page: Page; body?: string }) {
  const t = useTutorial()
  const { universeName, view } = useGameSession()
  const data = t.data
  if (!data?.enrolled)
    return t.error ? (
      <div className={styles.bar}>
        <span role="status">Guidance unavailable.</span>
        <Button variant="ghost" onClick={t.retry}>
          Retry guidance
        </Button>
      </div>
    ) : null
  const pages = tutorialPages(data, view.protocol === 4 ? view : null)
  const hidden = pages && !pages.has(page)
  return (
    <aside
      className={styles.bar}
      aria-label="Opening guidance"
      onFocusCapture={(event) => {
        // Reveal keyboard focus above pinned chrome without moving a pointer
        // target between pointerdown and click.
        if (event.target.matches(':focus-visible'))
          event.target.scrollIntoView({
            block: 'center',
            inline: 'nearest',
            behavior: 'instant',
          })
      }}
    >
      <Link
        {...routeTarget(universeName, 'overview', data.homeworld ?? body)}
        hash="opening-guidance"
        onClick={() => revealOpening('opening-guidance')}
      >
        Opening chapters &amp; reward history
      </Link>
      {data.beginner && (
        <Button
          variant="secondary"
          size="small"
          disabled={t.pending}
          onClick={() => void t.setBeginner(false)}
        >
          Show full interface
        </Button>
      )}
      {hidden && (
        <Text>
          This area is part of the full interface. Show full interface to keep
          every destination in navigation; you can use this page now.
        </Text>
      )}
      <ReceiptNotice data={data} />
      {t.pending && <span role="status">Saving your preference…</span>}
      {t.error && (
        <span role="alert">
          {t.error}{' '}
          <Button variant="ghost" onClick={t.retry}>
            Retry guidance
          </Button>
        </span>
      )}
    </aside>
  )
}
function ReceiptNotice({ data }: { data: TutorialData }) {
  const [dismissed, setDismissed] = useState<string | null>(null)
  const { view, universeName } = useGameSession()
  const notice = receiptAcknowledgement(data, dismissed)
  if (!notice) return null
  const { receipt, paid } = notice
  const home = view.bodies.find((b) => b.id === receipt.homeworld)
  return (
    <div className={styles.receipt} aria-label="Latest accomplishment">
      <div role="status" aria-live="polite" aria-atomic="true">
        <strong>Latest recorded accomplishment</strong>
        <span>{notice.title}</span>
        <span>
          {paid
            ? `Already paid to ${home ? bodyName(home) : 'your homeworld'}`
            : 'Accomplished · no resource payment'}
          {paid && (
            <>
              {' '}
              <ResourceSummary value={receipt.resources} />
            </>
          )}
        </span>
      </div>
      <div className={styles.receiptActions}>
        <Link
          {...routeTarget(universeName, 'overview', receipt.homeworld)}
          hash="opening-history"
          onClick={() => revealOpening('opening-history')}
        >
          Reward history
        </Link>
        <Button
          variant="ghost"
          size="small"
          onClick={() => setDismissed(receipt.id)}
        >
          Dismiss receipt
        </Button>
      </div>
    </div>
  )
}
export function TutorialOverview() {
  const t = useTutorial()
  const { view } = useGameScreen()
  const [expanded, setExpanded] = useState(false)
  const hash = useLocation({ select: (location) => location.hash })
  const navigate = useNavigate()
  const requested = hash === 'opening-guidance' || hash === 'opening-history'
  useLayoutEffect(() => {
    if (requested && t.data?.enrolled) revealOpening(hash)
  }, [hash, requested, t.data?.enrolled])
  if (view.protocol !== 4) return null
  if (!t.data)
    return t.loading ? <p role="status">Receiving opening guidance…</p> : null
  if (!t.data.enrolled) return null
  if (!t.data.beginner && !expanded && !requested)
    return (
      <section
        className={styles.optional}
        aria-label="Optional opening guidance"
      >
        <div>
          <Heading level={2}>
            {t.data.completed
              ? 'Opening accomplished'
              : 'Your opening chapters'}
          </Heading>
          <Text>
            {t.data.completed
              ? 'Your economy and first fleet loop are established. Keep developing at your own pace.'
              : 'Earn the same milestones through ordinary play. Guidance is optional.'}
          </Text>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            setExpanded(true)
            void navigate({ hash: 'opening-guidance' })
          }}
        >
          View guidance &amp; reward history
        </Button>
      </section>
    )
  return (
    <section
      id="opening-guidance"
      tabIndex={-1}
      className={styles.opening}
      aria-label="Opening chapters"
    >
      {!t.data.beginner && (
        <div className={styles.actions}>
          <Button
            variant="ghost"
            onClick={() => {
              setExpanded(false)
              void navigate({ hash: '' })
            }}
          >
            Close guidance
          </Button>
          {!t.data.completed && t.data.human && (
            <Button
              variant="secondary"
              disabled={t.pending}
              onClick={() => void t.setBeginner(true)}
            >
              Use beginner guidance
            </Button>
          )}
        </div>
      )}
      <ChapterJourney data={t.data} view={view} />
      <RewardHistory data={t.data} />
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
  const next = recommendation(data, view)
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
              : 'Build an empire that can sustain its fleet'}
        </Heading>
        {!started && (
          <Text>
            Develop your homeworld, build your own ships, then bring a raid home
            and invest in production.
          </Text>
        )}
        <p className={styles.progress}>
          {all.filter((o) => o.completed).length} of {all.length}{' '}
          accomplishments earned · rewards arrive automatically
        </p>
      </header>
      {next && <NextObjective objective={next} data={data} view={view} />}
      {data.completed && (
        <div className={styles.next}>
          <Check aria-hidden="true" />
          <Heading level={3}>The full interface is yours</Heading>
          <Text>
            Your orders continue normally. Explore the galaxy, grow production
            and build the fleet you want. Your earned reward history stays
            available below.
          </Text>
        </div>
      )}
      <div className={styles.chapters}>
        {data.chapters.map((c, index) => (
          <details key={c.id} className={styles.chapter}>
            <summary>
              <span className={styles.chapterNumber}>
                {c.completed ? (
                  <Check size={16} aria-label="Complete" />
                ) : (
                  String(index + 1).padStart(2, '0')
                )}
              </span>
              <span>{c.title}</span>
              <small>
                {c.objectives.filter((o) => o.completed).length}/
                {c.objectives.length} earned
              </small>
            </summary>
            <ol>
              {c.objectives.map((o) => (
                <li key={o.id} data-completed={o.completed || undefined}>
                  <span>
                    {o.completed ? (
                      <Check size={16} aria-label="Accomplished" />
                    ) : (
                      <span className={styles.dot} />
                    )}
                  </span>
                  <div>
                    <strong>{o.explanation}</strong>
                    {!o.completed && (
                      <p>{objectiveStatus(o, data, view).text}</p>
                    )}
                    {Object.values(o.reward).some((n) => BigInt(n) > 0n) && (
                      <small>
                        {o.completed
                          ? 'Paid to homeworld'
                          : 'Automatic homeworld reward'}{' '}
                        <ResourceSummary value={o.reward} />
                      </small>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </details>
        ))}
      </div>
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
  const target =
    action?.type === 'Progression' ? progressionTarget(action.request) : null
  const site = siteContext(
    data,
    action?.type === 'Attack' ? action.site?.id : undefined,
  )
  return (
    <section className={styles.next} aria-label="Recommended next action">
      <span className={styles.eyebrow}>
        {status.ready ? 'Next action' : 'Keep your empire moving'}
      </span>
      <Heading level={3}>{objectiveTitle(o)}</Heading>
      {target && <Text>{o.explanation}</Text>}
      <p role="status">{status.text}</p>
      {target && (
        <ButtonLink
          {...routeTarget(universeName, target.page, target.body, target.item)}
        >
          Open {label(target.item)} <ArrowRight size={16} aria-hidden="true" />
        </ButtonLink>
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
          <SiteBriefing site={site} homeworld={data.homeworld} />
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
      {Object.values(o.reward).some((n) => BigInt(n) > 0n) && (
        <p className={styles.reward}>
          On accomplishment, paid automatically to your homeworld{' '}
          <ResourceSummary value={o.reward} />
        </p>
      )}
    </section>
  )
}
export function SiteBriefing({
  site,
  homeworld,
}: {
  site: S['TutorialSite4']
  homeworld: string | null
}) {
  const { view, prepareDispatch, universeName } = useGameScreen()
  const origin = view.bodies.find((b) => b.id === homeworld)
  const missing = site.recommended_ships.filter(
    (ship) =>
      !origin?.inventories.some(
        (i) => i.item.id === ship && BigInt(i.count) > 0n,
      ),
  )
  const selection = site.site.destination.selection
  return (
    <section className={styles.site} aria-label="Site briefing">
      <div className={styles.siteTitle}>
        <Orbit size={24} aria-hidden="true" />
        <div>
          <Heading level={3}>{site.title}</Heading>
          <span>
            Personal introductory site ·{' '}
            {coordinates({ coordinates: site.site.destination.coordinates })}
          </span>
        </div>
      </div>
      <Text>
        {site.recommended_ships.includes('SmallCargo')
          ? 'Bring a fighter and cargo ship to recover a useful haul for your homeworld.'
          : 'Send your first fighter on a short orbital operation, then read the encounter report.'}
      </Text>
      <dl className={styles.facts}>
        <div>
          <dt>Remaining force</dt>
          <dd>
            {site.remaining_forces.length
              ? site.remaining_forces.map((f, i) => (
                  <span key={i}>
                    {label(f.item.id)} × <NumberValue value={f.count} />
                  </span>
                ))
              : 'No remaining defenders'}
          </dd>
        </div>
        <div>
          <dt>Finite stockpile</dt>
          <dd>
            <ResourceSummary value={site.site.remaining_stock} />
          </dd>
        </div>
        <div>
          <dt>Recommended fleet</dt>
          <dd>{site.recommended_ships.map(label).join(' + ')}</dd>
        </div>
      </dl>
      {site.site.retired ? (
        <Text>
          This introductory opportunity has ended. Accepted fleets continue
          their normal return.
        </Text>
      ) : site.busy ? (
        <ButtonLink
          {...routeTarget(universeName, 'fleets', homeworld ?? undefined)}
        >
          Follow operation in flight
        </ButtonLink>
      ) : missing.length ? (
        <>
          <Text>
            Build {missing.map(label).join(' and ')} at your homeworld before
            dispatching.
          </Text>
          <ButtonLink
            {...routeTarget(
              universeName,
              'shipyard',
              homeworld ?? undefined,
              missing[0],
            )}
          >
            Open {label(missing[0])}
          </ButtonLink>
        </>
      ) : (
        <Button
          disabled={!origin}
          onClick={() =>
            prepareDispatch({
              origin: homeworld ?? undefined,
              mission: 'Attack',
              coordinates: site.site.destination.coordinates,
              target: { type: 'Site', selection },
              ships: Object.fromEntries(
                site.recommended_ships.map((ship) => [ship, '1']),
              ),
            })
          }
        >
          Prepare attack fleet
        </Button>
      )}
      <small>
        Finite introductory opportunity. Loot returns aboard your ships; debris
        cannot be collected.
      </small>
      <details className={styles.rules}>
        <summary>How this operation works</summary>
        <Text>{site.briefing}</Text>
      </details>
    </section>
  )
}
function RewardHistory({ data }: { data: TutorialData }) {
  const hash = useLocation({ select: (location) => location.hash })
  const { view } = useGameScreen()
  return (
    <details
      id="opening-history"
      className={styles.history}
      open={hash === 'opening-history'}
    >
      <summary>
        Automatic reward history · {data.receipts.length}{' '}
        {data.receipts.length === 1 ? 'accomplishment' : 'accomplishments'}
      </summary>
      <Text>
        These rewards were paid at accomplishment, even while you were away.
        They are already part of your homeworld resources, and may have been
        spent since. Raid loot travels separately aboard your fleets.
      </Text>
      {!data.receipts.length ? (
        <Text>
          No accomplishments yet. Complete your first ordinary upgrade to begin.
        </Text>
      ) : (
        <ol>
          {[...data.receipts].reverse().map((r) => (
            <li key={r.id}>
              <div>
                <strong>{accomplishmentTitle(r.objective)}</strong>
                <details>
                  <summary>Why this matters</summary>
                  <Text>{r.explanation}</Text>
                </details>
                <small>
                  {new Date(r.granted_at.at_ms).toLocaleString()} ·{' '}
                  {bodyName(
                    view.bodies.find((b) => b.id === r.homeworld) ?? {
                      name: 'Homeworld',
                      kind: 'Planet',
                    },
                  )}
                </small>
              </div>
              {Object.values(r.resources).some((n) => BigInt(n) > 0n) ? (
                <div>
                  <span>Paid to homeworld</span>
                  <ResourceSummary value={r.resources} />
                </div>
              ) : (
                <span>Accomplished · no resource payment</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </details>
  )
}

function revealOpening(id: string) {
  const element = document.getElementById(id)
  if (element instanceof HTMLDetailsElement) element.open = true
  const focus =
    element instanceof HTMLDetailsElement
      ? element.querySelector('summary')
      : element
  if (focus instanceof HTMLElement) {
    focus.focus({ preventScroll: true })
    focus.scrollIntoView({ block: 'start' })
  }
}
