import { createStore } from 'zustand/vanilla'
import type { components } from '../contracts'
type S = components['schemas']
export type AllianceDetail = S['AllianceDetail']
export type AllianceAction = S['AllianceAction']
export type AlliancePermission = S['AlliancePermission']
export type AllianceRequest = Omit<S['AllianceCommandRequest'], 'context'>
export const permissionLabels: Record<AlliancePermission, string> = {
  ViewMembers: 'View roster',
  ViewActivity: 'View coarse activity',
  ViewApplications: 'View applications',
  ProcessApplications: 'Accept and reject applications',
  EditProfile: 'Edit alliance profile',
  ManageRecruitment: 'Change recruitment mode',
  PublishPosts: 'Publish notices',
  SendCircular: 'Send alliance circulars',
  ManagePosts: 'Edit and delete others’ notices',
  PinPosts: 'Pin notices',
  ManageRoles: 'Create and edit roles',
  AssignRoles: 'Assign roles',
  KickMembers: 'Remove members',
  ViewAudit: 'View audit history',
}
export const can = (detail: AllianceDetail, permission: AlliancePermission) =>
  detail.permissions.includes(permission)
export function canDelegate(
  detail: AllianceDetail,
  permissions: AlliancePermission[],
) {
  return permissions.every((p) => detail.grantable_permissions.includes(p))
}
export function permissionDependencies(permissions: AlliancePermission[]) {
  return (
    (!permissions.includes('ViewActivity') ||
      permissions.includes('ViewMembers')) &&
    (!permissions.includes('ProcessApplications') ||
      permissions.includes('ViewApplications'))
  )
}
function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Alliance request failed. Try again.'
}
function statusCode(error: unknown): number {
  return typeof error === 'object' && error !== null && 'status' in error
    ? Number(error.status)
    : 0
}
function newestPage(query: S['AllianceQuery']): S['AllianceQuery'] {
  return query.type === 'Detail' ? { ...query, post_before: null } : query
}
function accessLost(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    (('status' in error && [401, 403, 404].includes(Number(error.status))) ||
      ('code' in error && error.code === 'EpochChanged'))
  )
}
export class AlliancesController {
  readonly store = createStore<{
    view: S['AllianceView'] | null
    directory: Pick<S['AllianceView'], 'directory' | 'directory_count'> | null
    loading: boolean
    busy: boolean
    error: string
    notice: string
    pending: AllianceRequest | null
  }>(() => ({
    view: null,
    directory: null,
    loading: false,
    busy: false,
    error: '',
    notice: '',
    pending: null,
  }))
  private generation = 0
  private query: S['AllianceQuery'] = { type: 'Mine' }
  constructor(
    private readonly ports: {
      read: (query: S['AllianceQuery']) => Promise<S['AllianceView'] | null>
      command: (
        request: AllianceRequest,
      ) => Promise<S['AllianceCommandResult'] | null>
      newId: () => string
      onAccessLost?: () => void
    },
  ) {}
  clear() {
    this.ports.onAccessLost?.()
    this.generation++
    this.store.setState({
      view: null,
      directory: null,
      loading: false,
      busy: false,
      pending: null,
      error: '',
      notice: '',
    })
  }
  refresh(query?: S['AllianceQuery']) {
    return this.load(
      query ?? newestPage(this.query),
      this.store.getState().view?.alliance,
    )
  }
  private async load(
    query: S['AllianceQuery'],
    previous?: AllianceDetail | null,
    successNotice = '',
  ): Promise<boolean> {
    this.query = query
    const generation = ++this.generation
    this.store.setState({
      loading: true,
      view: null,
      directory: null,
      error: '',
      notice: '',
    })
    try {
      let response: S['AllianceView'] | null
      let recoveredCursor = false
      try {
        response = await this.ports.read(query)
      } catch (error) {
        if (generation !== this.generation) return false
        if (
          query.type !== 'Detail' ||
          !query.post_before ||
          statusCode(error) !== 409
        )
          throw error
        // A board revision invalidates old page cursors. Recover once from a
        // fresh first page, never keep replaying the invalid cursor.
        query = newestPage(query)
        this.query = query
        response = await this.ports.read(query)
        recoveredCursor = true
      }
      if (generation !== this.generation) return false
      if (!response)
        throw new Error('Alliance access unavailable. Refresh your session.')
      const view =
        query.type === 'Directory'
          ? await this.ports.read({ type: 'Mine' })
          : response
      if (generation !== this.generation) return false
      if (!view)
        throw new Error('Alliance access unavailable. Refresh your session.')
      if (
        previous &&
        (!view.alliance ||
          previous.summary.id !== view.alliance.summary.id ||
          previous.permissions.some(
            (permission) => !view.alliance!.permissions.includes(permission),
          ) ||
          previous.grantable_permissions.some(
            (permission) =>
              !view.alliance!.grantable_permissions.includes(permission),
          ))
      )
        this.ports.onAccessLost?.()
      const directoryResponse =
        query.type === 'Directory'
          ? response
          : !view.alliance
            ? await this.ports.read({
                type: 'Directory',
                search: '',
                offset: 0,
              })
            : null
      if (generation !== this.generation) return false
      const directory = directoryResponse
        ? {
            directory: directoryResponse.directory,
            directory_count: directoryResponse.directory_count,
          }
        : null
      this.store.setState({
        view,
        directory,
        loading: false,
        notice: recoveredCursor
          ? 'The noticeboard changed. Showing the newest notices.'
          : successNotice,
      })
      return true
    } catch (error) {
      if (generation !== this.generation) return false
      if (accessLost(error)) this.ports.onAccessLost?.()
      this.store.setState({
        view: null,
        directory: null,
        loading: false,
        error: errorMessage(error),
        ...(accessLost(error) ? { pending: null } : {}),
      })
      return false
    }
  }
  async run(action: AllianceAction): Promise<boolean> {
    if (this.store.getState().busy || this.store.getState().pending)
      return false
    const revision = ['Create', 'Join', 'Apply', 'Withdraw'].includes(
      action.type,
    )
      ? null
      : (this.store.getState().view?.alliance?.revision ?? null)
    const pending = {
      command_id: this.ports.newId(),
      expected_revision: revision,
      action: structuredClone(action),
    }
    this.store.setState({ pending })
    return this.retry()
  }
  async retry(): Promise<boolean> {
    const { pending, busy, view: previousView } = this.store.getState()
    if (!pending || busy) return false
    const generation = ++this.generation
    this.store.setState({ busy: true, error: '', notice: '' })
    try {
      const result = await this.ports.command(pending)
      if (generation !== this.generation) return false
      if (!result)
        throw new Error('Command status unknown. Retry to confirm the result.')
      if (['Leave', 'Disband', 'Transfer'].includes(pending.action.type))
        this.ports.onAccessLost?.()
      this.store.setState({
        busy: false,
        pending: null,
        view: null,
        directory: null,
      })
      await this.load(
        { type: 'Mine' },
        previousView?.alliance,
        'Alliance updated.',
      )
      return true
    } catch (error) {
      if (generation !== this.generation) return false
      const status = statusCode(error)
      const rejected =
        status >= 400 && status < 500 && status !== 408 && status !== 429
      const message = `${errorMessage(error)}${status === 409 ? ' Refresh the alliance and submit again.' : ''}`
      if (status === 403 || status === 404) {
        // Missing targets and ordinary permission denials do not establish that
        // membership was lost. Hide the old view and recheck the actor's access.
        this.store.setState({
          busy: false,
          pending: null,
          view: null,
          directory: null,
        })
        if (await this.load({ type: 'Mine' }, previousView?.alliance))
          this.store.setState({ error: message })
        return false
      }
      if (accessLost(error)) this.ports.onAccessLost?.()
      this.store.setState({
        busy: false,
        error: message,
        ...(rejected ? { pending: null } : {}),
        ...(accessLost(error) ? { view: null, directory: null } : {}),
      })
      return false
    }
  }
}
