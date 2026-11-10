import { History } from 'lucide-react'
import type { AllianceDetail } from '../../client-model/alliances'
import { EmptyState } from '../../ui/empty-state'
import { PlayerName } from '../player-name'
import { auditAction, auditSubject, type AuditEntry } from './audit-model'
import styles from './audit.module.css'

function Target({
  subject,
  detail,
}: {
  subject: AuditEntry['subject']
  detail: AllianceDetail
}) {
  if (!subject) return <span className={styles.empty}>—</span>
  return subject.player ? (
    <PlayerName
      player={subject.player}
      fallback={subject.label}
      alliance={
        detail.members?.some((m) => m.player === subject.player)
          ? detail.summary
          : undefined
      }
    />
  ) : (
    <span title={`${subject.kind}: ${subject.label}`}>{subject.label}</span>
  )
}

export function Audit({ detail }: { detail: AllianceDetail }) {
  if (!detail.audit?.length)
    return (
      <EmptyState
        icon={History}
        title="No activity yet"
        description="Alliance changes will appear here, with who made them and when."
        variant="compact"
        headingLevel={3}
      />
    )
  return (
    <section aria-label="Alliance audit history">
      <table
        className={styles.table}
        aria-label="Alliance activity, newest first"
      >
        <thead>
          <tr>
            <th scope="col" className={styles.actor}>
              Player
            </th>
            <th scope="col">Action</th>
            <th scope="col" className={styles.target}>
              Target
            </th>
            <th
              scope="col"
              className={styles.when}
              title={`Times shown in ${Intl.DateTimeFormat().resolvedOptions().timeZone}`}
            >
              Date / time
            </th>
          </tr>
        </thead>
        <tbody>
          {detail.audit.map((entry) => {
            const subject = auditSubject(entry, detail)
            const date = new Date(entry.at)
            return (
              <tr key={entry.id}>
                <td className={styles.actor}>
                  <PlayerName
                    player={entry.actor}
                    fallback={entry.actor_name}
                    alliance={
                      detail.members?.some((m) => m.player === entry.actor)
                        ? detail.summary
                        : undefined
                    }
                  />
                </td>
                <td>
                  <span>{auditAction(entry)}</span>
                  {subject && (
                    <div className={styles.mobileTarget}>
                      <Target subject={subject} detail={detail} />
                    </div>
                  )}
                </td>
                <td className={styles.target}>
                  <Target subject={subject} detail={detail} />
                </td>
                <td className={styles.when}>
                  <time
                    dateTime={date.toISOString()}
                    title={date.toLocaleString()}
                  >
                    <span>
                      {date.toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                    <span className={styles.time}>
                      {date.toLocaleTimeString(undefined, {
                        hour: 'numeric',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </time>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
