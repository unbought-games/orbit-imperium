import { useEffect, useState, useContext } from 'react'
import { useStore } from 'zustand'
import { InsigniaContext } from '../shell/insignia-context'
import {
  defaultInsignia,
  selectedInsigniaDesign,
  symbolAccess,
} from '../client-model/insignias'
import type { InsigniaDesign } from '../adapters/insignias'

export function useInsigniaEditor() {
  const controller = useContext(InsigniaContext)
  if (!controller) throw Error('Insignia editor requires a game session')
  const state = useStore(controller.store)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<InsigniaDesign | null>(null)
  useEffect(() => controller.start(), [controller])
  const snapshot = state.snapshot
  const design = draft ?? selectedInsigniaDesign(snapshot, selectedId)
  const access = (symbol: string) =>
    snapshot ? symbolAccess(snapshot, symbol, state.now) : 'unavailable'
  const valid =
    !!design &&
    !!design.name.trim() &&
    [...design.name].length <= 40 &&
    ![...design.name].some(
      (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
    ) &&
    access(design.recipe.symbol) === 'available'
  return {
    ...state,
    snapshot,
    currentAppearance:
      snapshot?.library.equipped &&
      snapshot.appearance &&
      (access(snapshot.appearance.recipe.symbol) === 'available'
        ? snapshot.appearance
        : {
            recipe: defaultInsignia,
            asset_url: snapshot.catalog.find(
              (item) => item.id === defaultInsignia.symbol,
            )!.asset_url,
          }),
    design,
    draft,
    access,
    canSave: !!draft && valid && !state.busy,
    select: (id: string) => {
      setSelectedId(id)
      setDraft(null)
    },
    create: () => {
      setSelectedId(null)
      setDraft({
        id: crypto.randomUUID(),
        name: 'My insignia',
        recipe: { ...defaultInsignia },
        revision: 0,
      })
    },
    edit: (change: Partial<InsigniaDesign>) => {
      if (design) setDraft({ ...design, ...change })
    },
    cancel: () => setDraft(null),
    reload: controller.load,
    save: async () => {
      if (!draft || !valid) return
      if (
        await controller.perform({ type: 'Save', design: draft, equip: true })
      ) {
        setSelectedId(draft.id)
        setDraft(null)
      }
    },
    equip: async () => {
      if (design)
        await controller.perform({ type: 'Equip', design_id: design.id })
    },
    reset: () => controller.perform({ type: 'Equip', design_id: null }),
    remove: async () => {
      if (
        design &&
        (await controller.perform({ type: 'Delete', design_id: design.id }))
      ) {
        setSelectedId(null)
        setDraft(null)
      }
    },
  }
}
