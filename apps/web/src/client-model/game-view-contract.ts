import type { components } from '../contracts'
type S = components['schemas']

/** Every visible body and its production settings are emitted in the same snapshot. */
export function completeProduction(view: S['GameView']): boolean {
  if (view.protocol === 2) return true
  const production = view.progression.production
  const bodies = new Set(production.map((entry) => entry.body))
  return (
    production.length === view.bodies.length &&
    bodies.size === production.length &&
    view.bodies.every((body) => bodies.has(body.id))
  )
}

/** Called only after the structural schema has validated the payload. */
export function gameViewFromContract(
  name: string,
  value: unknown,
): S['GameView'] | undefined {
  if (['GameView', 'BoundView3', 'BoundView4'].includes(name))
    return value as S['GameView']
  if (name === 'InitialGameSnapshot')
    return (value as S['InitialGameSnapshot']).view
  if (name === 'Bootstrap') {
    const { result } = value as S['Bootstrap']
    if (result.status === 'authenticated' && result.game.status === 'ready')
      return result.game.snapshot.view
  }
}
