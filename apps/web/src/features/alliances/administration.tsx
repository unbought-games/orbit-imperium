import { UsersRound } from 'lucide-react'
import { EmptyState } from '../../ui/empty-state'
import { ButtonLinkAnchor } from '../../ui/button'
import applicationStyles from './applications.module.css'
import { RecruitmentSettings } from './recruitment-settings'
import { PlayerName } from '../player-name'
import { can, type AllianceDetail } from '../../client-model/alliances'
import { Button } from '../../ui/button'
import { Field, Input, Select } from '../../ui/form'
import { ActionForm, ConfirmAction, Markdown, value, type Run } from './shared'
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
export function Settings({
  detail,
  player,
  run,
  busy,
}: {
  detail: AllianceDetail
  player: string
  run: Run
  busy: boolean
}) {
  const leader = player === detail.leader
  return (
    <section className={styles.stack} aria-label="Alliance settings">
      <h3>Profile and membership</h3>
      {(can(detail, 'EditProfile') || can(detail, 'ManageRecruitment')) && (
        <ActionForm
          draftKey={`settings:${detail.summary.id}`}
          label="Save alliance settings"
          busy={busy}
          onSubmit={(data) =>
            run({
              type: 'Update',
              alliance: detail.summary.id,
              name: can(detail, 'EditProfile')
                ? value(data, 'name')
                : detail.summary.name,
              tag: can(detail, 'EditProfile')
                ? value(data, 'tag')
                : detail.summary.tag,
              public_text: can(detail, 'EditProfile')
                ? value(data, 'public_text')
                : detail.public_text,
              recruitment: can(detail, 'ManageRecruitment')
                ? (value(
                    data,
                    'recruitment',
                  ) as AllianceDetail['summary']['recruitment'])
                : detail.summary.recruitment,
            })
          }
        >
          {can(detail, 'EditProfile') && (
            <>
              <Field>
                Alliance name
                <Input
                  name="name"
                  required
                  minLength={3}
                  maxLength={48}
                  defaultValue={detail.summary.name}
                />
              </Field>
              <Field>
                Alliance tag
                <Input
                  name="tag"
                  required
                  minLength={3}
                  maxLength={8}
                  pattern="[A-Za-z0-9]{3,8}"
                  defaultValue={detail.summary.tag}
                />
              </Field>
              <Field>
                Public recruitment text
                <textarea
                  name="public_text"
                  rows={8}
                  maxLength={8000}
                  defaultValue={detail.public_text}
                />
              </Field>
              <p>
                This text is public. Basic Markdown supported; HTML and images
                are disabled.
              </p>
            </>
          )}
          {can(detail, 'ManageRecruitment') && (
            <Field>
              Recruitment
              <Select
                name="recruitment"
                defaultValue={detail.summary.recruitment}
              >
                <option value="Open">Open — instant joining</option>
                <option value="Application">
                  Application — approval required
                </option>
                <option value="Closed">Closed — no new applications</option>
              </Select>
            </Field>
          )}
        </ActionForm>
      )}
      <RecruitmentSettings detail={detail} run={run} busy={busy} />
      <div className={styles.card}>
        <h4>{leader ? 'Leadership' : 'Leave alliance'}</h4>
        {leader ? (
          <>
            <p>
              Transfer leadership to an existing member before leaving. The
              transfer is immediate; you become a Member.
            </p>
            {detail.members
              ?.filter((m) => m.player !== player)
              .map((member) => (
                <div key={member.player} className={styles.actions}>
                  <ConfirmAction
                    label={`Transfer to ${member.username}`}
                    description={`Make ${member.username} leader of ${detail.summary.name}? They gain full authority immediately and you become a Member.`}
                    disabled={busy}
                    onConfirm={() =>
                      run({
                        type: 'Transfer',
                        alliance: detail.summary.id,
                        player: member.player,
                      })
                    }
                  />
                </div>
              ))}
            <ConfirmAction
              label="Disband alliance"
              description={`Permanently disband ${detail.summary.name} [${detail.summary.tag}], remove all memberships, and delete its private board and pending applications?`}
              disabled={busy}
              onConfirm={() =>
                run({ type: 'Disband', alliance: detail.summary.id })
              }
            />
          </>
        ) : (
          <ConfirmAction
            label="Leave alliance"
            description={`Leave ${detail.summary.name}? You immediately lose access to the private board and roster.`}
            disabled={busy}
            onConfirm={() =>
              run({ type: 'Leave', alliance: detail.summary.id })
            }
          />
        )}
      </div>
    </section>
  )
}
export function Audit({ detail }: { detail: AllianceDetail }) {
  return (
    <section className={styles.stack} aria-label="Alliance audit history">
      <h3>Audit history</h3>
      {!detail.audit?.length && <p>No recorded changes.</p>}
      {detail.audit?.map((entry) => (
        <article className={styles.card} key={entry.id}>
          <strong>
            <PlayerName
              player={entry.actor}
              fallback={entry.actor_name}
              alliance={
                detail.members?.some((member) => member.player === entry.actor)
                  ? detail.summary
                  : undefined
              }
            />
          </strong>{' '}
          · {entry.action}
          <p className={styles.meta}>
            {new Date(entry.at).toLocaleString()}
            {entry.target ? ` · Target: ${entry.target}` : ''}
          </p>
        </article>
      ))}
    </section>
  )
}
