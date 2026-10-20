import { Coordinator } from '../client-model/coordinator'
import {
  validateInitialGame,
  type Bootstrap,
  type Session,
} from '../client-model/bootstrap'
import type { ClientPlatform } from '../client-model/commands'
import { validate } from '../client-model/schema'
import { attemptStorage, prepareSession } from './attempt-storage'
import { gamePort, http } from './http'
import { readEmbeddedBootstrap } from './bootstrap'
import { createGameUpdatesPort } from './updates'
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
        | 'StorageUnavailable'
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
  storage: Storage
  platform: ClientPlatform
  createPort: typeof gamePort
  createUpdates?: typeof createGameUpdatesPort
  readEmbedded: () => Bootstrap | null
  fetchBootstrap: () => Promise<Bootstrap>
}
export function browserDependencies(): RuntimeDependencies {
  return {
    get storage() {
      return sessionStorage
    },
    platform: {
      scheduleOnce: (callback, delay) => {
        const timer = setTimeout(callback, delay)
        return () => clearTimeout(timer)
      },
      newId: () => crypto.randomUUID(),
      monotonicNowMs: () => performance.now(),
      isOnline: () => navigator.onLine,
    },
    createPort: gamePort,
    createUpdates: createGameUpdatesPort,
    readEmbedded: () => readEmbeddedBootstrap(document),
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
  } catch {
    return {
      ...base,
      game: { status: 'unavailable', code: 'InvalidBootstrap' },
    }
  }
  let model: Coordinator | undefined
  try {
    const restore = prepareSession(deps.storage, result.session)
    model = new Coordinator(
      deps.createPort(result.session.csrf, snapshot.candidate),
      attemptStorage(deps.storage),
      deps.platform,
      restore,
      deps.createUpdates?.(),
    )
    await model.initialize(result.session, snapshot)
    return { ...base, game: { status: 'ready', model } }
  } catch {
    model?.invalidate()
    return {
      ...base,
      game: { status: 'unavailable', code: 'StorageUnavailable' },
    }
  }
}
export async function loadInitialRuntime(
  deps: RuntimeDependencies,
): Promise<AppRuntime> {
  try {
    return await prepareRuntime(
      deps.readEmbedded() ?? (await deps.fetchBootstrap()),
      'document',
      deps,
    )
  } catch {
    return { status: 'unavailable', signupEnabled: false }
  }
}
export function runtimeModel(runtime: AppRuntime): Coordinator | null {
  return runtime.status === 'authenticated' && runtime.game.status === 'ready'
    ? runtime.game.model
    : null
}
export function disposeRuntime(runtime: AppRuntime) {
  runtimeModel(runtime)?.invalidate()
}
