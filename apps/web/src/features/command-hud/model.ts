import type { components } from '../../contracts'
import type { Attempt } from '../../client-model/commands'
import type { GameState } from '../../client-model/game-store'
import { acceptedEntityReference } from '../../client-model/game-projection'
import { isHostileMission } from '../../client-model/hostile-fleets'
import { projectedReportHeader } from '../../client-model/report-state'
import { coordinates, label } from '../../ui/format'
import { formatDuration } from '../../client-model/duration'
import { incomingManifest, missionLocation } from '../mission-presentation'
import { reportPreview } from '../report-preview'

type S = components['schemas']
export type HudTarget = {
  kind: 'command' | 'report' | 'conversation' | 'circular' | 'incoming'
  id: string
}
export type HudNotice = HudTarget & { shownAt: number }
export type HudTone = 'ice' | 'champagne' | 'green' | 'red'
export type HudIcon =
  | 'spy'
  | 'fleet'
  | 'building'
  | 'research'
  | 'shipyard'
  | 'defense'
  | 'report'
  | 'message'
  | 'attack'
  | 'scan'
export type NoticeContent = {
  title: string
  detail: string
  tone: HudTone
  icon: HudIcon
  deadline?: number
  costs?: S['Resources']
  body?: string
}
export const noticeKey = (target: HudTarget) => `${target.kind}:${target.id}`
export const incomingKey = (fleet: S['IncomingMission4']) =>
  JSON.stringify([
    fleet.sender,
    fleet.origin,
    fleet.target,
    fleet.mission,
    fleet.arrival_at,
  ])
export function incomingThreats(state: GameState) {
  return state.view?.protocol === 4
    ? state.view.missions.incoming.filter((f) => isHostileMission(f.mission))
    : []
}
export function incomingAttacks(state: GameState) {
  return incomingThreats(state).filter((fleet) => fleet.mission === 'Attack')
}
export function unreadReports(state: GameState) {
  return [...state.reportHeaders.keys()]
    .flatMap((id) => {
      const header = projectedReportHeader(
        state.reportHeaders,
        state.attempts.values(),
        id,
      )
      return header && !header.hidden && !header.read ? [header] : []
    })
    .sort((a, b) => b.observed_at - a.observed_at)
}
export function unreadTargets(state: GameState): HudTarget[] {
  return [
    ...unreadReports(state).map((report) => ({
      kind: 'report' as const,
      id: report.id,
    })),
    ...(state.mailbox?.conversations
      .filter((c) => c.unread && !c.contact.blocked)
      .map((c) => ({ kind: 'conversation' as const, id: c.latest.id })) ?? []),
    ...(state.mailbox?.circulars
      .filter((c) => !c.read)
      .map((c) => ({ kind: 'circular' as const, id: c.id })) ?? []),
  ]
}
export function unreadBadgeCount(state: GameState) {
  return Math.min(99, new Set(unreadTargets(state).map(noticeKey)).size)
}
export function hasUnreadIntelligence(state: GameState) {
  return (
    (state.view?.protocol === 4 && state.view.has_unread_reports === true) ||
    unreadTargets(state).length > 0
  )
}
export function isHudCommand(attempt: Attempt) {
  const command = attempt.envelope.command
  return (
    [
      'StartUpgrade',
      'StartDemolition',
      'StartResearch',
      'StartManufacture',
      'LaunchTransport',
    ].includes(command.type) ||
    (command.type === 'World' && command.action.type === 'LaunchFleet')
  )
}
/** Capture transitions, never replay the saved command ledger when entering the game. */
export function changedHudTargets(
  before: GameState,
  after: GameState,
): HudTarget[] {
  const changes: HudTarget[] = []
  for (const [key, attempt] of after.attempts) {
    if (
      attempt.status === 'committed' &&
      before.attempts.get(key)?.status !== 'committed' &&
      before.attempts.has(key) &&
      isHudCommand(attempt)
    )
      changes.push({ kind: 'command', id: key })
  }
  const oldThreats = new Set(incomingThreats(before).map(incomingKey))
  for (const threat of incomingThreats(after))
    if (!oldThreats.has(incomingKey(threat)))
      changes.push({ kind: 'incoming', id: incomingKey(threat) })
  // First inbox hydration supplies the persistent orb; only subsequent arrivals toast.
  if (before.reportInbox && before.reportInbox !== after.reportInbox)
    for (const report of unreadReports(after))
      if (
        after.reportInbox?.items.includes(report.id) &&
        !before.reportHeaders.has(report.id)
      )
        changes.push({ kind: 'report', id: report.id })
  if (before.mailbox && before.mailbox !== after.mailbox) {
    const oldMessages = new Set(
      before.mailbox.conversations.map((c) => c.latest.id),
    )
    const oldCirculars = new Set(before.mailbox.circulars.map((c) => c.id))
    for (const c of after.mailbox?.conversations ?? [])
      if (c.unread && !c.contact.blocked && !oldMessages.has(c.latest.id))
        changes.push({ kind: 'conversation', id: c.latest.id })
    for (const c of after.mailbox?.circulars ?? [])
      if (!c.read && !oldCirculars.has(c.id))
        changes.push({ kind: 'circular', id: c.id })
  }
  return [
    ...new Map(changes.map((target) => [noticeKey(target), target])).values(),
  ]
}
function commandContent(state: GameState, key: string): NoticeContent | null {
  const attempt = state.attempts.get(key)
  const view = state.view
  if (!attempt || !view || attempt.status !== 'committed') return null
  const command = attempt.envelope.command
  const quote = state.intents.get(key)?.quote
  const material =
    quote && 'request' in quote
      ? 'terms_hash' in quote
        ? quote.terms
        : quote.protocol !== 2
          ? quote.terms.material
          : null
      : null
  if (
    command.type === 'World' &&
    command.action.type === 'LaunchFleet' &&
    view.protocol === 4
  ) {
    const intent = command.action.intent
    const fleet = view.missions.fleets.find(
      (f) => f.id === acceptedEntityReference(state, attempt),
    )
    return {
      title: intent.mission === 'Espionage' ? 'Probe away' : 'Fleet dispatched',
      detail: `${label(intent.mission)}${fleet ? ` · ${coordinates({ coordinates: fleet.destination })}` : ' · Awaiting confirmed flight timing'}`,
      tone: 'ice',
      icon: intent.mission === 'Espionage' ? 'spy' : 'fleet',
      deadline: fleet?.due_at,
      body: intent.origin,
    }
  }
  if (command.type === 'StartUpgrade' || command.type === 'StartDemolition')
    return {
      title:
        command.type === 'StartUpgrade'
          ? 'Construction started'
          : 'Demolition started',
      detail: `${label(command.building)}${material?.type === 'Building' ? ` → level ${material.target_level} · ${formatDuration(material.duration_ms)}` : ''}`,
      tone: 'green',
      icon: 'building',
      body: command.body,
    }
  if (command.type === 'StartResearch')
    return {
      title: 'Research started',
      detail: `${label(command.research)}${material?.type === 'Research' ? ` → level ${material.target_level} · ${formatDuration(material.duration_ms)}` : ''}`,
      tone: 'green',
      icon: 'research',
      body: command.host,
    }
  if (command.type === 'StartManufacture')
    return {
      title:
        command.item.kind === 'Defense'
          ? 'Defense order accepted'
          : 'Shipyard order accepted',
      detail: `${command.quantity} ${label(command.item.id)}${material?.type === 'Manufacture' ? ` · ${formatDuration(material.unit_duration_ms)} each` : ''}`,
      costs: material?.type === 'Manufacture' ? material.paid : undefined,
      tone: 'green',
      icon: command.item.kind === 'Defense' ? 'defense' : 'shipyard',
      body: command.body,
    }
  if (command.type === 'LaunchTransport')
    return {
      title: 'Transport dispatched',
      detail: 'Order confirmed',
      tone: 'ice',
      icon: 'fleet',
      body: command.origin,
    }
  return null
}
export function noticeContent(
  state: GameState,
  target: HudTarget,
): NoticeContent | null {
  if (target.kind === 'command') return commandContent(state, target.id)
  if (target.kind === 'report') {
    const header = projectedReportHeader(
      state.reportHeaders,
      state.attempts.values(),
      target.id,
    )
    if (!header || header.hidden) return null
    const preview = reportPreview(header.preview, state.binding?.player)
    return {
      title: `${label(header.kind)} report`,
      detail: preview.location || 'New intelligence · Tap to read',
      tone: 'champagne',
      icon: header.kind === 'SpyContact' ? 'scan' : 'report',
    }
  }
  if (target.kind === 'conversation') {
    const c = state.mailbox?.conversations.find(
      (c) => c.latest.id === target.id && !c.contact.blocked,
    )
    return c
      ? {
          title: 'Message received',
          detail: `${c.contact.username} · Tap to read`,
          tone: 'champagne',
          icon: 'message',
        }
      : null
  }
  if (target.kind === 'circular') {
    const c = state.mailbox?.circulars.find((c) => c.id === target.id)
    return c
      ? {
          title: 'Alliance transmission',
          detail: `[${c.alliance_tag}] ${c.sender_name} · Tap to read`,
          tone: 'champagne',
          icon: 'message',
        }
      : null
  }
  const fleet = incomingThreats(state).find((f) => incomingKey(f) === target.id)
  if (!fleet || !state.view) return null
  const body = state.view.bodies.find((b) => b.id === fleet.target)
  return {
    title:
      fleet.mission === 'Attack'
        ? 'Hostile fleet inbound'
        : 'Enemy probes detected',
    detail: `${incomingManifest(fleet.ships)} → ${body ? missionLocation(state.view, body.id, body.coordinates) : 'Unrevealed location'}`,
    tone: fleet.mission === 'Attack' ? 'red' : 'champagne',
    icon: fleet.mission === 'Attack' ? 'attack' : 'scan',
    deadline: fleet.arrival_at,
    body: fleet.target,
  }
}
export function orbAppearance(state: GameState, notices: HudNotice[]) {
  const attack = incomingThreats(state).some((f) => f.mission === 'Attack')
  if (attack)
    return {
      tone: 'red' as HudTone,
      icon: 'attack' as HudIcon,
    }
  const success = notices
    .map((n) => noticeContent(state, n))
    .find((c) => c?.tone === 'green')
  if (success)
    return {
      tone: 'green' as HudTone,
      icon: success.icon,
    }
  if (hasUnreadIntelligence(state))
    return {
      tone: 'champagne' as HudTone,
      icon: 'message' as HudIcon,
    }
  return {
    tone: 'ice' as HudTone,
    icon: null,
  }
}
