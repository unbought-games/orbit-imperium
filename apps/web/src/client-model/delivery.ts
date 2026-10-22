import type {
  Binding,
  ClientPlatform,
  GameUpdate,
  GameUpdatesPort,
} from './commands'
export type DeliveryController = { stop(): void; wake(): void; pending(): void }
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
  if (!schedule) return { stop() {}, wake() {}, pending() {} }
  let stopped = false,
    connected = false,
    streamRunning = false,
    polling = false
  let reconcileAgain = false
  let cursor: string | null = null,
    retry = 1000,
    pollAt = Infinity
  let cancelPoll: (() => void) | undefined,
    cancelStream: (() => void) | undefined
  let controller: AbortController | undefined
  const current = () => !stopped && options.isCurrent()
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
    if (!current() || streamRunning || !options.updates) return
    if (!platform.isOnline()) {
      cancelStream = schedule!(() => void open(), 5000)
      return
    }
    streamRunning = true
    controller = new AbortController()
    let unavailable = false
    try {
      await options.updates.subscribe(options.binding, cursor, {
        signal: controller.signal,
        onUpdate: async (update) => {
          if (!current()) return
          await options.onUpdate(update)
          if (!current()) return
          cursor = update.cursor ?? cursor
          connected = true
          retry = 1000
          queuePoll(nextPollDelay())
        },
        onDisconnect: () => {
          connected = false
        },
      })
    } catch (error) {
      unavailable =
        !!error &&
        typeof error === 'object' &&
        'status' in error &&
        [404, 426].includes(Number(error.status))
    } finally {
      streamRunning = false
      connected = false
      if (current()) {
        cancelStream = schedule!(
          () => void open(),
          (unavailable ? 60000 : retry) + Math.floor(random() * 1000),
        )
        retry = Math.min(30000, retry * 2)
        queuePoll(nextPollDelay(), true)
      }
    }
  }
  if (options.updates) {
    void open()
    queuePoll(nextPollDelay())
  } else queuePoll(0)
  return {
    stop() {
      stopped = true
      cancelPoll?.()
      cancelStream?.()
      controller?.abort()
    },
    wake() {
      if (!current()) return
      if (polling) reconcileAgain = true
      else queuePoll(0)
      if (!streamRunning) {
        cancelStream?.()
        void open()
      }
    },
    pending() {
      queuePoll(nextPollDelay(), true)
    },
  }
}
