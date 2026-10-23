import type { Attempt } from '../client-model/commands'

// Match Rust str::trim (Unicode White_Space), including U+0085 but not U+FEFF.
export const trimmedPlanetName = (name: string) =>
  name.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, '')

export function planetNameError(name: string): string {
  if (/\p{Cc}/u.test(name)) return 'Names cannot contain control characters.'
  const length = [...trimmedPlanetName(name)].length
  return length < 1 || length > 40
    ? 'Use 1–40 characters for the planet name.'
    : ''
}

export function pendingPlanetRename(attempts: Iterable<Attempt>, body: string) {
  return [...attempts].find((attempt) => {
    const command = attempt.envelope.command
    return (
      command.type === 'World' &&
      command.action.type === 'RenamePlanet' &&
      command.action.body === body &&
      attempt.status !== 'rejected' &&
      !(attempt.status === 'committed' && attempt.reconciled)
    )
  })
}
