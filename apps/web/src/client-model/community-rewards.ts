import { createStore } from 'zustand/vanilla'
import type {
  CommunityAction,
  CommunityActionRequest,
  CommunityActionResponse,
  CommunityOwner,
  CommunityStatus,
  communityRewardsApi,
} from '../adapters/community-rewards'
import { HttpError } from '../adapters/http'
import { commandId } from '../adapters/command-id'
export type RewardsState = {
  snapshot?: CommunityStatus
  loading: boolean
  busy: boolean
  error: string
  pending?: CommunityActionRequest
}
export const rewardsOwner = (
  value: CommunityStatus | undefined,
): CommunityOwner | undefined =>
  value && 'program' in value ? value : undefined
export const rewardsVisible = (value: CommunityStatus | undefined) => {
  const owner = rewardsOwner(value)
  return !!owner?.program.start_at && owner.program.status !== 'inactive'
}
export const pendingChoices = (owner: CommunityOwner) =>
  owner.milestones.filter((m) => m.unlocked && m.remaining > 0)
export class CommunityRewardsController {
  readonly store = createStore<RewardsState>(() => ({
    loading: false,
    busy: false,
    error: '',
  }))
  private generation = 0
  private read?: AbortController
  private write?: AbortController
  constructor(
    readonly api: ReturnType<typeof communityRewardsApi>,
    private changed: () => void = () => {},
    private newId = () => commandId(crypto),
  ) {}
  stop = () => {
    this.generation++
    this.read?.abort()
    this.write?.abort()
  }
  load = async () => {
    if (this.store.getState().busy) return
    const generation = ++this.generation
    this.read?.abort()
    const read = (this.read = new AbortController())
    this.store.setState({ loading: true, error: '' })
    try {
      const snapshot = await this.api.owner(read.signal)
      if (generation === this.generation)
        this.store.setState({ snapshot, loading: false })
    } catch {
      if (generation === this.generation && !read.signal.aborted)
        this.store.setState({
          loading: false,
          error:
            'Rewards are temporarily unavailable. Your progress and choices are saved.',
        })
    }
  }
  act = async (
    action: CommunityAction,
  ): Promise<CommunityActionResponse | undefined> => {
    const state = this.store.getState()
    if (state.busy) return
    if (
      state.pending &&
      JSON.stringify(state.pending.action) !== JSON.stringify(action)
    ) {
      this.store.setState({
        error: 'Retry the pending choice before making another change.',
      })
      return
    }
    const pending = state.pending ?? {
      contract_version: 1 as const,
      request_id: this.newId(),
      action,
    }
    const generation = ++this.generation
    this.read?.abort()
    const write = (this.write = new AbortController())
    this.store.setState({ busy: true, loading: false, pending, error: '' })
    try {
      const result = await this.api.act(pending, write.signal)
      if (generation !== this.generation) return
      this.store.setState({
        snapshot: result.owner,
        busy: false,
        pending: undefined,
      })
      this.changed()
      return result
    } catch (error) {
      if (generation !== this.generation || write.signal.aborted) return
      const stale = error instanceof HttpError && error.status === 409
      const rejected =
        error instanceof HttpError &&
        error.status >= 400 &&
        error.status < 500 &&
        ![408, 429].includes(error.status)
      this.store.setState({
        busy: false,
        ...(rejected ? { pending: undefined } : {}),
        error: stale
          ? 'The choices or invitation changed. Review the refreshed details before confirming.'
          : rejected
            ? 'This change was not accepted. Refresh your rewards before choosing again.'
            : 'We could not confirm the change. Retry safely with the same request.',
      })
      if (stale) await this.loadKeepingError()
    }
  }
  private async loadKeepingError() {
    const error = this.store.getState().error
    await this.load()
    this.store.setState({ error })
  }
  retry = () => {
    const pending = this.store.getState().pending
    return pending ? this.act(pending.action) : Promise.resolve(undefined)
  }
}
