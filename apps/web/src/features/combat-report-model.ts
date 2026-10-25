import { playerLabel, type PlayerNames } from './player-label'
import { label } from '../ui/format'

export type Observation = Record<string, unknown>
export const record = (v: unknown): Observation =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Observation)
    : {}
const records = (v: unknown) => (Array.isArray(v) ? v.map(record) : [])
export const combatInteger = (v: unknown): bigint | null =>
  typeof v === 'string' && /^(0|[1-9][0-9]*)$/.test(v) ? BigInt(v) : null
const difference = (a: bigint | null, b: bigint | null) =>
  a !== null && b !== null && a >= b ? a - b : null
const total = (values: (bigint | null)[]) =>
  values.reduce<bigint | null>(
    (sum, n) => (sum === null || n === null ? null : sum + n),
    0n,
  )
const originKey = (v: unknown) => {
  const origin = record(v)
  return typeof origin.Fleet === 'string'
    ? `Fleet:${origin.Fleet}`
    : `Stationed:${origin.Stationed}`
}
const identity = (p: Observation) =>
  `${p.side}:${p.owner}:${originKey(p.origin)}`
const unitKey = (unit: Observation) =>
  `${record(unit.item).kind}:${record(unit.item).id}`
const findCounts = (value: unknown, participant: Observation) =>
  records(value).find((row) => identity(row) === identity(participant))
const countOf = (counts: Observation | undefined, key: string) => {
  if (!counts || !Array.isArray(counts.units)) return null
  const unit = records(counts.units).find((unit) => unitKey(unit) === key)
  return unit ? combatInteger(unit.count) : 0n
}

export function combatOutcome(outcome: unknown, side?: string) {
  if (outcome === 'Draw')
    return {
      title: 'Draw',
      symbol: '＝',
      tone: 'neutral',
      explanation: 'Both sides still had units when combat ended.',
    }
  if (outcome === 'MutualDestruction')
    return {
      title: 'Defeat',
      symbol: '✕',
      tone: 'loss',
      explanation: 'Neither side had units left at the end of combat.',
    }
  const winner =
    outcome === 'AttackerVictory'
      ? 'Attacker'
      : outcome === 'DefenderVictory'
        ? 'Defender'
        : null
  if (!winner)
    return {
      title: 'Outcome unavailable',
      symbol: '',
      tone: 'neutral',
      explanation: 'This report does not contain a confirmed result.',
    }
  const won = side === winner
  return {
    title: side ? (won ? 'Victory' : 'Defeat') : `${winner} victory`,
    symbol: side ? (won ? '✓' : '✕') : '',
    tone: side ? (won ? 'win' : 'loss') : 'neutral',
    explanation:
      winner === 'Attacker'
        ? 'The defending force was destroyed.'
        : 'The attacking fleet was destroyed.',
  }
}

/** Only a victorious attacking viewer receives loot; zero balances add no useful summary. */
export function hasCombatLoot(
  outcome: unknown,
  side: string | undefined,
  loot: unknown,
) {
  return (
    outcome === 'AttackerVictory' &&
    side === 'Attacker' &&
    Object.values(record(loot)).some(
      (value) => (combatInteger(value) ?? 0n) > 0n,
    )
  )
}

function force(participant: Observation, end: unknown, recovery?: unknown) {
  const survived = findCounts(end, participant)
  const recovered = findCounts(recovery, participant)
  const rows = records(participant.units).map((unit) => {
    const key = unitKey(unit)
    const start = combatInteger(unit.count)
    const finish = countOf(survived, key)
    // Recovery lists can omit unaffected origins. An absent whole observation is unknown.
    const restored = Array.isArray(recovery)
      ? recovered
        ? countOf(recovered, key)
        : 0n
      : null
    const lost = difference(start, finish)
    return {
      key,
      name: label(String(record(unit.item).id ?? 'Unknown unit')),
      start,
      finish,
      lost,
      recovered: restored,
      permanent: difference(lost, restored),
    }
  })
  return {
    rows,
    start: total(rows.map((r) => r.start)),
    finish: total(rows.map((r) => r.finish)),
    lost: total(rows.map((r) => r.lost)),
    recovered: total(rows.map((r) => r.recovered)),
    permanent: total(rows.map((r) => r.permanent)),
  }
}

export function combatReportModel(
  payload: Observation,
  viewer?: string,
  playerNames?: PlayerNames,
  shared = false,
) {
  const participants = records(payload.participants)
  const own = participants.find((p) => p.owner === viewer)
  const side =
    own?.side === 'Attacker' || own?.side === 'Defender' ? own.side : undefined
  const name = (p: Observation) =>
    p.owner === viewer ? 'You' : playerLabel(p.owner, playerNames)
  const forces = participants.map((p) => ({
    key: identity(p),
    owner: String(p.owner ?? ''),
    name: name(p),
    side: String(p.side),
    technology: Array.isArray(p.technology) ? (p.technology as number[]) : null,
    ...force(p, payload.survivors, payload.recovered),
  }))
  const rounds = records(payload.rounds).map((round) => ({
    number: round.number,
    legacy: !Array.isArray(round.fire),
    combined: round,
    forces: records(round.start).map((p) => ({
      key: identity(p),
      owner: String(p.owner ?? ''),
      name: name(p),
      side: String(p.side),
      ...force(p, round.end),
      fire: records(round.fire).find((f) => identity(f) === identity(p)),
    })),
  }))
  const resources = [
    {
      key: 'loot',
      title: 'Loot',
    },
    { key: 'debris', title: 'Debris created' },
    { key: 'own_cargo_loss', title: 'Your cargo lost' },
  ]
    .filter(
      ({ key }) =>
        key in payload &&
        (key !== 'loot' ||
          hasCombatLoot(
            payload.outcome,
            shared ? 'Attacker' : side,
            payload.loot,
          )) &&
        (key !== 'own_cargo_loss' ||
          Object.values(record(payload[key])).some(
            (v) => combatInteger(v) !== 0n,
          )),
    )
    .map(({ key, title }) => ({
      key,
      title,
      values: (['metal', 'crystal', 'deuterium'] as const).map((resource) => ({
        resource,
        value: combatInteger(record(payload[key])[resource]),
      })),
    }))
  return {
    ...combatOutcome(payload.outcome, side),
    side,
    forces,
    rounds,
    resources,
    returnAt: typeof payload.return_at === 'number' ? payload.return_at : null,
    noReturn: payload.return_at === null,
    espionage: payload.mission === 'Espionage',
  }
}
export type CombatReportModel = ReturnType<typeof combatReportModel>
export type CombatForce = CombatReportModel['forces'][number]
