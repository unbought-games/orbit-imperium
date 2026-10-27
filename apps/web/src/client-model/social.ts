import { createStore } from 'zustand/vanilla'
import type { components } from '../contracts'
type S = components['schemas']
export type SocialRequest = Omit<S['SocialCommandRequest'], 'context'>
export type SocialAction = S['SocialAction']
export type SocialView = S['SocialView']
export type SocialContact = S['SocialContact']
export type SocialQuery = S['SocialQuery']
export const emptySocialView = (): Pick<
  SocialView,
  | 'conversations'
  | 'messages'
  | 'circulars'
  | 'contacts'
  | 'contact'
  | 'next_cursor'
> => ({
  conversations: [],
  messages: [],
  circulars: [],
  contacts: [],
  contact: null,
  next_cursor: null,
})
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : 'Request failed. Try again.'
const status = (e: unknown) =>
  typeof e === 'object' && e && 'status' in e ? Number(e.status) : 0
export function mergeMessages(
  old: S['SocialMessage'][],
  fresh: S['SocialMessage'][],
) {
  return [...new Map([...old, ...fresh].map((m) => [m.id, m])).values()].sort(
    (a, b) => (BigInt(a.sequence) < BigInt(b.sequence) ? -1 : 1),
  )
}
export class SocialController {
  readonly store = createStore<{
    alliance: S['AllianceDetail'] | null
    list: SocialView | null
    history: SocialView | null
    loading: boolean
    loadingHistory: boolean
    busy: boolean
    pending: SocialRequest | null
    error: string
    completed: SocialRequest | null
  }>(() => ({
    alliance: null,
    list: null,
    history: null,
    loading: false,
    loadingHistory: false,
    busy: false,
    pending: null,
    error: '',
    completed: null,
  }))
  private generation = 0
  private listGeneration = 0
  private historyGeneration = 0
  private player: string | null = null
  private expandedList = false
  private query: SocialQuery = {
    type: 'Conversations',
    cursor: null,
    limit: 30,
  }
  constructor(
    private ports: {
      read: (query: SocialQuery) => Promise<SocialView | null>
      command: (
        request: SocialRequest,
      ) => Promise<S['SocialCommandResult'] | null>
      readAlliance?: () => Promise<S['AllianceDetail'] | null>
      newId: () => string
    },
  ) {}
  clear() {
    this.generation++
    this.listGeneration++
    this.historyGeneration++
    this.player = null
    this.store.setState({
      alliance: null,
      list: null,
      history: null,
      loading: false,
      loadingHistory: false,
      busy: false,
      pending: null,
      error: '',
      completed: null,
    })
  }
  async list(query: SocialQuery = this.query, append = false, quiet = false) {
    const gen = ++this.listGeneration
    this.expandedList = append
    this.query = { ...query, ...('cursor' in query ? { cursor: null } : {}) }
    this.store.setState({
      loading: !quiet,
      ...(!quiet ? { error: '' } : {}),
      ...(!append && !quiet ? { list: null } : {}),
    })
    try {
      const view = await this.ports.read(query)
      if (gen !== this.listGeneration) return
      if (!view) throw new Error('Messages unavailable. Refresh your session.')
      const old = this.store.getState().list
      this.store.setState({
        loading: false,
        list:
          append && old
            ? {
                ...view,
                conversations: [...old.conversations, ...view.conversations],
                circulars: [...old.circulars, ...view.circulars],
                contacts: [...old.contacts, ...view.contacts],
              }
            : view,
      })
    } catch (e) {
      if (gen === this.listGeneration)
        this.store.setState({ loading: false, error: errorText(e) })
    }
  }
  pollList() {
    if (!this.expandedList && !this.store.getState().loading)
      return this.list(this.query, false, true)
  }
  async loadAlliance() {
    const gen = this.generation
    try {
      const alliance = await this.ports.readAlliance?.()
      if (gen === this.generation)
        this.store.setState({ alliance: alliance ?? null })
    } catch {
      if (gen === this.generation) this.store.setState({ alliance: null })
    }
  }
  moreList() {
    const cursor = this.store.getState().list?.next_cursor
    if (cursor && 'cursor' in this.query)
      return this.list({ ...this.query, cursor }, true)
  }
  async open(player: string | null) {
    this.player = player
    this.historyGeneration++
    this.store.setState({ history: null, loadingHistory: false, error: '' })
    if (player) await this.history()
  }
  async history(direction: 'latest' | 'older' | 'newer' = 'latest') {
    const player = this.player
    if (!player || this.store.getState().loadingHistory) return
    const old = this.store.getState().history
    const before = direction === 'older' ? (old?.next_cursor ?? null) : null
    const after =
      direction === 'newer' ? (old?.messages.at(-1)?.id ?? null) : null
    if (direction === 'older' && !before) return
    const gen = ++this.historyGeneration
    this.store.setState({ loadingHistory: true })
    try {
      const view = await this.ports.read({
        type: 'Messages',
        player,
        before,
        after,
        limit: 50,
      })
      if (gen !== this.historyGeneration) return
      if (!view)
        throw new Error('Conversation unavailable. Refresh your session.')
      const merged =
        direction === 'latest' || !old
          ? view
          : {
              ...view,
              messages: mergeMessages(old.messages, view.messages),
              next_cursor:
                direction === 'newer' ? old.next_cursor : view.next_cursor,
            }
      this.store.setState({ history: merged, loadingHistory: false })
      // Drain bounded forward pages in order. Never jump to the newest page and skip a gap.
      if (direction === 'newer' && after && view.next_cursor)
        await this.history('newer')
    } catch (e) {
      if (gen === this.historyGeneration)
        this.store.setState({
          loadingHistory: false,
          error: errorText(e),
          ...([401, 403, 404].includes(status(e)) ? { history: null } : {}),
        })
    }
  }
  // Read-position acknowledgements must not disable the composer or replace an
  // uncertain send. This transition is monotonic and safe to retry independently.
  async markRead(player: string, message: string) {
    const gen = this.generation
    try {
      const result = await this.ports.command({
        command_id: this.ports.newId(),
        action: { type: 'Read', player, message },
      })
      return gen === this.generation && result !== null
    } catch {
      return false
    }
  }
  async run(action: SocialAction) {
    if (this.store.getState().busy || this.store.getState().pending)
      return false
    this.store.setState({
      pending: {
        command_id: this.ports.newId(),
        action: structuredClone(action),
      },
    })
    return this.retry()
  }
  async retry() {
    const { pending, busy } = this.store.getState()
    if (!pending || busy) return false
    const gen = this.generation
    this.store.setState({ busy: true, error: '' })
    try {
      const result = await this.ports.command(pending)
      if (gen !== this.generation) return false
      if (!result) throw new Error('Result unknown. Retry to confirm.')
      this.store.setState({ busy: false, pending: null, completed: pending })
      if (!['Read', 'ReadCircular'].includes(pending.action.type)) {
        await this.list()
        if (this.player) await this.history('newer')
      }
      return true
    } catch (e) {
      if (gen !== this.generation) return false
      const code = status(e)
      const rejected = code >= 400 && code < 500 && code !== 408 && code !== 429
      this.store.setState({
        busy: false,
        error: errorText(e),
        ...(rejected ? { pending: null } : {}),
      })
      return false
    }
  }
}
