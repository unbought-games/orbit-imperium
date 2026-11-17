import { describe, expect, it } from 'vitest'
import type {
  ShipAppearanceState,
  ShipDesign,
} from '../../client-model/ship-appearance-types'
import {
  acknowledgeSave,
  hasUnsavedDraft,
  draftProblem,
  initialDraft,
  sameDesign,
} from './model'

const design: ShipDesign = {
  id: 'design-one',
  name: 'Concord',
  target: 'LightFighter',
  revision: 2,
  recipe: {
    version: 1,
    skin_id: 'fighter',
    package_revision: 'v1',
    primary: 'navy',
    accent: 'gold',
    emblem: { treatment: 'layers', placement: 'paired' },
  },
}
function state(): ShipAppearanceState {
  return {
    binding: {} as ShipAppearanceState['binding'],
    request_id: 'observation',
    catalog: [
      {
        id: 'fighter',
        name: 'Fighter',
        target: 'LightFighter',
        package_revision: 'v1',
        package_url: '/manifest.json',
        preview_url: '/ship.webp',
        available: true,
      },
    ],
    dyes: [
      { id: 'navy', name: 'Navy', color: '#001122', availability: 'available' },
      { id: 'gold', name: 'Gold', color: '#ccbbaa', availability: 'available' },
    ],
    library: [design],
    equipment: [
      {
        target: 'LightFighter',
        revision: 1,
        design_id: 'design-one',
        design_revision: 2,
        render: null,
        artwork: null,
      },
    ],
    emblem: null,
    emblem_revision: 0,
  }
}

describe('ship customization drafts', () => {
  it('starts from the equipped immutable revision, not a newer revision used elsewhere', () => {
    const snapshot = state()
    snapshot.library.unshift({ ...design, revision: 3, name: 'Another empire' })
    expect(initialDraft(snapshot, 'LightFighter')).toEqual(design)
  })

  it('uses only available dyes and target-compatible installed packages for a new design', () => {
    const snapshot = state()
    snapshot.equipment = []
    snapshot.dyes.unshift({
      id: 'locked',
      name: 'Locked',
      color: '#ffffff',
      availability: 'locked',
    })
    snapshot.catalog.unshift({
      ...snapshot.catalog[0],
      id: 'cargo',
      target: 'SmallCargo',
    })
    const draft = initialDraft(snapshot, 'LightFighter')!
    expect(draft.recipe).toEqual({
      version: 1,
      skin_id: 'fighter',
      package_revision: 'v1',
      primary: 'navy',
      accent: 'gold',
      emblem: { treatment: 'full', placement: 'paired' },
    })
    expect(draft.id).toBe('')
    expect(draft.revision).toBe(0)
  })

  it('does not invent a default for an unsupported target or a catalog without available dyes', () => {
    const snapshot = state()
    expect(initialDraft(snapshot, 'Destroyer')).toBeNull()
    snapshot.equipment = []
    snapshot.dyes = []
    expect(initialDraft(snapshot, 'LightFighter')).toBeNull()
  })

  it('retains an equipped unavailable recipe and explains why it cannot be saved', () => {
    const snapshot = state()
    snapshot.dyes = snapshot.dyes.filter((dye) => dye.id !== 'navy')
    expect(initialDraft(snapshot, 'LightFighter')).toEqual(design)
    expect(draftProblem(snapshot, design)).toContain(
      'selected dye is unavailable',
    )
    expect(design.recipe.primary).toBe('navy')
  })

  it('blocks stale package revisions even when the skin ID is still installed', () => {
    const snapshot = state()
    snapshot.catalog[0].package_revision = 'v2'
    expect(draftProblem(snapshot, design)).toContain(
      'ship finish is unavailable',
    )
  })

  it('validates names without rejecting a valid recipe when the current emblem is absent', () => {
    expect(draftProblem(state(), design)).toBe('')
    expect(draftProblem(state(), { ...design, name: '  ' })).toBe(
      'Give this design a name.',
    )
    expect(
      draftProblem(state(), { ...design, name: 'a'.repeat(41) }),
    ).toContain('40 characters')
  })

  it('matches saved content across revision advancement but detects every editable recipe choice', () => {
    expect(sameDesign(design, { ...design, revision: 3 })).toBe(true)
    expect(sameDesign(design, { ...design, name: 'Edited' })).toBe(false)
    expect(
      sameDesign(design, {
        ...design,
        recipe: { ...design.recipe, accent: 'navy' },
      }),
    ).toBe(false)
    expect(
      sameDesign(design, {
        ...design,
        recipe: {
          ...design.recipe,
          emblem: { treatment: 'none', placement: 'paired' },
        },
      }),
    ).toBe(false)
    expect(
      sameDesign(design, {
        ...design,
        recipe: {
          ...design.recipe,
          emblem: { treatment: 'layers', placement: 'near-wing' },
        },
      }),
    ).toBe(false)
  })
})

describe('save acknowledgment during live observations', () => {
  it('advances the saved revision token without erasing edits made after submitting', () => {
    const edited = {
      ...design,
      name: 'Next design',
      recipe: { ...design.recipe, primary: 'gold' },
    }
    expect(
      acknowledgeSave(edited, design, [{ ...design, revision: 3 }]),
    ).toEqual({ ...edited, revision: 3 })
  })
  it('does not adopt a conflicting revision from another editor or move another selected design', () => {
    expect(
      acknowledgeSave(design, design, [
        { ...design, revision: 3, name: 'Other tab' },
      ]),
    ).toBe(design)
    const other = { ...design, id: 'different' }
    expect(acknowledgeSave(other, design, [{ ...design, revision: 3 }])).toBe(
      other,
    )
  })
})

describe('unsaved-close protection', () => {
  it('requires review for unsaved edits but not for initial or saved selections', () => {
    expect(hasUnsavedDraft(state(), null)).toBe(false)
    expect(hasUnsavedDraft(state(), design)).toBe(false)
    expect(hasUnsavedDraft(state(), { ...design, name: 'Unsaved' })).toBe(true)
    expect(hasUnsavedDraft(null, design)).toBe(true)
  })
  it('stops prompting after the new immutable revision is observed', () => {
    const snapshot = state()
    snapshot.library = [{ ...design, revision: 3 }]
    expect(hasUnsavedDraft(snapshot, design)).toBe(false)
  })
})
