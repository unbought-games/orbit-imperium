import type {
  Binding,
  ClientPlatform,
  GameUpdate,
  GameUpdatesPort,
} from './commands'
export type DeliveryController = {
  stop(): void
  pause(): void
  wake(): void
  pending(): void
}
type Options = {
  binding: Binding
  platform: ClientPlatform
  updates?: GameUpdatesPort
  onUpdate(update: GameUpdate): Promise<void>
  reconcile(): Promise<void>
  hasPending(): boolean
  needsSnapshot?(): boolean
  nextWorkDelay?(): number
  isCurrent(): boolean
}
/** Connection/timer lifecycle only; gameplay remains in the coordinator's store. */
export function startGameDelivery(options: Options): DeliveryController {
  const { platform } = options,
    schedule = platform.scheduleOnce?.bind(platform)
  if (!schedule) return { stop() {}, pause() {}, wake() {}, pending() {} }
  let stopped = false,
    paused = platform.isVisible?.() === false,
    connected = false,
    polling = false
  let reconcileAgain = false
  let cursor: string | null = null,
    retry = 1000,
    streamRetryAt = 0,
    pollAt = Infinity
  let cancelPoll: (() => void) | undefined,
    cancelStream: (() => void) | undefined
  let controller: AbortController | undefined
  const current = () => !stopped && !paused && options.isCurrent()
  const random = () =>
    Math.max(0, Math.min(1, platform.random?.() ?? Math.random()))
  const idleDelay = () => 30000 + Math.floor(random() * 30000)
  const nextPollDelay = () => {
    if (!platform.isOnline()) return 5000
    const delay =
      (!connected && options.hasPending()) || options.needsSnapshot?.()
        ? 1000 + Math.floor(random() * 1000)
        : idleDelay()
    // Reconcile at due work even on a healthy stream. If the server still
    // reports it active, retry with a one-second floor rather than a busy loop.
    return Math.min(
      delay,
      Math.max(1000, options.nextWorkDelay?.() ?? Infinity),
    )
  }
  function queuePoll(delay: number, earlierOnly = false) {
    if (!current()) return
    const at = platform.monotonicNowMs() + delay
    if (earlierOnly && at >= pollAt) return
    cancelPoll?.()
    pollAt = at
    cancelPoll = schedule!(() => {
      pollAt = Infinity
      void poll()
    }, delay)
  }
  async function poll() {
    if (!current() || polling) return
    polling = true
    try {
      if (platform.isOnline()) await options.reconcile()
    } catch {
      /* Receipts retain acceptance; the next reconciliation can retry. */
    } finally {
      polling = false
      if (current()) {
        const delay = reconcileAgain ? 0 : nextPollDelay()
        reconcileAgain = false
        queuePoll(delay)
      }
    }
  }
  async function open() {
    if (!current() || controller || !options.updates) return
    if (!platform.isOnline()) {
      cancelStream = schedule!(() => void open(), 5000)
      return
    }
    const cooldown = streamRetryAt - platform.monotonicNowMs()
    if (cooldown > 0) {
      cancelStream = schedule!(() => void open(), cooldown)
      return
    }
    const stream = new AbortController()
    controller = stream
    const active = () => current() && controller === stream
    let unavailable = false
    let retryAfterMs = 0
    try {
      await options.updates.subscribe(options.binding, cursor, {
        signal: stream.signal,
        onConnect: () => {
          if (!active()) return
          connected = true
          retry = 1000
          // A resumed stream may only send keepalives. Reconcile immediately,
          // without waiting for a new event or resetting an earlier poll.
          if (polling) reconcileAgain = true
          else queuePoll(0)
        },
        onUpdate: async (update) => {
          if (!active()) return
          await options.onUpdate(update)
          if (!active()) return
          cursor = update.cursor ?? cursor
          connected = true
          retry = 1000
          queuePoll(nextPollDelay(), true)
        },
        onDisconnect: () => {
          if (active()) connected = false
        },
      })
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'retryAfterMs' in error &&
        typeof error.retryAfterMs === 'number' &&
        Number.isFinite(error.retryAfterMs)
      )
        retryAfterMs = Math.max(0, error.retryAfterMs)
      unavailable =
        !!error &&
        typeof error === 'object' &&
        'status' in error &&
        [404, 426].includes(Number(error.status))
    } finally {
      if (controller === stream) {
        controller = undefined
        connected = false
        if (current()) {
          streamRetryAt = platform.monotonicNowMs() + retryAfterMs
          cancelStream = schedule!(
            () => void open(),
            Math.max(retryAfterMs, unavailable ? 60000 : retry) +
              Math.floor(random() * 1000),
          )
          retry = Math.min(30000, retry * 2)
          queuePoll(nextPollDelay(), true)
        }
      }
    }
  }
  if (options.updates) {
    queuePoll(nextPollDelay())
    void open()
  } else queuePoll(0)
  return {
    stop() {
      stopped = true
      cancelPoll?.()
      cancelStream?.()
      controller?.abort()
    },
    pause() {
      paused = true
      connected = false
      cancelPoll?.()
      pollAt = Infinity
      cancelStream?.()
      const old = controller
      controller = undefined
      old?.abort()
    },
    wake() {
      paused = false
      if (!current()) return
      if (polling) reconcileAgain = true
      else queuePoll(0)
      if (!controller) {
        cancelStream?.()
        void open()
      }
    },
    pending() {
      queuePoll(nextPollDelay(), true)
    },
  }
}
