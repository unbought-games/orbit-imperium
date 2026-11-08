import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { Coordinator } from '../../client-model/coordinator'
import { useArchive } from '../../client-model/use-empire-history'
import type { EmpireProfile } from '../../adapters/empire-history'
import { sendArrival } from '../../adapters/arrival'
import { useGameSession } from '../../shell/session-context'
import { useAuthSession } from '../../shell/auth-context'
import { useRefreshPlayerProfiles } from '../../shell/player-profiles-context'
import { routeTarget } from '../../shell/route-target'
import { appearanceOptions } from '../../ui/artwork'
import {
  arrivalSaves,
  arrivalTitles,
  skippedChoices,
  type ArrivalChoices,
  type ArrivalSave,
} from './model'
import { randomPlanetName } from './names'

const renameTimeoutMs = 30_000

/** Resolves once the view shows the new name; rejects if the command is rejected. */
function renamed(model: Coordinator, body: string, name: string, id: string) {
  return new Promise<void>((resolve, reject) => {
    const check = () => {
      const state = model.store.getState()
      const shown = state.view?.bodies.find((b) => b.id === body)?.name
      const attempt = [...state.attempts.values()].find(
        (a) => a.envelope.command_id === id,
      )
      if (shown === name) finish(resolve)
      else if (attempt?.status === 'rejected')
        finish(() => reject(new Error('rename rejected')))
    }
    const timer = setTimeout(
      () => finish(() => reject(new Error('rename timed out'))),
      renameTimeoutMs,
    )
    const unsubscribe = model.store.subscribe(check)
    function finish(done: () => void) {
      clearTimeout(timer)
      unsubscribe()
      done()
    }
    check()
  })
}

export function useArrival() {
  const { view, model, universeName } = useGameSession()
  const navigate = useNavigate()
  const { runtime } = useAuthSession()
  const refreshProfiles = useRefreshPlayerProfiles()
  const csrf =
    runtime.status === 'authenticated' ? runtime.session.csrf : undefined
  const homeId = view.protocol === 4 ? view.homeworld_id : undefined
  const home = view.bodies.find((b) => b.id === homeId) ?? view.bodies[0]
  const position = home?.coordinates.position ?? 4
  const options = appearanceOptions(position)
  const profile = useArchive<EmpireProfile>(
    'EmpireProfile',
    `/api/v4/empire-profiles/${view.binding.player}`,
  )
  const savedTitle = profile.data?.identity?.title_id ?? 'commander'
  const titles = arrivalTitles(profile.data?.title_choices)
  const [draft, setDraft] = useState<ArrivalChoices>(() => ({
    title: 'commander',
    slot: options[0],
    name: '',
  }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const title =
    titles.find((t) => t.id === draft.title) ??
    titles.find((t) => t.id === savedTitle) ??
    titles[0]

  async function apply(save: ArrivalSave) {
    if (!home) throw new Error('no homeworld')
    if (save.type === 'title') {
      const data = profile.data
      if (!data) throw new Error('profile unavailable')
      const saved = await profile.save(data, {
        type: 'Identity',
        identity: {
          name: data.identity?.name ?? '',
          tagline: data.identity?.tagline ?? '',
          title_id: save.title,
        },
      })
      if (!saved) throw new Error('title not saved')
    } else if (save.type === 'appearance' || save.type === 'complete') {
      if (!csrf) throw new Error('session unavailable')
      await sendArrival(
        view.binding,
        csrf,
        save.type === 'complete'
          ? { type: 'Complete' }
          : { type: 'SetAppearance', body: home.id, slot: save.slot },
      )
    } else {
      const id = await model.send({
        type: 'World',
        action: { type: 'RenamePlanet', body: home.id, name: save.name },
      })
      if (!id) throw new Error('rename not sent')
      await renamed(model, home.id, save.name, id)
    }
  }

  async function finish(choices: ArrivalChoices) {
    if (busy || !home) return
    setBusy(true)
    setError('')
    try {
      const current = model.store.getState().view
      const saves = arrivalSaves(choices, {
        title: savedTitle,
        appearance:
          current?.protocol === 4
            ? current.body_appearances?.[home.id]
            : undefined,
        defaultSlot: position,
        name: current?.bodies.find((b) => b.id === home.id)?.name ?? undefined,
      })
      // Titles need the profile; without it, keep the saved title rather than block arrival.
      for (const save of saves)
        if (save.type !== 'title' || profile.data) await apply(save)
      refreshProfiles()
      await navigate({
        ...routeTarget(universeName, 'briefing', home.id),
        replace: true,
      })
      await model.refresh()
    } catch {
      setError(
        'Your choices could not be saved. Check your connection and try again.',
      )
      setBusy(false)
    }
  }

  return {
    home,
    options,
    titles,
    title,
    draft,
    setDraft,
    busy,
    error,
    finish: () => finish(draft),
    skip: () => finish(skippedChoices(draft, () => randomPlanetName())),
  }
}
