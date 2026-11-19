import type {
  ShipAppearanceAction,
  ShipAppearanceState,
  ShipDesign,
  ShipDye,
  ShipPaintRecipe,
} from '../../client-model/ship-appearance-types'

export type ShipDraft = ShipDesign

export function groupDyesByPalette(dyes: ShipDye[]) {
  const groups = new Map<string | undefined, ShipDye[]>()
  for (const dye of dyes) {
    const group = groups.get(dye.palette_id)
    if (group) group.push(dye)
    else groups.set(dye.palette_id, [dye])
  }
  return Array.from(groups, ([id, dyes]) => ({
    id,
    title: id
      ? id
          .split(/[-_]+/)
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ')
      : 'Standard dyes',
    dyes,
  }))
}

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
  const orbitBase =
    skin.id === 'orbit-base-light-fighter' && skin.package_revision === 'v1'
  const primary =
    (orbitBase && dyes.find((dye) => dye.id === 'free-steel')) || dyes[0]
  const accent =
    (orbitBase && dyes.find((dye) => dye.id === 'free-gold')) ||
    dyes[1] ||
    dyes[0]
  return {
    id: '',
    name: `${targetLabel(target)} design`,
    target,
    revision: 0,
    recipe: {
      version: 1,
      skin_id: skin.id,
      package_revision: skin.package_revision,
      primary: primary.id,
      accent: accent.id,
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
    return 'This ship skin is unavailable. Choose an available skin to save a new revision.'
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
