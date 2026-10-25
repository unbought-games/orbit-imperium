import type { components } from '../contracts'
type Schemas = components['schemas']
export type Binding = Schemas['Binding']
export type QueryContext = Schemas['QueryContext']
export type BindingCandidate = Schemas['GameBindingCandidate']
export type BoundSettings = Schemas['GameSettings']
export type BoundView = Schemas['GameView']
export type BoundQuote = Schemas['GameQuote']
export type BoundReceipt = Schemas['GameReceipt']
export type Envelope = Schemas['GameEnvelope']
export type Receipt = BoundReceipt
export type Quote = Schemas['Quote']
export type QuoteRequest = Schemas['QuoteRequest3']
export type Command = Schemas['Command4']
export type Attempt = Schemas['GameAttempt']
export type AttemptKey = string
export type AttemptLedger = Map<AttemptKey, Attempt>
export type BoundProgressionOptions = Schemas['GameProgressionOptions']
export type WorldQuery = Schemas['WorldQueryKind4']
export type BoundWorld = Schemas['BoundWorld4']
export type BoundReports = Schemas['BoundReports4']
export type BoundReport = Schemas['BoundReport4']
export type Rankings = Schemas['Rankings']
export interface GamePort {
  allianceQuery?(
    context: QueryContext,
    query: Schemas['AllianceQuery'],
  ): Promise<Schemas['AllianceView']>
  allianceCommand?(
    context: QueryContext,
    request: Omit<Schemas['AllianceCommandRequest'], 'context'>,
  ): Promise<Schemas['AllianceCommandResult']>
  simulate?(
    context: QueryContext,
    inputs: Schemas['SimulationInputs'],
  ): Promise<Schemas['SimulationResponse']>
  rankings?(context: QueryContext): Promise<Rankings>
  world?(context: QueryContext, query: WorldQuery): Promise<BoundWorld>
  reports?(
    context: QueryContext,
    cursor: string | null,
    includeHidden?: boolean,
  ): Promise<BoundReports>
  report?(context: QueryContext, id: string): Promise<BoundReport>

  progressionOptions?(
    context: QueryContext,
    request: QuoteRequest,
  ): Promise<BoundProgressionOptions>
  currentBinding(
    universe: string,
    request_id: string,
  ): Promise<BindingCandidate>
  settings(context: QueryContext): Promise<BoundSettings>
  view(
    context: QueryContext,
    minimumViewerRevision?: string,
  ): Promise<BoundView>
  quote(context: QueryContext, request: QuoteRequest): Promise<BoundQuote>
  submit(envelope: Envelope): Promise<BoundReceipt>
  receipt(binding: Binding, command_id: string): Promise<BoundReceipt>
}
export interface AttemptStorage {
  load(binding: Binding): Promise<Attempt[]>
  put(attempt: Attempt): Promise<void>
  remove(binding: Binding, command_id: string): Promise<void>
  clear(binding: Binding): Promise<void>
}
export interface ClientPlatform {
  random?(): number
  scheduleOnce?(callback: () => void, delayMs: number): () => void
  newId(): string
  monotonicNowMs(): number
  isOnline(): boolean
}
export const bindingKey = (b: Binding) =>
  JSON.stringify([b.account, b.player, b.universe, b.epoch])
export const attemptKey = (b: Binding, id: string) =>
  JSON.stringify([b.account, b.player, b.universe, b.epoch, id])
export const sameBinding = (a: Binding, b: Binding) =>
  bindingKey(a) === bindingKey(b)
export const terminal = (a: Attempt) =>
  a.status === 'committed' || a.status === 'rejected'
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`
  return JSON.stringify(value)
}

export type GameUpdate = Schemas['GameUpdate']
export interface GameUpdatesPort {
  subscribe(
    binding: Binding,
    after: string | null,
    options: {
      signal: AbortSignal
      onUpdate(update: GameUpdate): void | Promise<void>
      onDisconnect(): void
    },
  ): Promise<void>
}
