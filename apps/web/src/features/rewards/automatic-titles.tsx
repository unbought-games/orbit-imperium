import type { CommunityOwner } from '../../adapters/community-rewards'
import { ButtonLinkAnchor } from '../../ui/button'
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

export function AutomaticTitles({
  owner,
  player,
}: {
  owner: CommunityOwner
  player: string
}) {
  const milestones = automaticTitleMilestones(owner)
  if (!milestones.length) return null
  const hasUsableTitle = milestones.some((milestone) =>
    milestone.automatic_titles?.some((title) => title.owned && title.supported),
  )
  return (
    <section aria-label="Automatic milestone titles" className={styles.section}>
      <h2>Your Renown titles</h2>
      <p>
        Each title is awarded automatically and kept permanently, alongside your
        cosmetic choice. You choose which title to display; earning one never
        changes your current title.
      </p>
      <ul className={styles.milestones}>
        {milestones.map((milestone) => (
          <li key={milestone.id} className={styles.milestone}>
            <h3>{milestone.threshold} Renown</h3>
            <ul className={styles.titles}>
              {milestone.automatic_titles?.map((title) => (
                <li key={title.id}>
                  <strong>{title.name}</strong>
                  <span>
                    {title.owned
                      ? 'Earned permanently'
                      : milestone.unlocked
                        ? 'Unlocked · automatic award pending'
                        : `Awarded automatically at ${milestone.threshold} Renown`}
                  </span>
                  {!title.supported && <span>Not supported in this game.</span>}
                </li>
              ))}
            </ul>
            <p>{cosmeticChoices(milestone)}</p>
          </li>
        ))}
      </ul>
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
