import { describe, expect, it } from 'vitest'
import {
  arrivalSaves,
  arrivalTitles,
  nextArrivalStep,
  skippedChoices,
  type ArrivalSaved,
} from './model'

const saved: ArrivalSaved = {
  title: 'commander',
  appearance: undefined,
  defaultSlot: 6,
  name: 'Planet',
}

describe('arrival scene', () => {
  it('walks the steps in order and stays on the farewell', () => {
    expect(nextArrivalStep('title')).toBe('planet')
    expect(nextArrivalStep('name')).toBe('farewell')
    expect(nextArrivalStep('farewell')).toBe('farewell')
  })

  it('offers only titles available to this empire, with Commander as a fallback', () => {
    const title = (id: string) => ({
      id,
      label: id,
      address: id,
      access: 'free' as const,
    })
    expect(
      arrivalTitles([
        { title: title('commander'), availability: 'available' },
        { title: title('regent'), availability: 'supporter_required' },
        { title: title('admiral'), availability: 'available' },
      ]).map((t) => t.id),
    ).toEqual(['commander', 'admiral'])
    expect(arrivalTitles(undefined).map((t) => t.id)).toEqual(['commander'])
  })

  it('saves title, look and name before completing', () => {
    expect(
      arrivalSaves(
        { title: 'admiral', slot: 7, name: ' Vesper Reach ' },
        saved,
      ),
    ).toEqual([
      { type: 'title', title: 'admiral' },
      { type: 'appearance', slot: 7 },
      { type: 'rename', name: 'Vesper Reach' },
      { type: 'complete' },
    ])
  })

  it('skips choices that are already saved, so a retry resumes', () => {
    expect(
      arrivalSaves(
        { title: 'admiral', slot: 7, name: 'Vesper Reach' },
        { ...saved, title: 'admiral', appearance: 7, name: 'Vesper Reach' },
      ),
    ).toEqual([{ type: 'complete' }])
  })

  it('never stores the orbit default look', () => {
    expect(
      arrivalSaves({ title: 'commander', slot: 6, name: 'Planet' }, saved),
    ).toEqual([{ type: 'complete' }])
    expect(
      arrivalSaves(
        { title: 'commander', slot: 6, name: 'Planet' },
        { ...saved, appearance: 8 },
      ),
    ).toEqual([{ type: 'appearance', slot: 6 }, { type: 'complete' }])
  })

  it('skips with confirmed choices and a random name when none was given', () => {
    const draft = { title: 'admiral', slot: 7, name: '  ' }
    expect(skippedChoices(draft, () => 'Lumen Deep')).toEqual({
      ...draft,
      name: 'Lumen Deep',
    })
    expect(
      skippedChoices({ ...draft, name: 'Calder' }, () => 'unused').name,
    ).toBe('Calder')
  })
})
