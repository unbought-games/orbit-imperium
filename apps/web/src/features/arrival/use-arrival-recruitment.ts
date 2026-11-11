import { useEffect, useState } from 'react'
import { useLocation, useRouter } from '@tanstack/react-router'
import { allianceSearch } from '../../client-model/recruitment'
import { useGameSession } from '../../shell/session-context'
import { useAuthSession } from '../../shell/auth-context'
import { sendArrival, type ArrivalState } from '../../adapters/arrival'

export function useArrivalRecruitment() {
  const { view } = useGameSession(),
    { runtime } = useAuthSession(),
    router = useRouter()
  const search = useLocation({
    select: (location) => allianceSearch(location.search),
  })
  const csrf = runtime.status === 'authenticated' ? runtime.session.csrf : ''
  const { account, player, universe, epoch } = view.binding
  const [state, setState] = useState<ArrivalState | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    const binding = { account, player, universe, epoch }
    void (async () => {
      let result = await sendArrival(binding, csrf, { type: 'Load' })
      if (
        search.alliance &&
        (result.recruitment?.alliance !== search.alliance ||
          result.recruitment.invitation !== (search.invitation ?? null))
      )
        result = await sendArrival(binding, csrf, {
          type: 'SetRecruitment',
          intent: {
            alliance: search.alliance,
            invitation: search.invitation ?? null,
          },
        })
      if (active) {
        setState(result)
        setLoading(false)
      }
    })().catch(() => {
      if (active) {
        setError(
          'Your alliance invitation could not be loaded. You can retry or continue into the game.',
        )
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [
    account,
    player,
    universe,
    epoch,
    csrf,
    search.alliance,
    search.invitation,
    reload,
  ])
  const intent = search.alliance
    ? { alliance: search.alliance, invitation: search.invitation ?? null }
    : state?.recruitment
  async function dismiss() {
    await sendArrival({ account, player, universe, epoch }, csrf, {
      type: 'SetRecruitment',
      intent: null,
    })
    setState((current) => (current ? { pending: current.pending } : null))
    const url = new URL(window.location.href)
    for (const key of ['alliance', 'invitation', 'welcome'])
      url.searchParams.delete(key)
    router.history.replace(url.pathname + url.search + url.hash)
  }
  return {
    intent,
    loading,
    error,
    dismiss,
    retry: () => setReload((n) => n + 1),
  }
}
