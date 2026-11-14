import { useRewardsVisible } from '../../shell/community-rewards-context'
import { usePlayerIdentity } from '../../shell/player-profiles-context'
import { useIdentityTitle } from '../../client-model/use-identity-title'
import { AllianceHonors } from '../rewards/recognition'
import type { ComponentProps } from 'react'
import { ButtonLinkAnchor } from '../../ui/button'
import { Board } from './board'
import { Markdown } from './shared'
import styles from './presentation.module.css'
export function AllianceHall(props: ComponentProps<typeof Board>) {
  const rewardsVisible = useRewardsVisible()
  const identity = usePlayerIdentity(props.player)
  const title = useIdentityTitle(identity?.title)
  const { detail } = props,
    hall = detail.presentation?.hall,
    summary = detail.summary
  return (
    <div className={styles.hallLayout}>
      <div>
        <section className={styles.hallWelcome}>
          <h3>Welcome home, {title.address}.</h3>
          {hall?.welcome_markdown ? (
            <Markdown text={hall.welcome_markdown} />
          ) : (
            <p>
              Share a discovery, ask for a hand, or tell your allies what you’re
              building next.
            </p>
          )}
        </section>
        {rewardsVisible && <AllianceHonors alliance={summary.id} />}
        <Board {...props} />
      </div>
      <aside className={styles.hallAside}>
        {hall?.community_markdown && (
          <section>
            <h3>Our community</h3>
            <Markdown text={hall.community_markdown} />
          </section>
        )}
        <dl className={styles.hallFacts}>
          <div>
            <dt>Commanders</dt>
            <dd>{summary.member_count.toLocaleString()}</dd>
          </div>
          {summary.ranking && (
            <div>
              <dt>Universe standing</dt>
              <dd>#{summary.ranking.rank}</dd>
            </div>
          )}
          <div>
            <dt>Recruitment</dt>
            <dd>
              {summary.recruitment === 'Open'
                ? 'Open'
                : summary.recruitment === 'Application'
                  ? 'Applications open'
                  : 'Closed'}
            </dd>
          </div>
        </dl>
        <p>Know someone who belongs here?</p>
        <ButtonLinkAnchor
          variant="ghost"
          size="small"
          href={`/alliances/${summary.universe}/${summary.id}`}
        >
          Share our public page
        </ButtonLinkAnchor>
      </aside>
    </div>
  )
}
