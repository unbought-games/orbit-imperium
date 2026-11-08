import type { TitleChoice } from '../../client-model/empire-identity'
import { planetNameError, trimmedPlanetName } from '../planet-name'

export const arrivalSteps = ['title', 'planet', 'name', 'farewell'] as const
export type ArrivalStep = (typeof arrivalSteps)[number]

export type ArrivalChoices = { title: string; slot: number; name: string }
export type ArrivalSaved = {
  title: string
  /** The saved look, absent when the orbit default is shown. */
  appearance: number | undefined
  defaultSlot: number
  name: string | undefined
}
export type ArrivalSave =
  | { type: 'title'; title: string }
  | { type: 'appearance'; slot: number }
  | { type: 'rename'; name: string }
  | { type: 'complete' }

export function nextArrivalStep(step: ArrivalStep): ArrivalStep {
  return arrivalSteps[
    Math.min(arrivalSteps.indexOf(step) + 1, arrivalSteps.length - 1)
  ]
}

/** Titles this empire may use now; locked titles are never offered here. */
export function arrivalTitles(choices: readonly TitleChoice[] | undefined) {
  const available = (choices ?? [])
    .filter((choice) => choice.availability === 'available')
    .map((choice) => choice.title)
  return available.length
    ? available
    : [
        {
          id: 'commander',
          label: 'Commander',
          address: 'Commander',
          access: 'free' as const,
        },
      ]
}

/** Remaining saves, in order. Already-applied choices are skipped, so a retry resumes. */
export function arrivalSaves(
  choices: ArrivalChoices,
  saved: ArrivalSaved,
): ArrivalSave[] {
  const name = trimmedPlanetName(choices.name)
  return [
    ...(choices.title !== saved.title
      ? [{ type: 'title' as const, title: choices.title }]
      : []),
    ...(choices.slot !== (saved.appearance ?? saved.defaultSlot)
      ? [{ type: 'appearance' as const, slot: choices.slot }]
      : []),
    ...(name !== saved.name ? [{ type: 'rename' as const, name }] : []),
    { type: 'complete' as const },
  ]
}

/** Choices for Skip: keep valid choices, defaults for the rest. */
export function skippedChoices(
  draft: ArrivalChoices,
  randomName: () => string,
): ArrivalChoices {
  return planetNameError(draft.name) ? { ...draft, name: randomName() } : draft
}
