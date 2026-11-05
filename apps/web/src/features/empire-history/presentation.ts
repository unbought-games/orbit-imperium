import type { HistoryEntry } from '../../adapters/empire-history'
const labels: Record<HistoryEntry['kind'], string> = {
  Joined: 'Joined the universe',
  Colonized: 'A new world',
  Abandoned: 'Left a world behind',
  AllianceJoined: 'Joined an alliance',
  AllianceLeft: 'Left an alliance',
  AllianceKicked: 'Removed from an alliance',
  AllianceDisbanded: 'Alliance disbanded',
  Battle: 'A battle to remember',
  CampaignResult: 'Campaign concluded',
}
export function eventTitle(entry: HistoryEntry) {
  if (entry.kind === 'CampaignResult' && entry.facts.beneficiary === true)
    return 'Shared in the victory'
  return labels[entry.kind]
}
export function eventSummary(entry: HistoryEntry): string {
  const f = entry.facts
  if (entry.kind.startsWith('Alliance'))
    return [f.tag ? `[${String(f.tag)}]` : '', f.name].filter(Boolean).join(' ')
  if (entry.kind === 'Colonized' || entry.kind === 'Abandoned') {
    const raw = f.destination_coordinates ?? f.coordinates
    const coords =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : null
    const location =
      coords &&
      ['galaxy', 'system', 'position'].every(
        (key) => typeof coords[key] === 'number',
      )
        ? `[${coords.galaxy}:${coords.system}:${coords.position}]`
        : ''
    return [
      typeof f.name === 'string' ? f.name : location,
      entry.kind === 'Colonized'
        ? typeof f.fields === 'number'
          ? `${f.fields} fields. A new beginning.`
          : 'A colony joined the empire.'
        : 'The empire moved on.',
    ]
      .filter(Boolean)
      .join(' · ')
  }
  if (entry.kind === 'Battle')
    return f.outcome === 'AttackerVictory'
      ? 'Attacker victory'
      : f.outcome === 'DefenderVictory'
        ? 'Defender victory'
        : f.outcome === 'Draw'
          ? 'Draw'
          : 'The battle as this commander observed it.'
  if (entry.kind === 'CampaignResult')
    return f.outcome === 'Victory'
      ? 'The campaign ended in victory. Participation recorded.'
      : 'The campaign ended in defeat. Participation recorded.'
  return 'Every empire starts somewhere.'
}
export function eventDate(at: number | null) {
  return at === null
    ? 'Date not recorded'
    : new Date(at).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
}

export function eventCommander(
  entry: HistoryEntry,
  player: string,
): string | null {
  if (typeof entry.facts.commander_name === 'string')
    return entry.facts.commander_name
  const names = entry.facts.names
  if (
    names &&
    typeof names === 'object' &&
    !Array.isArray(names) &&
    typeof (names as Record<string, unknown>)[player] === 'string'
  )
    return (names as Record<string, string>)[player]
  return entry.kind === 'Joined' && typeof entry.facts.name === 'string'
    ? entry.facts.name
    : null
}
