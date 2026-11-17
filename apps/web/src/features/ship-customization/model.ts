import type {
  ShipAppearanceAction,
  ShipAppearanceState,
  ShipDesign,
  ShipPaintRecipe,
  ShipRenderStage,
} from '../../client-model/ship-appearance-types'

export type ShipDraft = ShipDesign

export function initialDraft(
  state: ShipAppearanceState,
  target: string,
): ShipDraft | null {
  const equipment = state.equipment.find((item) => item.target === target)
  const equipped = state.library.find(
    (item) =>
      item.id === equipment?.design_id &&
      item.revision === equipment.design_revision,
  )
  if (equipped) return equipped
  const skin = state.catalog.find(
    (item) => item.target === target && item.available,
  )
  const dyes = state.dyes.filter((item) => item.availability === 'available')
  if (!skin || !dyes.length) return null
  return {
    id: '',
    name: `${targetLabel(target)} design`,
    target,
    revision: 0,
    recipe: {
      version: 1,
      skin_id: skin.id,
      package_revision: skin.package_revision,
      primary: dyes[0].id,
      accent: (dyes[1] ?? dyes[0]).id,
      emblem: { treatment: 'full', placement: 'paired' },
    },
  }
}

export function targetLabel(target: string) {
  return target.replace(/([a-z])([A-Z])/g, '$1 $2')
}

/** Unavailable choices stay in the draft, but cannot be newly saved/equipped. */
export function draftProblem(
  state: ShipAppearanceState,
  draft: ShipDraft,
): string {
  if (!draft.name.trim()) return 'Give this design a name.'
  if ([...draft.name.trim()].length > 40)
    return 'Use 40 characters or fewer for the design name.'
  if (
    !state.catalog.some(
      (skin) =>
        skin.id === draft.recipe.skin_id &&
        skin.target === draft.target &&
        skin.package_revision === draft.recipe.package_revision &&
        skin.available,
    )
  ) {
    return 'This ship finish is unavailable. Choose an available finish to save a new revision.'
  }
  if (
    ![draft.recipe.primary, draft.recipe.accent].every((id) =>
      state.dyes.some(
        (dye) => dye.id === id && dye.availability === 'available',
      ),
    )
  ) {
    return 'A selected dye is unavailable. Choose available dyes to save a new revision.'
  }
  return ''
}

export function sameDesign(a: ShipDesign, b: ShipDesign): boolean {
  return a.id === b.id && a.name === b.name && sameRecipe(a.recipe, b.recipe)
}

export function sameRecipe(a: ShipPaintRecipe, b: ShipPaintRecipe): boolean {
  return (
    a.version === b.version &&
    a.skin_id === b.skin_id &&
    a.package_revision === b.package_revision &&
    a.primary === b.primary &&
    a.accent === b.accent &&
    a.emblem.treatment === b.emblem.treatment &&
    a.emblem.placement === b.emblem.placement
  )
}

export const renderStatus: Record<
  ShipRenderStage,
  { title: string; detail: string }
> = {
  queued: {
    title: 'Queued',
    detail: 'Your design is saved and waiting for the hangar.',
  },
  rendering: {
    title: 'Rendering',
    detail: 'Your ship artwork is being rendered. You can keep designing.',
  },
  preparing: {
    title: 'Preparing',
    detail: 'Preparing your ship artwork for the fleet.',
  },
  ready: {
    title: 'Ready',
    detail: 'Your ship appearance is equipped in this empire.',
  },
  failed: {
    title: 'Render failed',
    detail: 'Your design is saved. Retry to finish preparing its artwork.',
  },
  superseded: {
    title: 'Replaced',
    detail: 'A newer appearance request has replaced this one.',
  },
  canceled: {
    title: 'Canceled',
    detail:
      'This render was canceled. Your saved design remains in your library.',
  },
}

/** Save the selected recipe against the latest observed account design head. */
export function savePayload(
  draft: ShipDraft,
  state: ShipAppearanceState,
  newDesignId: string,
): Extract<ShipAppearanceAction, { type: 'Save' }> {
  const revision = draft.id
    ? state.library.reduce(
        (head, item) =>
          item.id === draft.id ? Math.max(head, item.revision) : head,
        draft.revision,
      )
    : 0
  return {
    type: 'Save',
    design: {
      ...draft,
      id: draft.id || newDesignId,
      name: draft.name.trim(),
      revision,
    },
    equip: true,
    expected_equipment_revision:
      state.equipment.find((item) => item.target === draft.target)?.revision ??
      0,
  }
}

/** Accept our submitted revision without importing recipe edits from later polls. */
export function acknowledgeSave(
  current: ShipDraft | null,
  submitted: ShipDesign,
  library: ShipDesign[],
  selectedRevision = submitted.revision,
): ShipDraft | null {
  const observed = library.find(
    (item) =>
      item.id === submitted.id &&
      item.revision > submitted.revision &&
      sameDesign(item, submitted),
  )
  return observed &&
    current?.id === observed.id &&
    current.revision === selectedRevision
    ? { ...current, revision: observed.revision }
    : current
}

export function hasUnsavedDraft(
  state: ShipAppearanceState | null,
  edits: ShipDraft | null,
): boolean {
  return (
    edits !== null && !state?.library.some((saved) => sameDesign(saved, edits))
  )
}
