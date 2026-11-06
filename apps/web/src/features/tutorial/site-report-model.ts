import type { components } from '../../contracts'
type Payload = components['schemas']['SiteEncounterPayload4']
export function siteBattleSummary(payload: Payload, viewer?: string) {
  const own = (owner: components['schemas']['CombatIdentity4']) =>
    'Player' in owner && owner.Player === viewer
  const units = (rows: Payload['battle']['survivors'], npc: boolean) =>
    rows
      .filter((r) => (npc ? 'Npc' in r.owner : own(r.owner)))
      .flatMap((r) => r.units)
  return {
    outcome: {
      AttackerVictory: 'Attack successful',
      DefenderVictory: 'Defenders held',
      MutualDestruction: 'All ships destroyed',
      Draw: 'Combat ended in a draw',
    }[payload.battle.outcome],
    ownSurvivors: units(payload.battle.survivors, false),
    ownLosses: units(payload.battle.gross_losses, false),
    npcSurvivors: units(payload.battle.survivors, true),
    npcLosses: units(payload.battle.gross_losses, true),
  }
}
