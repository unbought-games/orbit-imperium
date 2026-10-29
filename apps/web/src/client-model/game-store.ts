import type { SocialMailbox } from './social-mailbox'
import type { components } from '../contracts'
import { createStore } from 'zustand/vanilla'
import type {
  AttemptLedger,
  Binding,
  BoundSettings,
  BoundView,
} from './commands'
import type { ReportHeaders, ReportPage } from './report-state'
import type { SubmittedIntent } from './game-projection'

export type GameState = {
  binding: Binding | null
  view: BoundView | null
  settings: BoundSettings | null
  reportShares?: Record<
    string,
    Omit<components['schemas']['ReportShareStatus'], 'header'>
  >
  reportInbox: ReportPage | null
  mailbox: SocialMailbox | null
  reportHeaders: ReportHeaders
  attempts: AttemptLedger
  intents: Map<string, SubmittedIntent>
  receivedAt: number
  now: number
  message: string
  stale: boolean
  ready: boolean
  accessLost: boolean
  retryAt: number
  rateLimited: boolean
  connectionInterrupted: boolean
}

// One store per session/coordinator; never share account state across sessions.
export function createGameStore() {
  return createStore<GameState>()(() => ({
    binding: null,
    view: null,
    settings: null,
    reportInbox: null,
    mailbox: null,
    reportHeaders: new Map(),
    attempts: new Map(),
    intents: new Map(),
    receivedAt: 0,
    now: 0,
    message: '',
    stale: false,
    ready: false,
    accessLost: false,
    retryAt: 0,
    rateLimited: false,
    connectionInterrupted: false,
  }))
}
