import { embeddedForDestination } from '../client-model/bootstrap-target'
import { Coordinator } from '../client-model/coordinator'
import {
  validateInitialGame,
  type Bootstrap,
  type Session,
} from '../client-model/bootstrap'
import type { ClientPlatform } from '../client-model/commands'
import { ContractDataError, validate } from '../client-model/schema'
import { clientUpdate } from './client-update'
import { clearLegacyOrderStorage } from './legacy-order-storage'
import { gamePort, http } from './http'
import { readEmbeddedBootstrap } from './bootstrap'
import { createGameUpdatesPort } from './updates'
import { commandId } from './command-id'
export type BootstrapSource = 'document' | 'retry' | 'login' | 'signup'
type GameIssue =
  | { status: 'no_membership' }
  | {
      status: 'unavailable'
      code:
        | 'Unavailable'
        | 'MembershipUnavailable'
        | 'UnsupportedProtocol'
        | 'InvalidBootstrap'
    }
export type AppRuntime = { signupEnabled: boolean } & (
  | { status: 'anonymous' }
  | { status: 'unavailable' }
  | {
      status: 'authenticated'
      session: Session
      source: BootstrapSource
      game: { status: 'ready'; model: Coordinator } | GameIssue
    }
)
export type AuthenticatedRuntime = Extract<
  AppRuntime,
  { status: 'authenticated' }
>
export type RuntimeDependencies = {
  platform: ClientPlatform
  createPort: typeof gamePort
  createUpdates?: typeof createGameUpdatesPort
  readEmbedded: () => Bootstrap | null
  fetchBootstrap: () => Promise<Bootstrap>
}
export function browserDependencies(): RuntimeDependencies {
  clearLegacyOrderStorage(() => sessionStorage)
  clearLegacyOrderStorage(() => localStorage)
  return {
    platform: {
      scheduleOnce: (callback, delay) => {
        const timer = setTimeout(callback, delay)
        return () => clearTimeout(timer)
      },
      newId: () => commandId(crypto),
      monotonicNowMs: () => performance.now(),
      isOnline: () => navigator.onLine,
      isVisible: () => document.visibilityState !== 'hidden',
    },
    createPort: gamePort,
    createUpdates: createGameUpdatesPort,
    readEmbedded: () =>
      embeddedForDestination(
        readEmbeddedBootstrap(document),
        location.pathname,
      ),
    fetchBootstrap: http.bootstrap,
  }
}
export async function prepareRuntime(
  payload: Bootstrap,
  source: BootstrapSource,
  deps: RuntimeDependencies,
): Promise<AppRuntime> {
  validate<Bootstrap>('Bootstrap', payload)
  const { result } = payload,
    signupEnabled = payload.signup_enabled
  if (result.status !== 'authenticated')
    return { status: result.status, signupEnabled }
  const base = {
    status: 'authenticated' as const,
    session: result.session,
    signupEnabled,
    source,
  }
  if (result.game.status !== 'ready') return { ...base, game: result.game }
  let snapshot
  try {
    snapshot = validateInitialGame(result.session, result.game.snapshot)
  } catch (error) {
    if (error instanceof ContractDataError) clientUpdate.incompatible()
    return {
      ...base,
      game: { status: 'unavailable', code: 'InvalidBootstrap' },
    }
  }
  let model: Coordinator | undefined
  try {
    model = new Coordinator(
      deps.createPort(result.session.csrf, snapshot.candidate),
      deps.platform,
      deps.createUpdates?.(),
    )
    await model.initialize(result.session, snapshot)
    clientUpdate.compatible()
    return { ...base, game: { status: 'ready', model } }
  } catch {
    model?.invalidate()
    return {
      ...base,
      game: { status: 'unavailable', code: 'Unavailable' },
    }
  }
}
export async function loadInitialRuntime(
  deps: RuntimeDependencies,
  freshSession = false,
  onFetch?: () => void,
): Promise<AppRuntime> {
  try {
    const embedded = freshSession ? null : deps.readEmbedded()
    if (!embedded) onFetch?.()
    return await prepareRuntime(
      embedded ?? (await deps.fetchBootstrap()),
      'document',
      deps,
    )
  } catch (error) {
    if (error instanceof ContractDataError) clientUpdate.incompatible()
    return { status: 'unavailable', signupEnabled: false }
  }
}
export function runtimeNeedsRecovery(runtime: AppRuntime): boolean {
  return (
    runtime.status === 'unavailable' ||
    (runtime.status === 'authenticated' &&
      runtime.game.status === 'unavailable' &&
      runtime.game.code === 'Unavailable')
  )
}
export function runtimeModel(runtime: AppRuntime): Coordinator | null {
  return runtime.status === 'authenticated' && runtime.game.status === 'ready'
    ? runtime.game.model
    : null
}
export function disposeRuntime(runtime: AppRuntime) {
  runtimeModel(runtime)?.invalidate()
}
