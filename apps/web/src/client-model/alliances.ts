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
  async refresh(query = this.query) {
    this.query = query
    const generation = ++this.generation
    const previous = this.store.getState().view?.alliance
    this.store.setState({
      loading: true,
      view: null,
      directory: null,
      error: '',
    })
    try {
      const response = await this.ports.read(query)
      if (generation !== this.generation) return
      if (!response)
        throw new Error('Alliance access unavailable. Refresh your session.')
      const view =
        query.type === 'Directory'
          ? await this.ports.read({ type: 'Mine' })
          : response
      if (generation !== this.generation) return
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
      if (generation !== this.generation) return
      const directory = directoryResponse
        ? {
            directory: directoryResponse.directory,
            directory_count: directoryResponse.directory_count,
          }
        : null
      this.store.setState({ view, directory, loading: false })
    } catch (error) {
      if (generation === this.generation && accessLost(error))
        this.ports.onAccessLost?.()
      if (generation === this.generation)
        this.store.setState({
          view: null,
          directory: null,
          loading: false,
          error: errorMessage(error),
          ...(accessLost(error) ? { pending: null } : {}),
        })
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
    const { pending, busy } = this.store.getState()
    if (!pending || busy) return false
    const generation = ++this.generation
    this.store.setState({ busy: true, error: '', notice: '' })
    try {
      const result = await this.ports.command(pending)
      if (generation !== this.generation) return false
      if (!result)
        throw new Error('Command status unknown. Retry to confirm the result.')
      if (
        [
          'Leave',
          'Disband',
          'Transfer',
          'AssignRoles',
          'SaveRole',
          'DeleteRole',
        ].includes(pending.action.type)
      )
        this.ports.onAccessLost?.()
      this.store.setState({
        busy: false,
        pending: null,
        view: null,
        directory: null,
        notice: 'Alliance updated.',
      })
      await this.refresh({ type: 'Mine' })
      return true
    } catch (error) {
      if (generation !== this.generation) return false
      if (accessLost(error)) this.ports.onAccessLost?.()
      const status =
        typeof error === 'object' && error && 'status' in error
          ? Number(error.status)
          : 0
      const rejected =
        status >= 400 && status < 500 && status !== 408 && status !== 429
      this.store.setState({
        busy: false,
        error: `${errorMessage(error)}${status === 409 ? ' Refresh the alliance and submit again.' : ''}`,
        ...(rejected ? { pending: null } : {}),
        ...(accessLost(error) ? { view: null } : {}),
      })
      return false
    }
  }
}
