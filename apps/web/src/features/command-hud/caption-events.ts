import { connectionStatus } from '../../client-model/connection-status'
import type { components } from '../../contracts'
import type { GameState } from '../../client-model/game-store'
import {
  changedHudTargets,
  hasUnreadIntelligence,
  incomingThreats,
  noticeContent,
  noticeKey,
} from './model'
import type { CaptionEvent, CaptionEventKind } from './caption-engine'
type Header = components['schemas']['ReportHeader4']

/** Detection is not destruction. Use the recipient's confirmed loss/outcome only. */
export function lostSpyProbes(header: Header, state: GameState) {
  const preview = header.preview
  if (preview?.kind === 'Combat')
    return (
      preview.mission === 'Espionage' &&
      (preview.outcome === 'DefenderVictory' ||
        preview.outcome === 'MutualDestruction') &&
      !!preview.participants?.some(
        (p) => p.owner === state.binding?.player && p.side === 'Attacker',
      )
    )
  if (
    preview?.kind !== 'ContactLost' ||
    !preview.own_lost_ships?.length ||
    !preview.own_lost_ships.every(
      (ship) => ship.ship_type === 'EspionageProbe' && BigInt(ship.count) > 0n,
    )
  )
    return false
  // First-round destruction hides combat details. Match its companion spy report,
  // rather than assuming that every probe-only fleet was sent on a spy mission.
  return [...state.reportHeaders.values()].some(
    ({ header: spy }) =>
      spy.observed_at === header.observed_at &&
      spy.preview?.kind === 'Espionage' &&
      spy.preview.counterespionage?.detected === true &&
      !!preview.target &&
      spy.preview.target?.coordinates.galaxy === preview.target.galaxy &&
      spy.preview.target?.coordinates.system === preview.target.system &&
      spy.preview.target?.coordinates.position === preview.target.position,
  )
}
export function initialCaptionEvents(state: GameState): CaptionEvent[] {
  const connection = connectionStatus(state)
  if (connection?.kind === 'connection')
    return [{ id: 'initial:disconnected', kind: 'disconnected' }]
  if (connection) return []
  if (incomingThreats(state).length) return []
  return [
    {
      id: 'initial:ready',
      kind: hasUnreadIntelligence(state) ? 'unread' : 'ready',
    },
  ]
}
export function captionEvents(
  before: GameState,
  after: GameState,
): CaptionEvent[] {
  const events: CaptionEvent[] = []
  const wasDisconnected = connectionStatus(before)?.kind === 'connection'
  const disconnected = connectionStatus(after)?.kind === 'connection'
  if (wasDisconnected !== disconnected)
    events.push({
      id: `connection:${disconnected}:${after.now}`,
      kind: disconnected ? 'disconnected' : 'reconnected',
    })
  if (!hasUnreadIntelligence(before) && hasUnreadIntelligence(after))
    events.push({ id: 'explain:unread', kind: 'unread' })
  for (const target of changedHudTargets(before, after)) {
    let kind: CaptionEventKind = 'report.received'
    const content = noticeContent(after, target)
    if (target.kind === 'command') {
      const kinds = {
        spy: 'probe.launched',
        fleet: 'fleet.launched',
        building: 'building.started',
        research: 'research.started',
        shipyard: 'shipyard.queued',
        defense: 'defense.queued',
      } as const
      if (content && content.icon in kinds)
        kind = kinds[content.icon as keyof typeof kinds]
    } else if (target.kind === 'incoming')
      kind = content?.icon === 'attack' ? 'attack.incoming' : 'spy.incoming'
    else if (target.kind === 'conversation' || target.kind === 'circular')
      kind = 'message.received'
    else if (target.kind === 'report') {
      const header = after.reportHeaders.get(target.id)?.header
      if (header?.kind === 'SpyContact') kind = 'spy.incoming'
      else if (header && lostSpyProbes(header, after)) kind = 'probe.destroyed'
    }
    events.push({ id: noticeKey(target), kind })
  }
  return events
}
