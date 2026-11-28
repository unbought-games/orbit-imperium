import {
  activeAttempt,
  currentServerTime,
} from '../client-model/game-projection'
import type { GameState } from '../client-model/game-store'
import type { components } from '../contracts'

function targetKey(body: string, kind: 'Planet' | 'Moon', owner: string) {
  return `${body}/${kind}/${owner}`
}

/** Live fleet facts are independent of when the report was observed. */
export function outboundFleetTargets(state: GameState) {
  const targets = new Set<string>()
  const { view } = state
  if (!state.ready || state.stale || view?.protocol !== 4) return targets

  const recalls = new Set<string>()
  for (const attempt of state.attempts.values()) {
    const command = attempt.envelope.command
    if (
      command.type === 'World' &&
      command.action.type === 'RecallMission' &&
      activeAttempt(attempt, view)
    )
      recalls.add(command.action.fleet)
  }

  const now = currentServerTime(state)
  for (const fleet of view.missions.fleets) {
    const destination = fleet.intent.destination
    if (
      destination.type === 'Body' &&
      fleet.leg === 'Outbound' &&
      fleet.due_at > now &&
      !recalls.has(fleet.id)
    )
      targets.add(
        targetKey(
          destination.id,
          destination.expected_kind,
          destination.expected_owner,
        ),
      )
  }
  return targets
}

export function reportHasOutboundFleet(
  preview: components['schemas']['ReportPreview4'] | undefined,
  targets: ReadonlySet<string>,
) {
  if (preview?.kind !== 'Espionage' || !preview.target) return false
  const { body, kind, owner } = preview.target
  return targets.has(targetKey(body, kind, owner))
}
