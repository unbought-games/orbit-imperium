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
  type AttemptStorage,
  type Binding,
  type BoundQuote,
  type BoundReceipt,
  type BoundView,
  type BoundSettings,
  type ClientPlatform,
  type Command,
  type GamePort,
  type GameUpdate,
  type GameUpdatesPort,
  type QuoteRequest,
  type QueryContext,
  attemptKey,
  canonical,
  sameBinding,
  terminal,
} from './commands'
import { validate } from './schema'
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
type Failure = { status?: number; code?: string; retryAfterMs?: number }
const failure = (e: unknown): Failure => (e && typeof e === 'object' ? e : {})
export class Coordinator {
  private mailboxReads = new Map<string, import('./social').SocialAction>()
  private mailboxVersion = 0
  private mailboxRequest: Promise<void> | null = null
  readonly store = createGameStore()
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
    const attempts = new Map(this.attempts)
    const intents = new Map(this.store.getState().intents)
    attempts.delete(key)
    intents.delete(key)
    this.store.setState({ attempts, intents })
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
  get retryAfterMs() {
    return this.store.getState().retryAfterMs
  }
  private set retryAfterMs(retryAfterMs: GameState['retryAfterMs']) {
    this.store.setState({ retryAfterMs })
  }
  private delivery: DeliveryController | null = null
  private refreshWork: Promise<void> | null = null
  private recoveryWork: Promise<void> | null = null
  private pendingMinimum: string | undefined
  private retryAt = 0
  private generation = 0
  private viewGeneration = 0
  private quoteGeneration = 0
  private account = ''
  private protocol: 2 | 3 | 4 = 2
  private loginPresenceWork: Promise<void> | null = null
  private universe = ''
  private writes = new Map<string, Promise<void>>()
  constructor(
    private port: GamePort,
    private storage: AttemptStorage,
    private platform: ClientPlatform,
    private restoreSession = true,
    private updates?: GameUpdatesPort,
  ) {}
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
      onUpdate: (update) => this.onUpdate(update),
      reconcile: () => this.poll(),
      hasPending: () =>
        [...this.attempts.values()].some(
          (attempt) => !terminal(attempt) && attempt.status !== 'submitting',
        ),
      needsSnapshot: () => this.pendingMinimum !== undefined,
      nextWorkDelay: () => nextWorkDelay(this.store.getState()),
      isCurrent: () => this.ready && this.current(generation, binding),
    })
    this.delivery = delivery
    return () => {
      delivery.stop()
      if (this.delivery === delivery) this.delivery = null
    }
  }
  resumeDelivery() {
    this.delivery?.wake()
  }
  tick() {
    this.store.setState({ now: this.platform.monotonicNowMs() })
  }
  dismissMessage() {
    this.message = ''
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
  private persist(a: Attempt) {
    const key = attemptKey(a.envelope.binding, a.envelope.command_id)
    const record = {
      ...a,
      submitted_intent: this.store.getState().intents.get(key),
    }
    const write = (this.writes.get(key) ?? Promise.resolve())
      .catch(() => {})
      .then(() => this.storage.put(structuredClone(record)))
    this.writes.set(key, write)
    return write
  }
  invalidate() {
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
      binding: null,
      view: null,
      settings: null,
      reportInbox: null,
      mailbox: null,
      reportHeaders: new Map(),
      attempts: new Map(),
      intents: new Map(),
    })
  }
  async logout() {
    const b = this.binding
    this.invalidate()
    await Promise.allSettled(this.writes.values())
    if (b) await this.storage.clear(b)
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
    )
  }
  private async activate(
    candidate: InitialGameSnapshot['candidate'],
    next: BoundView,
    settings: BoundSettings,
    g: number,
  ) {
    const b = candidate.binding
    this.protocol = candidate.protocol
    const restored = this.restoreSession ? await this.storage.load(b) : []
    if (g !== this.generation) return
    this.binding = structuredClone(b)
    this.view = next
    this.settings = settings
    const seen = new Set<string>()
    for (const raw of restored) {
      try {
        const { submitted_intent, ...record } = validate<Attempt>(
          'GameAttempt',
          structuredClone(raw),
        )
        const a = record as Attempt
        if (a.envelope.protocol !== this.protocol) continue
        const key = attemptKey(a.envelope.binding, a.envelope.command_id)
        if (
          !sameBinding(a.envelope.binding, b) ||
          seen.has(key) ||
          !this.validAttempt(a)
        )
          continue
        seen.add(key)
        if (!terminal(a) && a.receipt?.status !== 'Pending') {
          a.status = 'uncertain'
          a.receipt = null
          a.reconciled = false
        }
        this.saveAttempt(key, a)
        if (submitted_intent)
          this.store.setState({
            intents: new Map(this.store.getState().intents).set(
              key,
              submitted_intent,
            ),
          })
      } catch {
        /* Quarantined by omission: never send invalid persisted records. */
      }
    }
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
  private validAttempt(a: Attempt) {
    if (
      a.receipt &&
      (!sameBinding(a.receipt.binding, a.envelope.binding) ||
        a.receipt.command_id !== a.envelope.command_id ||
        a.receipt.protocol !== a.envelope.protocol)
    )
      return false
    if (a.status === 'committed') return a.receipt?.status === 'Committed'
    if (a.status === 'rejected')
      return a.receipt?.status === 'Rejected' && a.reconciled
    return !a.reconciled && (!a.receipt || a.receipt.status === 'Pending')
  }
  private async problem(e: unknown, g: number, b: Binding) {
    if (!this.current(g, b)) return
    const f = failure(e)
    this.retryAfterMs = Math.max(0, f.retryAfterMs ?? 0)
    this.retryAt = Math.max(
      this.retryAt,
      this.platform.monotonicNowMs() + this.retryAfterMs,
    )
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
    } else this.stale = true
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
  private async refreshOnce(minimumViewerRevision?: string) {
    if (this.platform.monotonicNowMs() < this.retryAt) return
    const q = ++this.viewGeneration
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
      const now = this.platform.monotonicNowMs()
      this.store.setState({ view: next, settings, receivedAt: now, now })
      this.delivery?.pending()
      if (
        this.pendingMinimum !== undefined &&
        BigInt(next.viewer_revision) >= BigInt(this.pendingMinimum)
      ) {
        this.pendingMinimum = undefined
      }
      this.stale = false
      await this.reconcile()
    } catch (e) {
      if (q === this.viewGeneration) await this.problem(e, g, b)
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
    if (this.protocol !== 4) return
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
  async socialCommand(request: import('./social').SocialRequest) {
    const pending = this.captureRequest()
    if (!pending || !this.port.socialCommand || this.protocol !== 4) return null
    try {
      const result = await this.port.socialCommand(pending.context, request)
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
  async allianceCommand(request: import('./alliances').AllianceRequest) {
    const pending = this.captureRequest()
    if (!pending || !this.port.allianceCommand || this.protocol !== 4)
      return null
    try {
      const result = await this.port.allianceCommand(pending.context, request)
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
        const result = validate<import('./commands').BoundWorld>(
          'BoundWorld4',
          await this.port.world(context, captured),
        )
        if (!this.responseMatches(pending, result)) return null
        if (
          captured.type === 'FleetQuote' ||
          captured.type === 'FleetEstimate'
        ) {
          if (!('intent' in result.data) || !('ships' in result.data.intent))
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
          if (
            canonical(normalize(captured.intent)) !==
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
  async reportPage(cursor: string | null = null, includeHidden = false) {
    if (!this.port.reports || this.protocol !== 4) return null
    const pending = this.captureRequest()
    if (!pending) return null
    const result = validate<import('./commands').BoundReports>(
      'BoundReports4',
      await this.port.reports(pending.context, cursor, includeHidden),
    )
    if (!this.responseMatches(pending, result)) return null
    this.store.setState({
      ...(cursor === null && !includeHidden
        ? {
            reportInbox: {
              ...result.data,
              items: result.data.items.map((header) => header.id),
            },
          }
        : {}),
      reportHeaders: mergeReportHeaders(
        this.store.getState().reportHeaders,
        result.data.items,
        result.viewer_revision,
      ),
    })
    return result.data
  }
  async reportDetail(id: string) {
    if (!this.port.report || this.protocol !== 4) return null
    const pending = this.captureRequest()
    if (!pending) return null
    const result = validate<import('./commands').BoundReport>(
      'BoundReport4',
      await this.port.report(pending.context, id),
    )
    if (!this.responseMatches(pending, result)) return null
    const { header } = result.data
    this.store.setState({
      reportHeaders: mergeReportHeaders(
        this.store.getState().reportHeaders,
        [header],
        result.viewer_revision,
      ),
    })
    return result.data
  }
  async send(command: Command, quote?: SubmittedQuote) {
    const b = this.binding,
      g = this.generation
    if (!b || !this.ready || !this.platform.isOnline()) {
      this.message = 'Connect before confirming an action.'
      return
    }
    this.message = ''
    this.tick()
    const state = this.store.getState()
    if (pendingCommand(state, command)) return
    if (quote && (!state.view || !matchesQuote(command, quote, state.view))) {
      this.message = 'This quote no longer matches the action. Review it again.'
      return
    }
    const parent = commandParent(state, command)
    if (parent && !acceptedEntityReference(state, parent)) return
    const intent: SubmittedIntent = {
      quote: quote ? structuredClone(quote) : undefined,
      submittedAt: Math.floor(currentServerTime(state)),
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
    const commandId = this.platform.newId()
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
                command_id: this.platform.newId(),
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
    validate('GameEnvelope', envelope)
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
    try {
      await this.persist(a)
    } catch {
      if (this.current(g, b)) {
        this.removeAttempt(key)
        this.message =
          'Unable to save action. Free local storage and try again.'
      }
      return
    }
    if (!this.current(g, b)) return
    await this.deliver(a, g)
    return commandId
  }
  private async deliver(a: Attempt, g: number) {
    try {
      await this.receive(
        a,
        g,
        await this.port.submit(structuredClone(a.envelope)),
      )
    } catch (e) {
      await this.uncertain(a, g)
      await this.problem(e, g, a.envelope.binding)
    }
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
    this.saveAttempt(key, next)
    try {
      await this.persist(next)
    } catch {
      this.message =
        'Unable to save latest status; the original action ID is retained.'
    }
    this.delivery?.pending()
  }
  private async receive(a: Attempt, g: number, raw: BoundReceipt) {
    const r = validate<BoundReceipt>('GameReceipt', raw),
      b = a.envelope.binding
    if (
      !this.current(g, b) ||
      !sameBinding(r.binding, b) ||
      r.command_id !== a.envelope.command_id ||
      r.protocol !== a.envelope.protocol
    )
      return
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
    await this.persist(next)
    if (r.status === 'Pending') this.delivery?.pending()
    if (r.status === 'Committed') {
      if (next.reconciled) await this.pruneSuccesses()
      this.requestMinimum(r.minimum_viewer_revision)
      if (!this.refreshWork && !this.recoveryWork) await this.refresh()
    }
  }
  async recover(command_id: string) {
    if (this.platform.monotonicNowMs() < this.retryAt) return
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
      if (failure(e).status === 404) {
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
  async reconcilePending(): Promise<void> {
    if (this.recoveryWork) return this.recoveryWork
    const generation = this.generation
    const work = (async () => {
      for (const attempt of [...this.attempts.values()]) {
        if (
          generation !== this.generation ||
          this.platform.monotonicNowMs() < this.retryAt
        )
          return
        if (!terminal(attempt) && attempt.status !== 'submitting')
          await this.recover(attempt.envelope.command_id)
      }
    })()
    this.recoveryWork = work
    try {
      await work
    } finally {
      if (this.recoveryWork === work) this.recoveryWork = null
    }
  }
  async onUpdate(raw: GameUpdate): Promise<void> {
    const update = validate<GameUpdate>('GameUpdate', raw)
    if (
      !this.binding ||
      !sameBinding(this.binding, update.binding) ||
      !this.ready
    )
      return
    if (update.event.type === 'Reset') {
      await this.reconcilePending()
      await this.refresh()
      return
    }
    if (update.event.type === 'Invalidate') {
      if (
        BigInt(update.event.minimum_viewer_revision) >
        BigInt(this.view?.viewer_revision ?? '0')
      )
        await this.refresh(update.event.minimum_viewer_revision)
      return
    }
    const receipt = update.event.receipt
    const attempt = this.attempts.get(
      attemptKey(update.binding, receipt.command_id),
    )
    if (attempt) await this.receive(attempt, this.generation, receipt)
    if (
      receipt.status === 'Committed' &&
      BigInt(receipt.minimum_viewer_revision) >
        BigInt(this.view?.viewer_revision ?? '0')
    )
      await this.refresh(receipt.minimum_viewer_revision)
  }
  async poll() {
    if (this.platform.monotonicNowMs() < this.retryAt) return
    this.retryAfterMs = 0
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
        await this.persist(next)
        if (
          next.envelope.command.type === 'World' &&
          next.envelope.command.action.type === 'RecordForegroundPresence'
        ) {
          await this.storage.remove(
            next.envelope.binding,
            next.envelope.command_id,
          )
          if (this.current(generation, view.binding)) this.removeAttempt(key)
        }
      }
    }
    if (this.current(generation, view.binding)) await this.pruneSuccesses()
  }
  private async pruneSuccesses() {
    for (const [key, attempt] of supersededReportFailures(this.attempts)) {
      try {
        // A failed status write must still allow removal of its older record.
        await this.writes.get(key)?.catch(() => {})
        await this.storage.remove(
          attempt.envelope.binding,
          attempt.envelope.command_id,
        )
      } catch {
        // Retain the confirming success until the older failure is durably
        // removed, so it cannot become the latest feedback after pruning.
        return
      }
      if (this.attempts.get(key) === attempt) this.removeAttempt(key)
      this.writes.delete(key)
    }
    const successes = [...this.attempts].filter(
      ([, attempt]) => attempt.status === 'committed' && attempt.reconciled,
    )
    for (const [key, attempt] of successes.slice(0, -8)) {
      this.removeAttempt(key)
      try {
        await this.writes.get(key)
        await this.storage.remove(
          attempt.envelope.binding,
          attempt.envelope.command_id,
        )
        this.writes.delete(key)
      } catch {
        // A retained durable success is harmless and is pruned again after restore.
      }
    }
  }
  async dismiss(command_id: string) {
    const b = this.binding
    if (!b) return
    const key = attemptKey(b, command_id),
      a = this.attempts.get(key)
    if (!a || !terminal(a) || !a.reconciled) return
    await this.storage.remove(b, command_id)
    this.removeAttempt(key)
  }
}
