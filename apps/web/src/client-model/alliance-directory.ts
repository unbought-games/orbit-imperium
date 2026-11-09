import { createStore } from 'zustand/vanilla'
import type { components } from '../contracts'
type S = components['schemas']
export type AllianceSearch = {
  search: string
  all: boolean
  language: string
  beginners: S['RecruitmentExperience'] | ''
  activity: S['RecruitmentActivity'] | ''
  offset: number
}
export const defaultAllianceSearch: AllianceSearch = {
  search: '',
  all: true,
  language: '',
  beginners: '',
  activity: '',
  offset: 0,
}
export function recruitmentSearch(query: AllianceSearch) {
  const params = new URLSearchParams()
  for (const key of ['search', 'language', 'beginners', 'activity'] as const)
    if (query[key]) params.set(key, query[key])
  if (query.offset) params.set('offset', String(query.offset))
  return params
}
export type DirectoryResult =
  | { kind: 'all'; data: S['AllianceView'] }
  | { kind: 'recruiting'; data: S['RecruitmentDirectory'] }
export class AllianceDirectoryController {
  readonly store = createStore<{
    result: DirectoryResult | null
    loading: boolean
    error: string
  }>(() => ({ result: null, loading: true, error: '' }))
  private generation = 0
  private abort?: AbortController
  constructor(
    private readonly read: (
      query: AllianceSearch,
      signal: AbortSignal,
    ) => Promise<DirectoryResult>,
  ) {}
  async load(query: AllianceSearch) {
    this.abort?.abort()
    const abort = (this.abort = new AbortController())
    const generation = ++this.generation
    this.store.setState({ loading: true, error: '' })
    try {
      const result = await this.read(query, abort.signal)
      if (generation === this.generation && !abort.signal.aborted)
        this.store.setState({ result, loading: false })
    } catch (error) {
      if (generation === this.generation && !abort.signal.aborted)
        this.store.setState({
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : 'Unable to load alliances.',
        })
    }
  }
  cancel() {
    this.abort?.abort()
    this.generation++
  }
  clear() {
    this.cancel()
    this.store.setState({ result: null, loading: true, error: '' })
  }
}
