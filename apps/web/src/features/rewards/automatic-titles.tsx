import type { CommunityOwner } from '../../adapters/community-rewards'
import { ButtonLinkAnchor } from '../../ui/button'
import { Disclosure } from '../../ui/disclosure'
import styles from './automatic-titles.module.css'

type Milestone = CommunityOwner['milestones'][number]

export function automaticTitleMilestones(owner: CommunityOwner) {
  const milestones = [...owner.milestones]
  if (
    owner.next_milestone &&
    !milestones.some((milestone) => milestone.id === owner.next_milestone?.id)
  )
    milestones.push(owner.next_milestone)
  return milestones.filter((milestone) => milestone.automatic_titles?.length)
}

function cosmeticChoices(milestone: Milestone) {
  if (!milestone.unlocked)
    return `Plus ${milestone.selections} permanent cosmetic ${milestone.selections === 1 ? 'choice' : 'choices'}.`
  if (!milestone.remaining) return 'Cosmetic choices claimed.'
  return `Plus ${milestone.remaining} cosmetic ${milestone.remaining === 1 ? 'choice' : 'choices'} available below.`
}

/** Bound the default overview even when Accounts publishes a long roadmap. */
export function automaticTitleSummary(owner: CommunityOwner) {
  const milestones = automaticTitleMilestones(owner).sort(
    (a, b) => a.threshold - b.threshold,
  )
  const latest = milestones.filter((milestone) => milestone.unlocked).at(-1)
  const next = milestones.find((milestone) => !milestone.unlocked)
  return [latest, next].filter(
    (milestone): milestone is Milestone => !!milestone,
  )
}

export function MilestoneTitles({ milestone }: { milestone: Milestone }) {
  if (!milestone.automatic_titles?.length) return null
  return (
    <ul className={styles.titles} aria-label="Automatic title benefit">
      {milestone.automatic_titles.map((title) => (
        <li key={title.id}>
          <strong>{title.name}</strong>
          <span>
            {title.owned
              ? 'Earned permanently · awarded automatically'
              : milestone.unlocked
                ? 'Unlocked · automatic award pending'
                : `Awarded automatically at ${milestone.threshold} Renown`}
          </span>
          {!title.supported && <span>Not supported in this game.</span>}
        </li>
      ))}
    </ul>
  )
}

function TitleMilestones({ milestones }: { milestones: Milestone[] }) {
  return (
    <ul className={styles.milestones}>
      {milestones.map((milestone) => (
        <li key={milestone.id} className={styles.milestone}>
          <h3>{milestone.threshold} Renown</h3>
          <MilestoneTitles milestone={milestone} />
          <p>{cosmeticChoices(milestone)}</p>
        </li>
      ))}
    </ul>
  )
}

export function AutomaticTitles({
  owner,
  player,
}: {
  owner: CommunityOwner
  player: string
}) {
  const milestones = automaticTitleMilestones(owner)
  const summary = automaticTitleSummary(owner)
  if (!milestones.length) return null
  const hasUsableTitle = milestones.some((milestone) =>
    milestone.automatic_titles?.some((title) => title.owned && title.supported),
  )
  return (
    <section aria-label="Automatic milestone titles" className={styles.section}>
      <h2>Your Renown titles</h2>
      <p>
        Titles are automatic and permanent, alongside your cosmetic choice.
        Earning one never changes your current title.
      </p>
      <TitleMilestones milestones={summary} />
      {milestones.length > summary.length && (
        <Disclosure summary={`View all ${milestones.length} title milestones`}>
          <TitleMilestones milestones={milestones} />
        </Disclosure>
      )}
      {hasUsableTitle && (
        <ButtonLinkAnchor
          variant="secondary"
          href={`/profiles/empire/${player}`}
        >
          Choose your displayed title
        </ButtonLinkAnchor>
      )}
    </section>
  )
}
