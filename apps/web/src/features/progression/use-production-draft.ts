import { useEffect, useState } from 'react'
import type { components } from '../../contracts'
import { canonical } from '../../client-model/commands'
type Production = components['schemas']['ProductionDto']
type Draft = { settings: Production['settings']; revision: string }

export function useProductionDraft(production: Production) {
  // Only a user's edit creates a draft. Untouched controls read current server settings.
  const [edit, setEdit] = useState<Draft | null>(null)
  const matches =
    !!edit && canonical(edit.settings) === canonical(production.settings)
  useEffect(() => {
    if (matches) setEdit(null)
  }, [matches])
  const draft = matches ? null : edit
  return {
    settings: draft?.settings ?? production.settings,
    revision: draft?.revision ?? production.settings_revision,
    conflict: !!draft && draft.revision !== production.settings_revision,
    change: (
      key: keyof Production['settings'],
      value: Production['settings'][typeof key],
    ) => {
      setEdit({
        settings: { ...(draft?.settings ?? production.settings), [key]: value },
        revision: draft?.revision ?? production.settings_revision,
      })
    },
    acceptRevision: () => {
      if (draft) setEdit({ ...draft, revision: production.settings_revision })
    },
  }
}
