import { BoundCommandRecovery } from './bound-command-recovery'
import {
  commandWindowError,
  definiteMutationResponse,
  unavailableCommandAccess,
  unknownAccessMessage,
  futureSkewMs,
  futureCommand,
  futureCheckDelay,
  presenceCommandId,
  timestampedCommandId,
  identityProblem,
  withinCommandWindow,
} from './command-window'
import { DispatchObservations } from './dispatch-observations'
import { matchesCargoInstruction } from './dispatch-cargo'
import { TutorialEngine } from './tutorial-engine'
import {
  readStableMailbox,
  acceptMailboxAction,
  reconcileMailboxReads,
} from './social-mailbox'
import {
  validateInitialGame,
  validateGameData,
  type InitialGameSnapshot,
  type Session,
} from './bootstrap'
import {
  type Attempt,
  type AttemptLedger,
  type Binding,
  type BoundQuote,
  type BoundReceipt,
  type BoundView,
  type BoundSettings,
  type ClientPlatform,
  type Command,
  type Envelope,
  type GamePort,
  type GameUpdate,
  type GameUpdatesPort,
  type QuoteRequest,
  type QueryContext,
  attemptKey,
  bindingKey,
  canonical,
  hasOrderNotice,
  sameBinding,
  terminal,
} from './commands'
import { ContractDataError, validate } from './schema'
import { ReportEngine } from './report-engine'
import {
  acceptReportVisibility,
  mergeReportHeaders,
  supersededReportFailures,
} from './report-state'
import { startGameDelivery, type DeliveryController } from './delivery'
import { createGameStore, type GameState } from './game-store'
import {
  canSubmitQuote,
  commandBody,
  commandParent,
  acceptedEntityReference,
  currentServerTime,
  nextWorkDelay,
  matchesQuote,
  pendingCommand,
  snapshotNeedsReceipt,
  type SubmittedIntent,
  type SubmittedQuote,
} from './game-projection'
// Transport identity and session identity travel together; endpoint-specific
// ordering (latest quote/view versus concurrent reads) stays with the caller.
type CapturedRequest = {
  context: QueryContext
  generation: number
}
type BoundResponse = Pick<QueryContext, 'binding' | 'request_id'>
type Failure = {
  status?: number
  code?: string
  message?: string
  retryAfterMs?: number
}
const failure = (e: unknown): Failure => (e && typeof e === 'object' ? e : {})
type OrderRefresh = { work?: Promise<void> }

export class Coordinator {
  private mailboxReads = new Map<string, import('./social').SocialAction>()
  private mailboxVersion = 0
  private mailboxRequest: Promise<void> | null = null
  readonly store = createGameStore()
  readonly tutorial = new TutorialEngine(this.store, () => this.readTutorial())
  readonly reports = new ReportEngine(this.store, {
    monotonicNow: () => this.platform.monotonicNowMs(),
    page: (cursor, query) => this.readReportPage(cursor, false, query),
    detail: (id) => this.readReportDetail(id),
  })
  private get attempts() {
    return this.store.getState().attempts
  }
  private set attempts(attempts: AttemptLedger) {
    this.store.setState({ attempts })
  }
  private saveAttempt(key: string, attempt: Attempt) {
    this.attempts = new Map(this.attempts).set(key, attempt)
  }
  private removeAttempt(key: string) {
    const state = this.store.getState()
    const attempts = new Map(state.attempts)
    const intents = new Map(state.intents)
    const hiddenOrderNotices = new Set(state.hiddenOrderNotices)
    attempts.delete(key)
    intents.delete(key)
    hiddenOrderNotices.delete(key)
    this.store.setState({ attempts, intents, hiddenOrderNotices })
  }
  get ledger(): AttemptLedger {
    return new Map(
      [...this.attempts].map(([key, a]) => [key, structuredClone(a)]),
    )
  }
  get binding() {
    return this.store.getState().binding
  }
  private set binding(binding: GameState['binding']) {
    this.store.setState({ binding })
  }
  get view() {
    return this.store.getState().view
  }
  private set view(view: GameState['view']) {
    const now = this.platform.monotonicNowMs()
    this.store.setState({ view, receivedAt: now, now })
  }
  get settings() {
    return this.store.getState().settings
  }
  private set settings(settings: GameState['settings']) {
    this.store.setState({ settings })
  }
  get message() {
    return this.store.getState().message
  }
  private set message(message: GameState['message']) {
    this.store.setState({ message })
  }
  get stale() {
    return this.store.getState().stale
  }
  private set stale(stale: GameState['stale']) {
    this.store.setState({ stale })
  }
  get ready() {
    return this.store.getState().ready
  }
  private set ready(ready: GameState['ready']) {
    this.store.setState({ ready })
  }
  get accessLost() {
    return this.store.getState().accessLost
  }
  private set accessLost(accessLost: GameState['accessLost']) {
    this.store.setState({ accessLost })
  }
  private get retryAt() {
    return this.store.getState().retryAt
  }
  private readonly boundRecovery: BoundCommandRecovery
  private restoredMutations: ReturnType<BoundCommandRecovery['restore']> = []
  private commandClock = { server: 0, received: 0, local: 0 }
  private needsClockRefresh = false
  private orderRefresh: OrderRefresh | null = null
  private resumedOrders = new Set<string>()
  private deferredUntil = new Map<string, number>()
  private get commandNow() {
    return (
      this.commandClock.server +
      Math.max(0, this.platform.monotonicNowMs() - this.commandClock.received)
    )
  }
  private sampleCommandClock(at: number) {
    this.needsClockRefresh = false
    this.commandClock = {
      server: at,
      received: this.platform.monotonicNowMs(),
      local: Date.now(),
    }
  }
  // Some mobile monotonic clocks pause during device sleep. A change in the
  // relative clock rates requires a fresh binding sample before minting an ID.
  private get clockNeedsSample() {
    const elapsed = this.platform.monotonicNowMs() - this.commandClock.received
    return (
      this.needsClockRefresh ||
      Math.abs(Date.now() - this.commandClock.local - elapsed) > futureSkewMs
    )
  }
  private async resampleClock() {
    const request = this.captureRequest()
    if (!request) throw Error('Reconnect before placing an order.')
    const { binding, request_id } = request.context
    const sample = validate<import('./commands').BindingCandidate>(
      'GameBindingCandidate',
      await this.port.currentBinding(binding.universe, request_id),
    )
    if (
      !this.responseMatches(request, sample) ||
      sample.protocol !== this.protocol
    )
      throw Object.assign(
        Error('Universe changed. Refresh before placing an order.'),
        { code: 'EpochChanged' },
      )
    this.sampleCommandClock(sample.sampled_at)
    return sample.sampled_at
  }
  newCommandId = (): string | Promise<string> =>
    this.clockNeedsSample
      ? this.resampleClock().then(() => this.mintCommandId())
      : this.mintCommandId()
  private mintCommandId() {
    return timestampedCommandId(this.platform.newId(), this.commandNow)
  }
  private delivery: DeliveryController | null = null
  private refreshWork: Promise<void> | null = null
  private recoveryWork: Promise<void> | null = null
  private pendingMinimum: string | undefined
  private generation = 0
  private viewGeneration = 0
  private quoteGeneration = 0
  private account = ''
  private protocol: 2 | 3 | 4 = 2
  private loginPresenceWork: Promise<void> | null = null
  private universe = ''
  readonly dispatchObservations: DispatchObservations
  startReviewObservation(prepared: boolean) {
    const id = this.platform.newId()
    this.dispatchObservations.start(
      id,
      prepared ? 'review_started_warm' : 'review_started_cold',
      this.platform.monotonicNowMs(),
    )
    return id
  }
  dispatchClickTime() {
    return this.platform.monotonicNowMs()
  }
  constructor(
    private port: GamePort,
    private platform: ClientPlatform,
    private updates?: GameUpdatesPort,
  ) {
    this.boundRecovery = new BoundCommandRecovery(platform.pendingCommands)
    this.dispatchObservations = new DispatchObservations(platform, (sample) => {
      if (this.binding)
        this.port.observeDispatch?.(this.binding.universe, sample)
    })
  }
  subscribe = this.store.subscribe
  startDelivery(): () => void {
    this.delivery?.stop()
    const binding = this.binding,
      generation = this.generation
    if (!binding || !this.ready) return () => {}
    const delivery = startGameDelivery({
      binding,
      platform: this.platform,
      updates: this.updates,
      onUpdate: (update) => this.onUpdate(update, true),
      reconcile: () => this.poll(),
      hasPending: () =>
        [...this.attempts.values()].some(
          (attempt) => !terminal(attempt) && attempt.status !== 'submitting',
        ),
      needsSnapshot: () =>
        !this.store.getState().incompatibleSchema &&
        (this.pendingMinimum !== undefined || this.stale),
      nextWorkDelay: () => nextWorkDelay(this.store.getState()),
      isCurrent: () => this.ready && this.current(generation, binding),
    })
    this.delivery = delivery
    if (
      (this.resumedOrders.size || this.restoredMutations.length) &&
      this.platform.isOnline() &&
      this.platform.isVisible?.() !== false
    )
      void this.reconcilePending()
    this.store.setState({
      foreground: this.platform.isVisible?.() ?? true,
      online: this.platform.isOnline(),
    })
    if (this.platform.isVisible?.() === false || !this.platform.isOnline())
      this.resumeDelivery()
    return () => {
      delivery.stop()
      if (this.delivery === delivery) this.delivery = null
    }
  }
  resumeDelivery(refocused = false) {
    const previous = this.store.getState()
    const foreground = this.platform.isVisible?.() ?? true
    const online = this.platform.isOnline()
    if (!foreground) this.dispatchObservations.suspend()
    const resumed =
      foreground &&
      online &&
      (refocused || !previous.foreground || !previous.online)
    this.store.setState({
      foreground,
      online,
      ...(resumed ? { deliveryResumedAt: this.platform.monotonicNowMs() } : {}),
    })
    if (!foreground || !online) {
      // Fence requests started before suspension/handoff. Their failures say
      // nothing about service availability after the next foreground resume.
      this.store.setState({ stale: true })
      this.viewGeneration++
      this.quoteGeneration++
      this.delivery?.pause()
      return
    }
    if (!previous.foreground || !previous.online) {
      for (const attempt of this.attempts.values()) {
        if (!terminal(attempt))
          this.resumedOrders.add(attempt.envelope.command_id)
      }
    }
    if ((!previous.foreground || !previous.online) && this.refreshWork) {
      // Supersede a suspended snapshot without waiting for its HTTP timeout.
      void this.refresh()
    }
    this.delivery?.wake()
  }
  tick() {
    const previous = this.store.getState()
    const now = this.platform.monotonicNowMs()
    this.store.setState({ now })
    if (previous.now < previous.retryAt && now >= previous.retryAt)
      this.resumeDelivery()
  }
  dismissMessage() {
    this.message = ''
  }
  dismissOrderNotices() {
    const hiddenOrderNotices = new Set(this.store.getState().hiddenOrderNotices)
    for (const [key, attempt] of this.attempts) {
      if (hasOrderNotice(attempt)) hiddenOrderNotices.add(key)
    }
    this.store.setState({ hiddenOrderNotices, message: '' })
    void this.pruneAttempts()
  }
  private current(g: number, b: Binding) {
    return (
      g === this.generation && !!this.binding && sameBinding(b, this.binding)
    )
  }
  private captureRequest(): CapturedRequest | null {
    const binding = this.binding
    if (!binding || !this.ready) return null
    return {
      context: { binding, request_id: this.platform.newId() },
      generation: this.generation,
    }
  }
  private requestIsCurrent(request: CapturedRequest) {
    return this.current(request.generation, request.context.binding)
  }
  private responseMatches(request: CapturedRequest, response: BoundResponse) {
    return (
      this.requestIsCurrent(request) &&
      response.request_id === request.context.request_id &&
      sameBinding(response.binding, request.context.binding)
    )
  }
  invalidate() {
    this.dispatchObservations.clear()
    this.tutorial.invalidate()
    this.reports.invalidate()
    this.restoredMutations = []
    this.orderRefresh = null
    this.resumedOrders.clear()
    this.deferredUntil.clear()
    this.mailboxReads.clear()
    this.mailboxVersion++
    this.mailboxRequest = null
    this.delivery?.stop()
    this.delivery = null
    this.generation++
    this.viewGeneration++
    this.quoteGeneration++
    this.pendingMinimum = undefined
    this.store.setState({
      ready: false,
      retryAt: 0,
      rateLimited: false,
      connectionInterrupted: false,
      incompatibleSchema: null,
      binding: null,
      view: null,
      settings: null,
      deliveryResumedAt: null,
      reportQueries: new Map(),
      reportInbox: null,
      reportInboxLoad: null,
      reportDetails: new Map(),
      reportDetailLoads: new Map(),
      mailbox: null,
      reportHeaders: new Map(),
      attempts: new Map(),
      hiddenOrderNotices: new Set(),
      intents: new Map(),
    })
  }
  async logout() {
    this.invalidate()
  }
  async connect(account: string, universe: string) {
    this.invalidate()
    this.accessLost = false
    this.account = account
    this.universe = universe
    const g = this.generation
    try {
      for (let tries = 0; tries < 3; tries++) {
        const request_id = this.platform.newId()
        const candidate = validate<import('./commands').BindingCandidate>(
          'GameBindingCandidate',
          await this.port.currentBinding(universe, request_id),
        )
        if (g !== this.generation) return
        if (
          candidate.request_id !== request_id ||
          candidate.binding.account !== account ||
          candidate.binding.universe !== universe
        )
          throw Error('Binding mismatch')
        this.protocol = candidate.protocol
        const b = candidate.binding,
          confirmation = this.platform.newId()
        try {
          const next = validate<BoundView>(
            'GameView',
            await this.port.view({ binding: b, request_id: confirmation }),
          )
          if (g !== this.generation) return
          if (
            next.protocol !== this.protocol ||
            !sameBinding(next.binding, b) ||
            next.request_id !== confirmation
          )
            throw Error('Confirmation mismatch')
          const settingsId = this.platform.newId()
          const settings = validate<BoundSettings>(
            'GameSettings',
            await this.port.settings({ binding: b, request_id: settingsId }),
          )
          if (g !== this.generation) return
          if (
            !sameBinding(settings.binding, b) ||
            settings.request_id !== settingsId ||
            settings.protocol !== this.protocol ||
            settings.profile_hash !== next.profile_hash ||
            settings.speed !== next.speed
          )
            throw Error('Settings mismatch')
          validateGameData(candidate, next, settings)
          await this.activate(candidate, next, settings, g)
          return
        } catch (e) {
          if (failure(e).code === 'EpochChanged') continue
          throw e
        }
      }
      throw Error('History changed during confirmation')
    } catch (e) {
      if (g === this.generation) {
        this.stale = true
        this.accessLost = [401, 403, 404].includes(failure(e).status ?? 0)
        this.message =
          failure(e).status === 401
            ? 'Your session expired. Please sign in.'
            : 'Unable to confirm this universe. Retry connection.'
      }
    }
  }
  async initialize(session: Session, snapshot: InitialGameSnapshot) {
    validateInitialGame(session, snapshot)
    this.invalidate()
    this.accessLost = false
    this.account = session.account
    this.universe = snapshot.candidate.binding.universe
    await this.activate(
      snapshot.candidate,
      snapshot.view,
      snapshot.settings,
      this.generation,
      snapshot.tutorial,
    )
  }
  private async activate(
    candidate: InitialGameSnapshot['candidate'],
    next: BoundView,
    settings: BoundSettings,
    g: number,
    tutorial?: InitialGameSnapshot['tutorial'],
  ) {
    const b = candidate.binding
    this.protocol = candidate.protocol
    if (g !== this.generation) return
    this.binding = structuredClone(b)
    this.sampleCommandClock(candidate.sampled_at)
    const restored: AttemptLedger = new Map()
    for (const envelope of this.platform.pendingCommands?.load<Envelope>(
      'GameEnvelope',
      bindingKey(b),
    ) ?? []) {
      if (
        envelope.protocol !== this.protocol ||
        !sameBinding(envelope.binding, b)
      )
        continue
      restored.set(
        attemptKey(b, envelope.command_id),
        validate<Attempt>('GameAttempt', {
          envelope,
          status: 'uncertain',
          receipt: null,
          reconciled: false,
        }),
      )
      this.resumedOrders.add(envelope.command_id)
    }
    this.attempts = restored
    this.restoredMutations = this.boundRecovery.restore(b)
    if (next.protocol === 4 && tutorial) this.tutorial.hydrate(tutorial, next)
    this.view = next
    this.settings = settings
    await this.reconcile()
    if (g === this.generation) {
      this.ready = true
      this.stale = false
    }
  }
  async recordLogin() {
    if (this.loginPresenceWork) return this.loginPresenceWork
    if (this.protocol !== 4 || !this.ready) return
    this.loginPresenceWork = this.recordPresence(
      'Login',
      this.view?.bodies[0]?.id ?? null,
    )
    return this.loginPresenceWork
  }
  private async problem(e: unknown, g: number, b: Binding) {
    if (!this.current(g, b)) return
    const f = failure(e)
    const now = this.platform.monotonicNowMs()
    const delay = Number.isFinite(f.retryAfterMs)
      ? Math.max(0, f.retryAfterMs!)
      : 0
    this.store.setState({
      now,
      retryAt: Math.max(this.retryAt, now + delay),
      ...(f.status === 429
        ? { rateLimited: true }
        : now >= this.retryAt
          ? { rateLimited: false }
          : {}),
    })
    if (f.code === 'EpochChanged') {
      this.message =
        'Universe history changed. Previous unresolved actions are indeterminate; enter new actions after confirmation.'
      await this.connect(this.account, this.universe)
    } else if (f.status === 401 || f.status === 403) {
      this.invalidate()
      this.accessLost = true
      this.message = 'Your session or membership is unavailable. Sign in again.'
    } else if (f.status === 404) {
      this.invalidate()
      this.accessLost = true
      this.message = 'Universe membership is unavailable.'
    } else {
      this.store.setState({
        stale: true,
        ...(e instanceof ContractDataError
          ? { incompatibleSchema: e.schemaName, connectionInterrupted: false }
          : {}),
      })
      this.delivery?.pending()
    }
  }
  private requestMinimum(minimum?: string) {
    if (
      minimum !== undefined &&
      (this.pendingMinimum === undefined ||
        BigInt(minimum) > BigInt(this.pendingMinimum))
    )
      this.pendingMinimum = minimum
  }
  async refresh(minimumViewerRevision?: string): Promise<void> {
    this.requestMinimum(minimumViewerRevision)
    const retirement = this.orderRefresh
    if (retirement) {
      // Each retirement needs a view requested afterwards. All readers for
      // that retirement share its request, even if an older one is in flight.
      retirement.work ??= this.refreshOnce(this.pendingMinimum).finally(() => {
        delete retirement.work
        if (this.pendingMinimum !== undefined) this.delivery?.pending()
      })
      return retirement.work
    }
    if (this.refreshWork) {
      // Revision invalidations coalesce; an explicit refresh may supersede a
      // stalled request and retains the existing request-generation fence.
      if (minimumViewerRevision !== undefined) return this.refreshWork
      try {
        await this.refreshOnce(this.pendingMinimum)
      } finally {
        if (this.pendingMinimum !== undefined) this.delivery?.pending()
      }
      return
    }
    const work = (async () => {
      let minimum: string | undefined
      do {
        minimum = this.pendingMinimum
        await this.refreshOnce(minimum)
      } while (
        this.pendingMinimum !== undefined &&
        this.pendingMinimum !== minimum &&
        !this.orderRefresh &&
        this.ready &&
        this.platform.monotonicNowMs() >= this.retryAt
      )
    })()
    this.refreshWork = work
    try {
      await work
    } finally {
      if (this.refreshWork === work) this.refreshWork = null
      if (this.pendingMinimum !== undefined) this.delivery?.pending()
    }
  }
  private async refreshOnce(minimumViewerRevision?: string, verifying = false) {
    if (this.platform.isVisible?.() === false || !this.platform.isOnline())
      return
    if (this.platform.monotonicNowMs() < this.retryAt) return
    const reconnectStartedAt = this.store.getState().connectionInterrupted
      ? this.platform.monotonicNowMs()
      : null
    const q = ++this.viewGeneration
    const retirement = this.orderRefresh
    const request = this.captureRequest()
    if (!request) return
    const { context, generation: g } = request
    const b = context.binding
    try {
      const next = validate<BoundView>(
        'GameView',
        await this.port.view(context, minimumViewerRevision),
      )
      if (
        !this.responseMatches(request, next) ||
        q !== this.viewGeneration ||
        next.protocol !== this.protocol
      )
        return
      if (
        this.view &&
        (BigInt(next.viewer_revision) < BigInt(this.view.viewer_revision) ||
          next.as_of_ms < this.view.as_of_ms)
      )
        return
      let settings = this.settings
      if (
        !settings ||
        settings.profile_hash !== next.profile_hash ||
        settings.speed !== next.speed
      ) {
        const settingsRequest = this.captureRequest()
        if (!settingsRequest) return
        settings = validate<BoundSettings>(
          'GameSettings',
          await this.port.settings(settingsRequest.context),
        )
        if (
          !this.responseMatches(settingsRequest, settings) ||
          q !== this.viewGeneration
        )
          return
        if (
          settings.protocol !== next.protocol ||
          settings.profile_hash !== next.profile_hash ||
          settings.speed !== next.speed
        )
          throw Error('Settings changed during refresh')
      }
      if (snapshotNeedsReceipt(this.store.getState(), next)) {
        await this.reconcilePending()
        if (
          !this.current(g, b) ||
          q !== this.viewGeneration ||
          snapshotNeedsReceipt(this.store.getState(), next)
        )
          return
      }
      // Receipt reconciliation above can itself retire a command.
      if (retirement !== this.orderRefresh || q !== this.viewGeneration) return
      const now = this.platform.monotonicNowMs()
      if (next.progress) this.sampleCommandClock(next.progress.sampled_at)
      this.orderRefresh = null
      this.store.setState({
        view: next,
        settings,
        receivedAt: now,
        now,
        ...(reconnectStartedAt !== null
          ? { deliveryResumedAt: reconnectStartedAt }
          : {}),
      })
      if (
        this.pendingMinimum !== undefined &&
        BigInt(next.viewer_revision) >= BigInt(this.pendingMinimum)
      ) {
        this.pendingMinimum = undefined
      }
      this.store.setState({
        stale: false,
        connectionInterrupted: false,
        incompatibleSchema: null,
        ...(now >= this.retryAt ? { rateLimited: false } : {}),
      })
      // Schedule against the accepted revision and connection state.
      this.delivery?.pending()
      await this.reconcile()
    } catch (e) {
      if (q !== this.viewGeneration || !this.current(g, b)) return
      await this.problem(e, g, b)
      if (
        q !== this.viewGeneration ||
        !this.current(g, b) ||
        !this.store.getState().foreground ||
        !this.platform.isOnline() ||
        e instanceof ContractDataError ||
        failure(e).status === 429 ||
        (failure(e).status === 503 &&
          failure(e).code === 'SessionRefreshing') ||
        failure(e).code === 'ClientUpdateRequired'
      )
        return
      if (
        verifying ||
        this.store.getState().connectionInterrupted ||
        this.platform.monotonicNowMs() < this.retryAt
      )
        // An explicit service Retry-After also establishes that a fresh read
        // cannot be obtained now; respect it instead of issuing a probe.
        this.store.setState({ connectionInterrupted: true })
      else {
        // One independent read distinguishes a failed request from inability
        // to refresh the empire. No alert timer and no command resubmission.
        await this.refreshOnce(minimumViewerRevision, true)
      }
    }
  }
  async quote(request: QuoteRequest): Promise<BoundQuote | null> {
    const q = ++this.quoteGeneration
    const pending = this.captureRequest()
    if (!pending) return null
    const captured = structuredClone(request)
    try {
      const result = validate<BoundQuote>(
        'GameQuote',
        await this.port.quote(pending.context, captured),
      )
      if (
        !this.responseMatches(pending, result) ||
        q !== this.quoteGeneration ||
        canonical(result.request) !== canonical(captured)
      )
        return null
      return result
    } catch (e) {
      if (!this.requestIsCurrent(pending) || q !== this.quoteGeneration)
        return null
      // Missing/inaccessible quote subjects and rule failures do not revoke membership.
      if (![400, 404, 422].includes(failure(e).status ?? 0))
        await this.problem(e, pending.generation, pending.context.binding)
      throw e
    }
  }
  async options(
    request: QuoteRequest,
  ): Promise<import('./commands').BoundProgressionOptions | null> {
    if (!this.port.progressionOptions || this.protocol < 3) return null
    const pending = this.captureRequest()
    if (!pending) return null
    const captured = structuredClone(request)
    const result = validate<import('./commands').BoundProgressionOptions>(
      'GameProgressionOptions',
      await this.port.progressionOptions(pending.context, captured),
    )
    if (
      !this.responseMatches(pending, result) ||
      canonical(result.request) !== canonical(captured)
    )
      return null
    return result
  }
  async recordPresence(
    cause: 'Login' | 'BodyVisit' | 'AccountVisit' | 'Logout',
    body: string | null,
  ) {
    if (
      this.protocol !== 4 ||
      !this.platform.isOnline() ||
      this.platform.isVisible?.() === false
    )
      return
    await this.send({
      type: 'World',
      action: {
        type: 'RecordForegroundPresence',
        body,
        cause,
        paired_command_id: null,
      },
    })
  }
  private afterFreshView(
    g: number,
    b: Binding,
    previous: BoundView | null,
  ): Promise<boolean> {
    const schedule = this.platform.scheduleOnce?.bind(this.platform)
    if (!schedule) return Promise.resolve(false)
    return new Promise((resolve) => {
      let unsubscribe: () => void = () => {},
        cancel: () => void = () => {},
        done = false
      const finish = (fresh: boolean) => {
        if (done) return
        done = true
        unsubscribe()
        cancel()
        resolve(fresh)
      }
      const inspect = () => {
        const current = this.current(g, b) && this.ready
        if (!current) finish(false)
        else if (this.view !== previous && !this.stale) finish(true)
      }
      unsubscribe = this.subscribe(inspect)
      cancel = schedule(() => finish(false), 10000)
      inspect()
    })
  }
  async socialQuery(
    query: import('../contracts').components['schemas']['SocialQuery'],
  ) {
    const pending = this.captureRequest()
    if (!pending || !this.port.socialQuery || this.protocol !== 4) return null
    try {
      const result = await this.port.socialQuery(pending.context, query)
      return this.responseMatches(pending, result) ? result : null
    } catch (error) {
      const f = failure(error)
      if (f.code === 'EpochChanged' || f.status === 401)
        await this.problem(error, pending.generation, pending.context.binding)
      throw error
    }
  }
  refreshMailbox() {
    if (this.mailboxRequest) return this.mailboxRequest
    const binding = this.binding
    const generation = this.generation
    if (!binding || this.protocol !== 4 || !this.ready) return Promise.resolve()
    const active = () => this.current(generation, binding) && this.ready
    const work = readStableMailbox(
      (query) => this.socialQuery(query),
      () => this.mailboxVersion,
      active,
      (mailbox) =>
        this.store.setState({
          mailbox: reconcileMailboxReads(mailbox, this.mailboxReads.values()),
        }),
    ).finally(() => {
      if (this.mailboxRequest === work) this.mailboxRequest = null
    })
    this.mailboxRequest = work
    return work
  }
  async socialCommand(
    request: import('./social').SocialRequest,
    restoring = false,
  ) {
    const pending = this.captureRequest()
    if (!pending || !this.port.socialCommand || this.protocol !== 4) return null
    try {
      const result = await this.boundRecovery.submit(
        'SocialCommandRequest',
        pending.context,
        request,
        this.commandNow,
        () => this.resampleClock(),
        ({ context, ...payload }) => this.port.socialCommand!(context, payload),
        restoring,
      )
      if (!result) return null
      if (!this.current(pending.generation, pending.context.binding))
        return null
      const action = request.action
      if (action.type === 'Read')
        this.mailboxReads.set(`message:${action.message}`, action)
      if (action.type === 'ReadCircular')
        this.mailboxReads.set(`circular:${action.circular}`, action)
      this.mailboxVersion++
      this.store.setState({
        mailbox: acceptMailboxAction(
          this.store.getState().mailbox,
          request.action,
        ),
      })
      return result
    } catch (error) {
      const f = failure(error)
      if (f.code === 'EpochChanged' || f.status === 401)
        await this.problem(error, pending.generation, pending.context.binding)
      throw error
    }
  }
  async allianceQuery(
    query: import('../contracts').components['schemas']['AllianceQuery'],
  ) {
    const pending = this.captureRequest()
    if (!pending || !this.port.allianceQuery || this.protocol !== 4) return null
    try {
      const result = await this.port.allianceQuery(pending.context, query)
      return this.responseMatches(pending, result) ? result : null
    } catch (error) {
      const f = failure(error)
      if (f.code === 'EpochChanged' || f.status === 401)
        await this.problem(error, pending.generation, pending.context.binding)
      throw error
    }
  }
  async allianceCommand(
    request: import('./alliances').AllianceRequest,
    restoring = false,
  ) {
    const pending = this.captureRequest()
    if (!pending || !this.port.allianceCommand || this.protocol !== 4)
      return null
    try {
      const result = await this.boundRecovery.submit(
        'AllianceCommandRequest',
        pending.context,
        request,
        this.commandNow,
        () => this.resampleClock(),
        ({ context, ...payload }) =>
          this.port.allianceCommand!(context, payload),
        restoring,
      )
      if (!result) return null
      return this.current(pending.generation, pending.context.binding)
        ? result
        : null
    } catch (error) {
      const f = failure(error)
      if (f.code === 'EpochChanged' || f.status === 401)
        await this.problem(error, pending.generation, pending.context.binding)
      throw error
    }
  }
  async rankings() {
    const pending = this.captureRequest()
    if (!pending || !this.port.rankings || this.protocol !== 4) return null
    try {
      const result = validate<import('./commands').Rankings>(
        'Rankings',
        await this.port.rankings(pending.context),
      )
      if (!this.responseMatches(pending, result)) return null
      if (
        new Set(result.players.map((p) => p.player)).size !==
        result.players.length
      )
        throw new Error('Duplicate ranking player')
      return result
    } catch (error) {
      const f = failure(error)
      if (f.code === 'EpochChanged' || [401, 403, 404].includes(f.status ?? 0))
        await this.problem(error, pending.generation, pending.context.binding)
      throw error
    }
  }
  private async readTutorial() {
    if (!this.port.world || this.protocol !== 4) return null
    const request = this.captureRequest()
    if (!request) return null
    try {
      const result = validate<import('./commands').BoundWorld>(
        'BoundWorld4',
        await this.port.world(request.context, { type: 'Tutorial' }),
      )
      return this.responseMatches(request, result) ? result : null
    } catch (error) {
      const f = failure(error)
      if (f.code === 'EpochChanged' || [401, 403, 404].includes(f.status ?? 0))
        await this.problem(error, request.generation, request.context.binding)
      throw error
    }
  }

  async world(query: import('./commands').WorldQuery) {
    if (!this.port.world || this.protocol !== 4) return null
    const pending = this.captureRequest()
    if (!pending) return null
    const { context, generation: g } = pending
    const b = context.binding
    const captured = structuredClone(query)
    for (let attempt = 0; attempt < 3; attempt++) {
      const previous = this.view
      try {
        if (
          captured.type === 'FleetQuote' ||
          captured.type === 'ResolveDestination' ||
          captured.type === 'ResolveMissionSite'
        )
          this.dispatchObservations.requestedFleetTerms()
        const result = validate<import('./commands').BoundWorld>(
          'BoundWorld4',
          await this.port.world(context, captured),
        )
        if (!this.responseMatches(pending, result)) return null
        if (
          captured.type === 'FleetQuote' ||
          captured.type === 'FleetEstimate'
        ) {
          if (!('intent' in result.data) || !('mission' in result.data.intent))
            return null
          const normalize = (
            intent: import('../contracts').components['schemas']['FleetIntent4'],
          ) => ({
            ...intent,
            ships: [...intent.ships].sort((a, b) =>
              `${a.owner}:${a.ship_type}` < `${b.owner}:${b.ship_type}`
                ? -1
                : `${a.owner}:${a.ship_type}` > `${b.owner}:${b.ship_type}`
                  ? 1
                  : 0,
            ),
          })
          const fill =
            captured.type === 'FleetQuote' && captured.intent.cargo_fill
          if (fill && !matchesCargoInstruction(fill, result.data.intent.cargo))
            return null
          const expected = fill
            ? { ...captured.intent, cargo: result.data.intent.cargo }
            : captured.intent
          if (
            canonical(normalize(expected)) !==
              canonical(normalize(result.data.intent)) ||
            result.data.profile_hash !== this.view?.profile_hash
          )
            return null
        }
        if (
          captured.type === 'MissileQuote' &&
          (!('interceptor_body' in result.data) ||
            canonical(captured.intent) !== canonical(result.data.intent) ||
            result.data.profile_hash !== this.view?.profile_hash)
        )
          return null
        if (
          captured.type === 'JumpQuote' &&
          (!('cooldown_ms' in result.data) ||
            canonical(captured.intent) !== canonical(result.data.intent) ||
            result.data.profile_hash !== this.view?.profile_hash)
        )
          return null
        if (
          captured.type === 'DepotSupplyQuote' &&
          (!('extension_ms' in result.data) ||
            canonical(captured.intent) !== canonical(result.data.intent) ||
            result.data.profile_hash !== this.view?.profile_hash)
        )
          return null
        return result.data
      } catch (error) {
        if (!this.current(g, b)) return null
        if (failure(error).status !== 503 || attempt === 2) throw error
        await this.problem(error, g, b)
        // Older replicas may still refuse a read during catch-up. Reconcile
        // explicitly; healthy clients no longer have a two-second poller.
        const refreshed = this.afterFreshView(g, b, previous)
        void this.refresh()
        if (!(await refreshed)) {
          if (!this.current(g, b)) return null
          throw error
        }
      }
    }
    return null
  }
  async simulate(
    inputs: import('../contracts').components['schemas']['SimulationInputs'],
  ) {
    if (!this.port.simulate || this.protocol !== 4)
      throw new Error('Simulation is unavailable. Reload and try again.')
    const pending = this.captureRequest()
    if (!pending) throw new Error('Reconnect before simulating.')
    const result = validate<
      import('../contracts').components['schemas']['SimulationResponse']
    >('SimulationResponse', await this.port.simulate(pending.context, inputs))
    if (
      !this.responseMatches(pending, result) ||
      result.profile_hash !== this.view?.profile_hash
    )
      throw new Error('The universe changed. Run the simulation again.')
    return result
  }
  refreshReportInbox(more = false) {
    return this.reports.refreshInbox(more)
  }
  async markReportsRead(reports: string[]) {
    if (!reports.length) return
    if (!this.port.markReportsRead || this.protocol !== 4)
      throw new Error('Report read changes are unavailable')
    const pending = this.captureRequest()
    if (!pending) throw new Error('Report context changed')
    const request = validate<
      import('../contracts').components['schemas']['ReportsReadRequest']
    >('ReportsReadRequest', {
      context: pending.context,
      reports: [...new Set(reports)],
    })
    const result = validate<
      import('../contracts').components['schemas']['ReportsReadResult']
    >(
      'ReportsReadResult',
      await this.port.markReportsRead(request.context, request.reports),
    )
    if (!this.ready || !this.responseMatches(pending, result))
      throw new Error('Report context changed')
    const returned = new Set(result.items.map((item) => item.id))
    if (
      returned.size !== request.reports.length ||
      request.reports.some((id) => !returned.has(id)) ||
      result.items.some((item) => !item.read)
    )
      throw new Error('Incomplete report read confirmation')
    this.store.setState({
      reportHeaders: mergeReportHeaders(
        this.store.getState().reportHeaders,
        result.items,
        result.viewer_revision,
      ),
    })
    // The database has committed. Refresh counts and filtered list membership;
    // a failed background refresh must not turn that success into a failed write.
    void this.refresh(result.viewer_revision).catch(() => {})
  }
  async reportPage(cursor: string | null = null, includeHidden = false) {
    const binding = this.binding
    const generation = this.generation
    const result = await this.readReportPage(cursor, includeHidden)
    if (!result || !binding || !this.current(generation, binding)) return null
    this.store.setState({
      reportHeaders: mergeReportHeaders(
        this.store.getState().reportHeaders,
        result.data.items,
        result.viewer_revision,
      ),
    })
    return result.data
  }
  private async readReportPage(
    cursor: string | null = null,
    includeHidden = false,
    query?: import('./report-query').ReportQuery,
  ) {
    if (!this.port.reports || this.protocol !== 4) return null
    const pending = this.captureRequest()
    if (!pending) return null
    const result = validate<import('./commands').BoundReports>(
      'BoundReports4',
      await this.port.reports(pending.context, cursor, includeHidden, query),
    )
    return this.responseMatches(pending, result) ? result : null
  }
  async latestEspionage(target: string) {
    const result = await this.readReportPage(null, true, {
      kind: 'Espionage',
      limit: 1,
      filter: { target_body: target, sort: 'newest' },
    })
    if (!result) throw Error('Observation unavailable')
    return result.data.items[0] ?? null
  }
  reportDetail(id: string, retry = false) {
    return this.reports.detail(id, retry)
  }
  private async readReportDetail(id: string) {
    if (!this.port.report || this.protocol !== 4) return null
    const pending = this.captureRequest()
    if (!pending) return null
    const result = validate<import('./commands').BoundReport>(
      'BoundReport4',
      await this.port.report(pending.context, id),
    )
    return this.responseMatches(pending, result) ? result : null
  }
  async send(
    input: Command,
    proposal?: SubmittedQuote,
    registrationOrDispatch?:
      | ((key: string) => void)
      | {
          clickedAt: number
          coordinates: import('../contracts').components['schemas']['Coordinates']
        },
    dispatchContext?: {
      clickedAt: number
      coordinates: import('../contracts').components['schemas']['Coordinates']
    },
  ): Promise<string | undefined> {
    const onRegistered =
      typeof registrationOrDispatch === 'function'
        ? registrationOrDispatch
        : undefined
    const dispatch =
      typeof registrationOrDispatch === 'function'
        ? dispatchContext
        : registrationOrDispatch
    const b = this.binding,
      g = this.generation
    const reconnect = 'Connect before confirming an action.'
    if (!b || !this.ready) {
      this.message = reconnect
      return
    }
    const canContinue = () => {
      if (!this.current(g, b)) return false
      if (this.platform.isOnline()) return true
      this.message = reconnect
      return false
    }
    // Capture the complete confirmed intent before any async prerequisite.
    const command = structuredClone(input),
      quote = structuredClone(proposal)
    for (;;) {
      if (!canContinue()) return
      this.tick()
      if (this.platform.monotonicNowMs() < this.retryAt) {
        this.explainUnsentDuringRecovery(command)
        return
      }
      if (this.clockNeedsSample) {
        try {
          await this.resampleClock()
        } catch (error) {
          if (canContinue()) await this.problem(error, g, b)
          return
        }
      } else if (this.orderRefresh) {
        const retirement: OrderRefresh = this.orderRefresh
        await this.refresh()
        if (!canContinue()) return
        if (this.orderRefresh === retirement) {
          this.message = 'Refresh your empire before confirming this action.'
          return
        }
      } else break
    }
    this.message = ''
    const state = this.store.getState()
    if (pendingCommand(state, command)) return
    if (quote && (!state.view || !matchesQuote(command, quote, state.view))) {
      this.message = 'This quote no longer matches the action. Review it again.'
      return
    }
    const parent = commandParent(state, command)
    if (parent && !acceptedEntityReference(state, parent)) return
    const intent: SubmittedIntent = {
      quote,
      submittedAt: Math.floor(currentServerTime(state)),
      ...(dispatch ? { dispatchCoordinates: dispatch.coordinates } : {}),
      ...(parent ? { dependsOn: parent.envelope.command_id } : {}),
      baseRevision: state.view?.viewer_revision ?? '0',
    }
    if (quote && !canSubmitQuote(state, command, quote)) {
      this.message =
        'Resources, ships or fleet slots are no longer available. Review the action again.'
      return
    }
    if (this.attempts.size >= 128) {
      this.message =
        'Resolve pending actions or dismiss presented outcomes before creating more.'
      return
    }
    const commandId = this.mintCommandId()
    const origin =
      commandBody(command, state.view) ??
      (parent ? commandBody(parent.envelope.command, state.view) : null) ??
      null
    const presence =
      this.protocol === 4
        ? command.type === 'World' &&
          command.action.type === 'RecordForegroundPresence'
          ? { presence: null }
          : {
              presence: {
                protocol: 4,
                binding: b,
                command_id: presenceCommandId(commandId),
                command: {
                  type: 'World',
                  action: {
                    type: 'RecordForegroundPresence',
                    body: origin,
                    cause: 'GameplayGesture',
                    paired_command_id: commandId,
                  },
                },
              },
            }
        : {}
    const envelope = validate<import('./commands').Envelope>(
      'GameEnvelope',
      structuredClone({
        protocol: this.protocol,
        binding: b,
        command_id: commandId,
        command,
        ...presence,
      }),
    )
    try {
      this.platform.pendingCommands?.save(
        'GameEnvelope',
        bindingKey(b),
        envelope,
      )
    } catch {
      this.message =
        'This order could not be saved for retry. Allow browser storage and try again.'
      return
    }
    const a = validate<Attempt>('GameAttempt', {
        envelope,
        status: 'submitting',
        receipt: null,
        reconciled: false,
      }),
      key = attemptKey(b, envelope.command_id)
    this.store.setState({
      attempts: new Map(this.attempts).set(key, a),
      intents: new Map(state.intents).set(key, structuredClone(intent)),
    })
    if (!this.current(g, b)) return
    onRegistered?.(key)
    if (!this.current(g, b)) return
    if (dispatch)
      this.dispatchObservations.start(
        commandId,
        'send_started',
        dispatch.clickedAt,
      )
    if (!(await this.deliver(a, g, true))) return
    return commandId
  }
  private async forgetUnsent(a: Attempt, g: number) {
    if (!this.current(g, a.envelope.binding)) return false
    const key = attemptKey(a.envelope.binding, a.envelope.command_id)
    const current = this.attempts.get(key)
    // A receipt is stronger evidence than a conflicting transport response.
    if (!current || current.receipt || terminal(current)) return false
    this.forgetEnvelope(a)
    this.dispatchObservations.mark(a.envelope.command_id, 'not_admitted')
    this.removeAttempt(key)
    return true
  }
  private explainUnsentDuringRecovery(command: Command) {
    if (
      !this.store.getState().rateLimited &&
      (command.type !== 'World' ||
        command.action.type !== 'RecordForegroundPresence')
    )
      this.message = 'This action was not sent. Please try again shortly.'
  }
  private async deliver(a: Attempt, g: number, firstDelivery = false) {
    // Respect an active cooldown before submitting an order.
    // A brand-new order has not reached the server and must not be queued.
    if (this.platform.monotonicNowMs() < this.retryAt) {
      if (firstDelivery && (await this.forgetUnsent(a, g))) {
        this.explainUnsentDuringRecovery(a.envelope.command)
        return false
      }
      await this.uncertain(a, g)
      return true
    }
    try {
      await this.receive(
        a,
        g,
        await this.port.submit(structuredClone(a.envelope)),
        firstDelivery,
        a.envelope.command.type === 'World' &&
          a.envelope.command.action.type === 'LaunchFleet',
      )
    } catch (e) {
      const rejected = failure(e)
      if (futureCommand(e)) {
        await this.deferGameOrder(a, g, true)
        return true
      }
      const closed = identityProblem(e)
      if (closed) {
        this.retireOrder(a, g, closed)
        return false
      }
      if (
        rejected.status === 422 &&
        rejected.code === 'GameRejected' &&
        rejected.message === 'ReauthenticationRequired' &&
        a.envelope.command.type === 'World' &&
        (a.envelope.command.action.type === 'RequestEmpireDeletion' ||
          a.envelope.command.action.type === 'CancelEmpireDeletion')
      ) {
        // The named gate rejects this submission before admission. Only a first
        // delivery is safe to forget: an earlier uncertain request may still commit.
        this.message =
          'Sign out and sign in again, then retry this action within five minutes.'
        if (firstDelivery && (await this.forgetUnsent(a, g))) return false
        await this.uncertain(a, g)
      } else if (
        rejected.status === 503 &&
        rejected.code === 'SessionRefreshing'
      ) {
        // Authentication refused this request before command admission. A
        // previous uncertain send still needs its original identity.
        await this.problem(e, g, a.envelope.binding)
        if (firstDelivery && (await this.forgetUnsent(a, g))) {
          const command = a.envelope.command
          if (
            command.type !== 'World' ||
            command.action.type !== 'RecordForegroundPresence'
          )
            this.message =
              'Your session is refreshing. This action was not sent. Try again.'
          return false
        }
        await this.uncertain(a, g)
      } else if (failure(e).status === 429) {
        // Apply the cooldown before clearing the rejected order.
        await this.problem(e, g, a.envelope.binding)
        if (firstDelivery && (await this.forgetUnsent(a, g))) return false
        await this.uncertain(a, g)
      } else {
        await this.uncertain(a, g)
        await this.problem(e, g, a.envelope.binding)
      }
    }
    return true
  }
  private clearClockWait(id: string) {
    this.deferredUntil.delete(id)
    if (
      !this.deferredUntil.size &&
      this.message === identityProblem({ code: 'COMMAND_IN_FUTURE' })
    )
      this.message = ''
  }
  private deferFuture(id: string) {
    this.deferredUntil.set(
      id,
      this.platform.monotonicNowMs() + futureCheckDelay(id, this.commandNow),
    )
  }
  private async deferGameOrder(a: Attempt, g: number, sampleClock: boolean) {
    const { binding, command_id } = a.envelope
    if (!this.current(g, binding)) return
    this.resumedOrders.add(command_id)
    this.deferFuture(command_id)
    await this.uncertain(a, g)
    if (sampleClock) {
      this.needsClockRefresh = true
      try {
        await this.resampleClock()
      } catch (error) {
        await this.problem(error, g, binding)
        return
      }
      if (!this.current(g, binding) || !this.resumedOrders.has(command_id))
        return
      this.deferFuture(command_id)
    }
    this.message = identityProblem({ code: 'COMMAND_IN_FUTURE' })!
  }
  private forgetEnvelope(a: Attempt) {
    this.resumedOrders.delete(a.envelope.command_id)
    this.deferredUntil.delete(a.envelope.command_id)
    this.platform.pendingCommands?.remove(
      'GameEnvelope',
      bindingKey(a.envelope.binding),
      a.envelope.command_id,
    )
  }
  private retireOrder(
    a: Attempt,
    g: number,
    message: string,
    missingReceipt = false,
  ) {
    if (!this.current(g, a.envelope.binding)) return
    const key = attemptKey(a.envelope.binding, a.envelope.command_id)
    const current = this.attempts.get(key)
    if (
      !current ||
      (current.receipt &&
        !(missingReceipt && current === a && !terminal(current)))
    )
      return
    this.orderRefresh = {}
    this.viewGeneration++
    this.forgetEnvelope(a)
    this.removeAttempt(key)
    this.stale = true
    this.message = message
    // A refresh can itself be reconciling this receipt. Queue a snapshot without
    // waiting on our own recovery promise.
    void this.refresh()
  }
  private async uncertain(a: Attempt, g: number) {
    if (!this.current(g, a.envelope.binding)) return
    const key = attemptKey(a.envelope.binding, a.envelope.command_id),
      current = this.attempts.get(key)
    if (!current || terminal(current) || current.receipt?.status === 'Pending')
      return
    const next = validate<Attempt>('GameAttempt', {
      ...current,
      status: 'uncertain',
    })
    this.dispatchObservations.mark(a.envelope.command_id, 'uncertain')
    this.saveAttempt(key, next)
    this.delivery?.pending()
  }
  private async receive(
    a: Attempt,
    g: number,
    raw: BoundReceipt,
    fromFirstSubmit = false,
    deferSnapshot = false,
  ) {
    const r = validate<BoundReceipt>('GameReceipt', raw),
      b = a.envelope.binding
    if (
      !this.current(g, b) ||
      !sameBinding(r.binding, b) ||
      r.command_id !== a.envelope.command_id ||
      r.protocol !== a.envelope.protocol
    )
      return
    if (fromFirstSubmit && r.status !== 'Rejected')
      this.dispatchObservations.mark(r.command_id, 'accepted')
    if (r.status === 'Committed')
      this.dispatchObservations.mark(r.command_id, 'outcome_received')
    if (r.status === 'Rejected')
      this.dispatchObservations.mark(r.command_id, 'rejected')
    const key = attemptKey(b, r.command_id),
      current = this.attempts.get(key)
    if (!current || terminal(current)) return
    const previousHeaders = this.store.getState().reportHeaders
    const reportHeaders = acceptReportVisibility(previousHeaders, current, r)
    const next = validate<Attempt>('GameAttempt', {
      ...current,
      receipt: r,
      status:
        r.status === 'Pending'
          ? 'pending'
          : r.status === 'Committed'
            ? 'committed'
            : 'rejected',
      reconciled: r.status === 'Rejected' || reportHeaders !== previousHeaders,
    })
    this.store.setState({
      attempts: new Map(this.attempts).set(key, next),
      reportHeaders,
    })
    this.clearClockWait(r.command_id)
    this.resumedOrders.delete(r.command_id)
    if (r.status !== 'Pending') this.forgetEnvelope(a)
    if (r.status === 'Pending') this.delivery?.pending()
    if (
      r.status === 'Rejected' &&
      this.current(g, b) &&
      this.store.getState().hiddenOrderNotices.has(key)
    )
      await this.pruneAttempts()
    if (r.status === 'Committed') {
      if (next.reconciled) await this.pruneAttempts()
      this.requestMinimum(r.minimum_viewer_revision)
      if (!this.refreshWork && !this.recoveryWork) {
        const refresh = this.refresh()
        if (!deferSnapshot) await refresh
      }
    }
  }
  /** Explicit player retry; receipt checks alone never authorize another send. */
  async retryOrder(command_id: string) {
    const binding = this.binding,
      generation = this.generation
    if (!binding) return
    const key = attemptKey(binding, command_id)
    const wasHidden = this.store.getState().hiddenOrderNotices.has(key)
    await this.recover(command_id, true)
    if (!wasHidden || !this.current(generation, binding)) return
    const state = this.store.getState()
    const attempt = state.attempts.get(key)
    if (
      attempt &&
      hasOrderNotice(attempt) &&
      state.hiddenOrderNotices.has(key)
    ) {
      const hiddenOrderNotices = new Set(state.hiddenOrderNotices)
      hiddenOrderNotices.delete(key)
      this.store.setState({ hiddenOrderNotices })
    }
  }
  async recover(command_id: string, retry = false) {
    const now = this.platform.monotonicNowMs()
    if (now < this.retryAt || now < (this.deferredUntil.get(command_id) ?? 0))
      return
    const b = this.binding,
      g = this.generation
    if (!b || !this.ready) return
    const a = this.attempts.get(attemptKey(b, command_id))
    if (!a || terminal(a)) return
    try {
      await this.receive(a, g, await this.port.receipt(b, command_id))
    } catch (e) {
      if (
        !this.current(g, b) ||
        terminal(this.attempts.get(attemptKey(b, command_id)) ?? a)
      )
        return
      if (futureCommand(e)) return this.deferGameOrder(a, g, true)
      const closed = identityProblem(e)
      if (closed) {
        this.retireOrder(a, g, closed, true)
      } else if (failure(e).status === 404) {
        // A missing receipt is not proof an in-flight request cannot still arrive.
        // Reconfirm the exact principal, identity window and protocol. Older
        // servers can still return 404 for an expired ID during the rollout.
        const resume = this.resumedOrders.has(command_id)
        if (
          !retry &&
          !resume &&
          withinCommandWindow(command_id, this.commandNow)
        )
          return
        try {
          const request_id = this.platform.newId()
          const candidate = validate<import('./commands').BindingCandidate>(
            'GameBindingCandidate',
            await this.port.currentBinding(b.universe, request_id),
          )
          if (!this.current(g, b) || candidate.request_id !== request_id) return
          if (!sameBinding(candidate.binding, b)) {
            await this.problem({ code: 'EpochChanged' }, g, b)
            return
          }
          this.sampleCommandClock(candidate.sampled_at)
          const code =
            candidate.protocol !== a.envelope.protocol
              ? 'COMMAND_ID_UNSUPPORTED'
              : commandWindowError(command_id, candidate.sampled_at)
          if (code === 'COMMAND_IN_FUTURE')
            return this.deferGameOrder(a, g, false)
          if (code) {
            this.retireOrder(a, g, identityProblem({ code })!, true)
            return
          }
          const current = this.attempts.get(attemptKey(b, command_id))
          if (!current || current.receipt || terminal(current)) return
          if (!retry && !this.resumedOrders.delete(command_id)) return
          this.resumedOrders.delete(command_id)
          await this.deliver(a, g)
        } catch (error) {
          await this.problem(error, g, b)
        }
      } else {
        await this.uncertain(a, g)
        await this.problem(e, g, b)
      }
    }
  }
  private async recoverBoundMutations(binding: Binding, generation: number) {
    for (const row of this.restoredMutations.slice()) {
      if (!this.current(generation, binding)) return
      const id = row.envelope.command_id
      if (this.platform.monotonicNowMs() < (this.deferredUntil.get(id) ?? 0))
        continue
      try {
        if (row.kind === 'SocialCommandRequest')
          await this.socialCommand(row.envelope, true)
        else await this.allianceCommand(row.envelope, true)
      } catch (error) {
        if (!this.current(generation, binding)) return
        if (futureCommand(error)) {
          this.deferFuture(id)
          this.message = identityProblem(error)!
          continue
        }
        if (!definiteMutationResponse(error)) {
          await this.problem(error, generation, binding)
          return
        }
        const message = identityProblem(error)
        if (unavailableCommandAccess(error)) this.message = unknownAccessMessage
        if (message) {
          this.message = message
          try {
            if (row.kind === 'SocialCommandRequest') await this.refreshMailbox()
            else await this.allianceQuery({ type: 'Mine' })
          } catch (refreshError) {
            if (!definiteMutationResponse(refreshError))
              await this.problem(refreshError, generation, binding)
          }
        }
      }
      this.clearClockWait(id)
      this.restoredMutations = this.restoredMutations.filter(
        (saved) => saved !== row,
      )
    }
  }
  async reconcilePending(): Promise<void> {
    if (this.recoveryWork) return this.recoveryWork
    const generation = this.generation
    const work = (async () => {
      const binding = this.binding
      if (
        this.restoredMutations.length &&
        binding &&
        this.platform.isOnline() &&
        this.platform.isVisible?.() !== false
      ) {
        await this.recoverBoundMutations(binding, generation)
      }
      for (const attempt of [...this.attempts.values()]) {
        if (
          generation !== this.generation ||
          this.platform.isVisible?.() === false ||
          !this.platform.isOnline() ||
          this.platform.monotonicNowMs() < this.retryAt
        )
          return
        if (!terminal(attempt) && attempt.status !== 'submitting')
          await this.recover(attempt.envelope.command_id, false)
      }
    })()
    this.recoveryWork = work
    try {
      await work
    } finally {
      if (this.recoveryWork === work) this.recoveryWork = null
    }
  }
  async onUpdate(raw: GameUpdate, deferSnapshot = false): Promise<void> {
    const update = validate<GameUpdate>('GameUpdate', raw)
    if (
      !this.binding ||
      !sameBinding(this.binding, update.binding) ||
      !this.ready
    )
      return
    if (update.event.type === 'Reset') {
      // Reconcile missed receipts and the view on the recovery path. Keep the
      // stream free to apply later outcomes while that HTTP work is pending.
      const recovery = this.poll()
      if (!deferSnapshot) await recovery
      return
    }
    if (update.event.type === 'Invalidate') {
      if (
        BigInt(update.event.minimum_viewer_revision) >
        BigInt(this.view?.viewer_revision ?? '0')
      ) {
        const refresh = this.refresh(update.event.minimum_viewer_revision)
        if (!deferSnapshot) await refresh
      }
      return
    }
    const receipt = update.event.receipt
    const attempt = this.attempts.get(
      attemptKey(update.binding, receipt.command_id),
    )
    if (attempt)
      await this.receive(
        attempt,
        this.generation,
        receipt,
        false,
        deferSnapshot,
      )
    if (
      receipt.status === 'Committed' &&
      BigInt(receipt.minimum_viewer_revision) >
        BigInt(this.view?.viewer_revision ?? '0')
    ) {
      const refresh = this.refresh(receipt.minimum_viewer_revision)
      if (!deferSnapshot) await refresh
    }
  }
  async poll() {
    if (this.platform.monotonicNowMs() < this.retryAt) return
    if (!this.ready) {
      await this.connect(this.account, this.universe)
      return
    }
    await this.reconcilePending()
    if (this.platform.monotonicNowMs() < this.retryAt) return
    await this.refresh()
  }
  private async reconcile() {
    const view = this.view,
      generation = this.generation,
      ledger = this.attempts
    if (!view) return
    for (const [key, a] of ledger) {
      if (!this.current(generation, view.binding)) return
      if (this.attempts.get(key) !== a) continue
      if (
        !a.reconciled &&
        a.receipt?.status === 'Committed' &&
        sameBinding(a.envelope.binding, view.binding) &&
        BigInt(view.viewer_revision) >=
          BigInt(a.receipt.minimum_viewer_revision)
      ) {
        const next = { ...a, reconciled: true }
        this.saveAttempt(key, next)
        if (
          next.envelope.command.type === 'World' &&
          next.envelope.command.action.type === 'RecordForegroundPresence'
        ) {
          if (this.current(generation, view.binding)) this.removeAttempt(key)
        }
      }
    }
    if (this.current(generation, view.binding)) await this.pruneAttempts()
  }
  private async pruneAttempts() {
    for (const [key, attempt] of supersededReportFailures(this.attempts)) {
      if (this.attempts.get(key) === attempt) this.removeAttempt(key)
    }
    const state = this.store.getState()
    const hiddenRejections = [...state.attempts].filter(
      ([key, attempt]) =>
        attempt.status === 'rejected' && state.hiddenOrderNotices.has(key),
    )
    const parents = new Set(
      [...state.intents]
        .filter(([key]) => !state.attempts.get(key)?.reconciled)
        .map(([, intent]) => intent.dependsOn),
    )
    const successes = [...state.attempts].filter(
      ([, attempt]) => attempt.status === 'committed' && attempt.reconciled,
    )
    // Keep recent outcomes for feature feedback, and keep rejected parents
    // while an unresolved child still needs the result.
    const history = [
      ...hiddenRejections
        .slice(0, -8)
        .filter(([, attempt]) => !parents.has(attempt.envelope.command_id)),
      ...successes.slice(0, -8),
    ]
    for (const [key, attempt] of history) {
      if (this.attempts.get(key) !== attempt) continue
      this.removeAttempt(key)
    }
  }
  async dismiss(command_id: string) {
    const b = this.binding
    if (!b) return
    const key = attemptKey(b, command_id),
      a = this.attempts.get(key)
    if (!a || !terminal(a) || !a.reconciled) return
    this.removeAttempt(key)
  }
}
