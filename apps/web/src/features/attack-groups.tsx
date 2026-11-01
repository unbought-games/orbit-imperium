import { useState } from 'react'
import { useStore } from 'zustand'
import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import { currentServerTime } from '../client-model/game-projection'
import { useGameScreen } from '../shell/screen-context'
import { Button } from '../ui/button'
import { Field, Input } from '../ui/form'
import { Heading, Text } from '../ui/typography'
import { PlayerName } from './player-name'
import { CoordinateLink } from './coordinate-link'
import { ShipComposition } from './ship-composition'
import { exactTime } from './mission-presentation'
import { useRankings } from './use-rankings'
import { useGroupCommand } from './use-group-command'
import { attackGroupStatus } from './attack-group-model'
import styles from './attack-groups.module.css'
type S = components['schemas']

export function AttackGroupAction({
  model,
  action,
  children,
}: {
  model: Coordinator
  action: S['WorldAction4']
  children: React.ReactNode
}) {
  const order = useGroupCommand(model, action)
  return (
    <span className={styles.action}>
      <Button
        variant="ghost"
        disabled={order.pending}
        onClick={() => void order.send()}
      >
        {order.pending ? 'Order pending…' : children}
      </Button>
      {order.error && <Text role="alert">{order.error}</Text>}
    </span>
  )
}
function InvitePlayers({
  model,
  group,
  viewer,
}: {
  model: Coordinator
  group: S['AttackGroup4']
  viewer: string
}) {
  const ranking = useRankings(model, viewer)
  return (
    <div className={styles.invite}>
      <Field>
        <span>Find a player</span>
        <Input
          value={ranking.search}
          onChange={(e) => ranking.filter(e.target.value)}
          placeholder="Player name"
        />
      </Field>
      {ranking.loading && !ranking.data && <Text>Loading players…</Text>}
      {ranking.error && (
        <>
          <Text role="alert">{ranking.error}</Text>
          <Button onClick={ranking.refresh}>Retry players</Button>
        </>
      )}
      {ranking.data && ranking.window.count === 0 && (
        <Text>No matching players.</Text>
      )}
      {ranking.window.rows
        .filter((p) => p.player !== viewer)
        .map((p) => (
          <div className={styles.row} key={p.player}>
            <span>{p.username}</span>
            {group.invitations?.includes(p.player) ? (
              <Text>Invited</Text>
            ) : (
              <AttackGroupAction
                model={model}
                action={{
                  type: 'InviteAttackGroup',
                  group: group.id,
                  player: p.player,
                }}
              >
                Invite {p.username}
              </AttackGroupAction>
            )}
          </div>
        ))}
      {ranking.window.start > 0 && (
        <Button
          onClick={() => ranking.browse(Math.max(0, ranking.window.start - 50))}
        >
          Previous players
        </Button>
      )}
      {ranking.window.start + ranking.window.rows.length <
        ranking.window.count && (
        <Button onClick={() => ranking.browse(ranking.window.start + 50)}>
          More players
        </Button>
      )}
    </div>
  )
}
function GroupCard({
  model,
  group,
  view,
}: {
  model: Coordinator
  group: S['AttackGroup4']
  view: S['BoundView4']
}) {
  const [inviting, setInviting] = useState(false)
  const now = useStore(model.store, currentServerTime)
  const status = attackGroupStatus(group, now)
  const { prepareDispatch } = useGameScreen()
  return (
    <article className={styles.group} aria-label="Alliance attack group">
      <header className={styles.row}>
        <Heading level={3}>
          Attack on <CoordinateLink at={group.coordinates} />
        </Heading>
        <Text>{status.label}</Text>
      </header>
      <Text>
        Organized by{' '}
        <PlayerName player={group.initiator} names={view.player_names} /> ·{' '}
        {status.owners}/5 players · {group.members.length}/16 fleets
      </Text>
      <Text>
        Shared arrival:{' '}
        <time dateTime={new Date(group.arrival_at).toISOString()}>
          {exactTime(group.arrival_at)}
        </time>
      </Text>
      <div className={styles.members}>
        {group.members.map((member, index) => (
          <div
            className={styles.member}
            key={member.own_fleet ?? `${member.owner}:${index}`}
          >
            <PlayerName player={member.owner} names={view.player_names} />
            <ShipComposition ships={member.ships} />
          </div>
        ))}
      </div>
      <div className={styles.actions}>
        {status.canJoin && (
          <Button
            onClick={() =>
              prepareDispatch({
                mission: 'Attack',
                coordinates: group.coordinates,
                target: group.target,
                attackGroup: group.id,
              })
            }
          >
            Join attack
          </Button>
        )}
        {group.initiator === view.binding.player && status.open && (
          <Button
            variant="ghost"
            onClick={() => setInviting(!inviting)}
            aria-expanded={inviting}
          >
            {inviting ? 'Close player search' : 'Invite players'}
          </Button>
        )}
      </div>
      {inviting && status.open && (
        <InvitePlayers
          model={model}
          group={group}
          viewer={view.binding.player}
        />
      )}
      {!!group.invitations?.length && (
        <details>
          <summary>Invitations ({group.invitations.length})</summary>
          {group.invitations.map((player) => (
            <div key={player} className={styles.row}>
              <PlayerName player={player} names={view.player_names} />
              {status.open && (
                <AttackGroupAction
                  model={model}
                  action={{
                    type: 'RevokeAttackGroupInvitation',
                    group: group.id,
                    player,
                  }}
                >
                  Revoke invitation
                </AttackGroupAction>
              )}
            </div>
          ))}
        </details>
      )}
      <Text>
        Each fleet pays its own fuel and uses its own slot. Recalling a fleet
        does not bring the group’s arrival forward.
      </Text>
    </article>
  )
}
export function AttackGroups({
  model,
  view,
}: {
  model: Coordinator
  view: S['BoundView4']
}) {
  if (!view.attack_groups?.length) return null
  return (
    <section className={styles.groups} aria-label="Alliance attacks">
      <Heading level={2}>Alliance attacks</Heading>
      {view.attack_groups.map((group) => (
        <GroupCard key={group.id} model={model} group={group} view={view} />
      ))}
    </section>
  )
}
