import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { bindingKey } from '../../client-model/commands'
import type { SocialController, SocialView } from '../../client-model/social'
import { routeTarget } from '../../shell/route-target'
import { useGameScreen } from '../../shell/screen-context'
import { useGameSession } from '../../shell/session-context'
import { useProfilePlayers } from '../../shell/player-profiles-context'
import type { MessageCategory as Tab } from './category-navigation'
import { useSocial } from './use-social'
import { MessagesView, tabQuery } from './messages-view'
export function MessagesScreen() {
  const { view } = useGameSession()
  return <Workspace key={bindingKey(view.binding)} />
}
function useReadPosition(
  controller: SocialController,
  player: string | undefined,
  history: SocialView | null,
  busy: boolean,
) {
  const marked = useRef('')
  const latest = history?.messages.at(-1)?.id
  useEffect(() => {
    if (
      busy ||
      !player ||
      !latest ||
      document.hidden ||
      marked.current === latest
    )
      return
    const state = controller.store.getState()
    if (state.pending || state.busy) return
    marked.current = latest
    void controller.markRead(player, latest).then((ok) => {
      if (!ok) marked.current = ''
    })
  }, [controller, player, latest, history, busy])
}
function Workspace() {
  const { view, universeName, body } = useGameScreen()
  const search = useSearch({ strict: false }) as {
    player?: string
  }
  const navigate = useNavigate()
  const [selectedTab, setTab] = useState<Tab>('Conversations')
  const tab: Tab = search.player ? 'Conversations' : selectedTab
  const { controller, state } = useSocial(search.player)
  useEffect(() => {
    void controller.list(tabQuery(tab))
  }, [controller, tab])
  const busy = state.busy || !!state.pending
  const history = state.history
  const self = view.binding.player
  const select = (player?: string) => {
    setTab('Conversations')
    void navigate({
      ...routeTarget(universeName, 'messages', body?.id),
      search: { player },
      hash: true,
    })
  }
  useReadPosition(controller, search.player, history, busy)
  useProfilePlayers([
    ...(state.list?.conversations.map((c) => c.contact.player) ?? []),
    ...(state.list?.contacts.map((c) => c.player) ?? []),
    ...(state.list?.circulars.map((c) => c.sender) ?? []),
    ...(history?.contact ? [history.contact.player] : []),
  ])
  const changeTab = (next: Tab) => {
    select()
    setTab(next)
    if (next === 'Circulars') void controller.loadAlliance()
  }
  return (
    <MessagesView
      controller={controller}
      state={state}
      self={self}
      player={search.player}
      tab={tab}
      select={select}
      changeTab={changeTab}
    />
  )
}
