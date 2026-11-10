import { UsersRound } from 'lucide-react'
import { EmptyState } from '../../ui/empty-state'
import { ButtonLinkAnchor } from '../../ui/button'
import applicationStyles from './applications.module.css'
import { PlayerName } from '../player-name'
import { can, type AllianceDetail } from '../../client-model/alliances'
import { Button } from '../../ui/button'
import { ConfirmAction, Markdown, type Run } from './shared'
export { Roster } from './roster'
import styles from './alliances.module.css'
export function Applications({
  detail,
  run,
  busy,
}: {
  detail: AllianceDetail
  run: Run
  busy: boolean
}) {
  const hasApplications = !!detail.applications?.length
  const recruitmentLink = (
    <ButtonLinkAnchor
      variant="secondary"
      size={hasApplications ? 'inline' : 'default'}
      href={`/alliances/${detail.summary.universe}/${detail.summary.id}`}
    >
      Recruitment page
    </ButtonLinkAnchor>
  )
  return (
    <section className={styles.stack} aria-label="Recruitment applications">
      {hasApplications ? (
        <header className={applicationStyles.header}>
          <h3>Applications</h3>
          {recruitmentLink}
        </header>
      ) : (
        <EmptyState
          icon={UsersRound}
          title="No pending applications"
          description="Your next ally could be a link away. Share your recruitment page to help players find your alliance."
          actions={recruitmentLink}
          headingLevel={3}
          className={applicationStyles.empty}
        />
      )}
      {hasApplications && detail.summary.recruitment === 'Closed' && (
        <p className={applicationStyles.hint}>
          Recruitment is closed. You can still accept or reject these
          applications.
        </p>
      )}
      {detail.applications?.map((application) => (
        <article className={styles.card} key={application.id}>
          <h4>
            <PlayerName
              player={application.player}
              fallback={application.username}
              alliance={null}
            />
          </h4>
          <Markdown text={application.text} />
          {can(detail, 'ProcessApplications') && (
            <div className={styles.actions}>
              <Button
                disabled={busy}
                onClick={() =>
                  void run({
                    type: 'Accept',
                    alliance: detail.summary.id,
                    application: application.id,
                  })
                }
              >
                Accept {application.username}
              </Button>
              <ConfirmAction
                label={`Reject ${application.username}`}
                description={`Reject ${application.username}’s application?`}
                disabled={busy}
                onConfirm={() =>
                  run({
                    type: 'Reject',
                    alliance: detail.summary.id,
                    application: application.id,
                  })
                }
              />
            </div>
          )}
        </article>
      ))}
    </section>
  )
}
export { Settings } from './settings'
export { Audit } from './audit'
