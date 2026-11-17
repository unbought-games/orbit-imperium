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
  savePayload,
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
    expect(draftProblem(snapshot, design)).toContain('ship skin is unavailable')
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

describe('saving an empire-pinned recipe against the account design head', () => {
  it('expects head 2 while preserving the edited revision-1 recipe, then acknowledges revision 3', () => {
    const snapshot = state()
    const pinned = { ...design, revision: 1 }
    const otherEmpireHead = {
      ...design,
      revision: 2,
      recipe: { ...design.recipe, primary: 'gold', accent: 'navy' },
    }
    snapshot.library = [otherEmpireHead, pinned]
    snapshot.equipment[0].design_revision = 1
    const selected = initialDraft(snapshot, 'LightFighter')!
    expect(selected).toEqual(pinned)
    const edited = {
      ...selected,
      name: 'This empire',
      recipe: {
        ...selected.recipe,
        emblem: { ...selected.recipe.emblem, placement: 'near-wing' as const },
      },
    }
    const payload = savePayload(edited, snapshot, 'unused-new-id')
    expect(payload).toEqual({
      type: 'Save',
      equip: true,
      expected_equipment_revision: 1,
      design: { ...edited, revision: 2 },
    })
    expect(payload.design.recipe.primary).toBe('navy')
    expect(payload.design.recipe.accent).toBe('gold')
    expect(edited.revision).toBe(1)
    const furtherEdits = { ...edited, name: 'Still editing' }
    const observed = { ...payload.design, revision: 3 }
    expect(
      acknowledgeSave(
        furtherEdits,
        payload.design,
        [observed, otherEmpireHead, pinned],
        edited.revision,
      ),
    ).toEqual({ ...furtherEdits, revision: 3 })
    // Acknowledgement does not move a subsequently selected version of that design.
    expect(
      acknowledgeSave(
        otherEmpireHead,
        payload.design,
        [observed],
        edited.revision,
      ),
    ).toBe(otherEmpireHead)
  })

  it('uses the maximum known matching head independently of library order', () => {
    const snapshot = state()
    snapshot.library = [
      { ...design, revision: 1 },
      { ...design, id: 'another-design', revision: 99 },
      { ...design, revision: 4 },
      { ...design, revision: 2 },
    ]
    expect(
      savePayload({ ...design, revision: 1 }, snapshot, 'unused').design
        .revision,
    ).toBe(4)
    expect(snapshot.library[0].revision).toBe(1)
  })

  it('keeps a new design at revision zero and retains the selected recipe', () => {
    const draft = { ...design, id: '', revision: 0, name: ' New design ' }
    expect(savePayload(draft, state(), 'new-design-id')).toEqual({
      type: 'Save',
      equip: true,
      expected_equipment_revision: 1,
      design: { ...draft, id: 'new-design-id', name: 'New design' },
    })
  })
})
