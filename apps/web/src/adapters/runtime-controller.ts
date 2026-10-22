import { createStore } from 'zustand/vanilla'
import { http, HttpError } from './http'
import {
  prepareRuntime,
  disposeRuntime,
  runtimeModel,
  runtimeNeedsRecovery,
  type AppRuntime,
  type RuntimeDependencies,
  type BootstrapSource,
} from './runtime'
import type { Bootstrap } from '../client-model/bootstrap'
type Api = Pick<
  typeof http,
  'bootstrap' | 'loginBootstrap' | 'signupBootstrap' | 'logout'
>
type State = { runtime: AppRuntime; busy: boolean; message: string }
function authMessage(error: unknown, signup: boolean): string {
  if (!signup) return 'Sign-in failed. Check your credentials and try again.'
  const code = error instanceof HttpError ? error.code : ''
  return (
    (
      {
        UniverseFull: 'This universe is full. Please try again later.',
        Conflict:
          'That account name is already taken. Choose another or sign in.',
        Forbidden:
          'Account creation was blocked. Refresh the page and try again, or contact the server administrator.',
        RateLimited: 'Too many attempts. Please wait a minute and try again.',
        Malformed: 'Enter an account name and password.',
      } as Record<string, string>
    )[code] ??
    'Account creation could not be confirmed. Try signing in, or retry shortly.'
  )
}
/** Owns session transitions; async results may only replace their own generation. */
export class RuntimeController {
  readonly store
  private generation = 0
  private retryAt = 0
  // An explicit sign-in gesture can outlive a failed game preparation. Keep its
  // session binding until it is handed to a ready coordinator or invalidated.
  private pendingLogin: {
    account: string
    csrf: string
    source: 'login' | 'signup'
  } | null = null
  constructor(
    initial: AppRuntime,
    private deps: RuntimeDependencies,
    private api: Api = http,
  ) {
    this.store = createStore<State>(() => ({
      runtime: initial,
      busy: false,
      message: '',
    }))
  }
  startRecovery() {
    const { platform } = this.deps
    let cancel: (() => void) | undefined,
      delay = 1000,
      stopped = false
    const needed = () => runtimeNeedsRecovery(this.store.getState().runtime)
    const queue = (wait = delay) => {
      if (stopped || cancel || this.store.getState().busy) return
      cancel = platform.scheduleOnce?.(
        () => {
          cancel = undefined
          if (!needed() || stopped) return
          if (!platform.isOnline()) {
            queue(5000)
            return
          }
          delay = Math.min(30000, delay * 2)
          void this.retry()
        },
        Math.max(wait, this.retryAt - platform.monotonicNowMs()),
      )
    }
    const inspect = () => {
      if (!needed() || this.store.getState().busy) {
        cancel?.()
        cancel = undefined
        if (!needed()) delay = 1000
      } else queue()
    }
    const unsubscribe = this.store.subscribe(inspect)
    inspect()
    return {
      wake: () => {
        if (!needed() || stopped) return
        cancel?.()
        cancel = undefined
        queue(0)
      },
      stop: () => {
        stopped = true
        cancel?.()
        unsubscribe()
      },
    }
  }
  private replace(runtime: AppRuntime) {
    const old = this.store.getState().runtime
    if (runtimeModel(old) !== runtimeModel(runtime)) disposeRuntime(old)
    this.store.setState({ runtime })
  }
  private async accept(payload: Bootstrap, source: BootstrapSource, g: number) {
    if (g !== this.generation) return
    const result = payload.result
    if (
      (source === 'login' || source === 'signup') &&
      result.status === 'authenticated'
    ) {
      this.pendingLogin = {
        account: result.session.account,
        csrf: result.session.csrf,
        source,
      }
    } else if (
      result.status === 'anonymous' ||
      (result.status === 'authenticated' &&
        this.pendingLogin &&
        (result.session.account !== this.pendingLogin.account ||
          result.session.csrf !== this.pendingLogin.csrf))
    ) {
      this.pendingLogin = null
    }
    const pending = this.pendingLogin
    const runtime = await prepareRuntime(
      payload,
      result.status === 'authenticated' && pending ? pending.source : source,
      this.deps,
    )
    if (g !== this.generation) {
      disposeRuntime(runtime)
      return
    }
    if (runtimeModel(runtime)) this.pendingLogin = null
    this.replace(runtime)
  }
  clearMessage = () => this.store.setState({ message: '' })
  async authenticate(signup: boolean, name: string, password: string) {
    if (this.store.getState().busy) return
    this.pendingLogin = null
    const g = ++this.generation
    this.store.setState({ busy: true, message: '' })
    try {
      await this.accept(
        await (signup ? this.api.signupBootstrap : this.api.loginBootstrap)(
          name,
          password,
        ),
        signup ? 'signup' : 'login',
        g,
      )
    } catch (error) {
      if (g === this.generation) {
        this.store.setState({ message: authMessage(error, signup) })
      }
    } finally {
      if (g === this.generation) this.store.setState({ busy: false })
    }
  }
  async retry(suspend = false) {
    const g = ++this.generation
    this.store.setState({ busy: true, message: '' })
    if (suspend)
      this.replace({
        status: 'unavailable',
        signupEnabled: this.store.getState().runtime.signupEnabled,
      })
    try {
      await this.accept(await this.api.bootstrap(), 'retry', g)
    } catch (error) {
      if (g === this.generation) {
        this.retryAt =
          this.deps.platform.monotonicNowMs() +
          (error instanceof HttpError ? error.retryAfterMs : 0)
        this.store.setState({ message: 'Unable to connect. Please retry.' })
      }
    } finally {
      if (g === this.generation) this.store.setState({ busy: false })
    }
  }
  loseAccess() {
    this.pendingLogin = null
    ++this.generation
    this.replace({
      status: 'anonymous',
      signupEnabled: this.store.getState().runtime.signupEnabled,
    })
    this.store.setState({
      busy: false,
      message: 'Your session or membership is unavailable. Please sign in.',
    })
  }
  async logout(): Promise<boolean> {
    const { runtime } = this.store.getState()
    if (runtime.status !== 'authenticated') return false
    const g = ++this.generation,
      model = runtimeModel(runtime)
    this.store.setState({ busy: true, message: '' })
    try {
      await model?.recordPresence('Logout', model.view?.bodies[0]?.id ?? null)
      await this.api.logout(runtime.session.csrf)
      await model?.logout()
      if (g !== this.generation) return false
      this.pendingLogin = null
      this.replace({
        status: 'anonymous',
        signupEnabled: runtime.signupEnabled,
      })
      return true
    } catch {
      if (g === this.generation)
        this.store.setState({ message: 'Sign-out failed. Please retry.' })
      return false
    } finally {
      if (g === this.generation) this.store.setState({ busy: false })
    }
  }
}
export function onPageRestore(callback: () => void): () => void {
  const listener = (event: PageTransitionEvent) => {
    if (event.persisted) callback()
  }
  window.addEventListener('pageshow', listener)
  return () => window.removeEventListener('pageshow', listener)
}
