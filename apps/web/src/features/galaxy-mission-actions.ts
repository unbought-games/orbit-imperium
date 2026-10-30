import type { BoundView } from '../client-model/commands'
import type { components } from '../contracts'
import type { colonizationStatus } from '../client-model/colonization'
import { dispatchFailure } from '../client-model/dispatch-validation'

export type GalaxyMissionCapabilities = {
  transport: boolean
  attack: boolean
  harvest: boolean
  deploy: boolean
}

export function galaxyMissionCapabilities(
  view: Pick<BoundView, 'capabilities'> | null,
): GalaxyMissionCapabilities {
  const enabled = (name: string) =>
    view?.capabilities.some((c) => c.capability === name && c.enabled) ?? false
  return {
    transport: enabled('Transport'),
    attack: enabled('Attack'),
    harvest: enabled('Harvest'),
    deploy: enabled('Deploy'),
  }
}

export const protectionExplanation =
  'Beginner protection blocks attacks and espionage between you and this player because of the difference in empire strength.'

type MissionAction = {
  mission: 'Transport' | 'Deploy' | 'Attack' | 'Colonize' | 'Harvest'
  reason?: string
}

/** Target facts and enabled capabilities determine the menu, never cached UI state. */
export function galaxyMissionActions({
  position,
  player,
  origin,
  missions,
  colony,
}: {
  position: components['schemas']['GalaxyPosition4']
  player: string | undefined
  origin: string
  missions: GalaxyMissionCapabilities
  colony: ReturnType<typeof colonizationStatus>
}): MissionAction[] {
  const { body, debris } = position
  const actions: MissionAction[] = []
  if (body && body.id !== origin) {
    const vacation = body.vacation
      ? dispatchFailure('TargetVacation')
      : undefined
    if (missions.transport)
      actions.push({ mission: 'Transport', reason: vacation })
    if (body.owner === player) {
      if (missions.deploy) actions.push({ mission: 'Deploy', reason: vacation })
    } else if (missions.attack) {
      actions.push({
        mission: 'Attack',
        reason:
          body.attack_blocker === 'BeginnerProtected'
            ? protectionExplanation
            : body.attack_blocker
              ? dispatchFailure(body.attack_blocker)
              : vacation,
      })
    }
  }
  if (!body && !position.abandoned_until && colony.enabled)
    actions.push({ mission: 'Colonize' })
  // A debris field remains a target even at the selected origin's coordinates.
  if (debris && missions.harvest) actions.push({ mission: 'Harvest' })
  return actions
}
