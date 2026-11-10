import { Info } from 'lucide-react'
import { PlayerName } from '../player-name'
import { can, type AllianceDetail } from '../../client-model/alliances'
import { Popover } from '../../ui/popover'
import { MemberActions } from './member-actions'
import { activityDescriptions, rosterEntries } from './roster-model'
import type { Run } from './shared'
import styles from './roster.module.css'

export function Roster({
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
  const activity = can(detail, 'ViewActivity')
  return (
    <section aria-label="Alliance roster" className={styles.roster}>
      <table className={styles.table} aria-label="Alliance members">
        <thead>
          <tr>
            <th scope="col">Player</th>
            <th scope="col" className={styles.roleColumn}>
              Role
            </th>
            {activity && (
              <th scope="col" className={styles.activityColumn}>
                <span className={styles.activityHeading}>
                  Activity{' '}
                  <Popover
                    label="Activity"
                    trigger={<Info size={14} aria-hidden="true" />}
                  >
                    <p>Recent: active in the last 15 minutes.</p>
                    <p>Away: active within seven days.</p>
                    <p>
                      Inactive: seven days or more. Exact times are private.
                    </p>
                  </Popover>
                </span>
              </th>
            )}
            <th scope="col" className={styles.joinedColumn}>
              Joined
            </th>
            <th scope="col" className={styles.actionsColumn}>
              <span className={styles.srOnly}>Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rosterEntries(detail).map(({ member, leader, roleLabel }) => (
            <tr key={member.player}>
              <td className={styles.player}>
                <span className={styles.name}>
                  <PlayerName
                    player={member.player}
                    fallback={member.username}
                    alliance={detail.summary}
                  />
                </span>
                {member.player === player && (
                  <span className={styles.you}>You</span>
                )}
                <span
                  className={styles.mobileRole}
                  data-leader={leader || undefined}
                >
                  {roleLabel}
                </span>
              </td>
              <td
                className={styles.roleColumn}
                data-leader={leader || undefined}
              >
                {roleLabel}
              </td>
              {activity && (
                <td className={styles.activityColumn}>
                  {member.activity && (
                    <span
                      className={styles.activity}
                      data-activity={member.activity}
                      title={activityDescriptions[member.activity]}
                    >
                      {member.activity}
                    </span>
                  )}
                </td>
              )}
              <td className={styles.joinedColumn}>
                <time
                  dateTime={new Date(member.joined_at).toISOString()}
                  title={new Date(member.joined_at).toLocaleDateString()}
                  aria-label={`Joined ${new Date(member.joined_at).toLocaleDateString()}`}
                >
                  {new Date(member.joined_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </time>
              </td>
              <td className={styles.actionsColumn}>
                <MemberActions
                  detail={detail}
                  member={member}
                  player={player}
                  run={run}
                  busy={busy}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
