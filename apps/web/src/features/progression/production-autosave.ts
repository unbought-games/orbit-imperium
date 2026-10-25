import { createStore } from 'zustand/vanilla'
import type { components } from '../../contracts'
import type { Coordinator } from '../../client-model/coordinator'
import {
  canonical,
  sameBinding,
  type Command,
} from '../../client-model/commands'
import {
  activeAttempt,
  pendingCommand,
} from '../../client-model/game-projection'
import type { GameState } from '../../client-model/game-store'

type Settings = components['schemas']['ProductionDto']['settings']
type Edits = Partial<Settings>
type Flight = { edits: Edits; id?: string }
type State = { edits: Edits; flight: Flight | null; error: string | null }

export function confirmedProduction(model: Coordinator, body: string) {
  const view = model.store.getState().view
  return view && view.protocol !== 2
    ? view.progression.production.find((entry) => entry.body === body)
    : undefined
}

// Pending command inputs remain visible after reload even without a local edit
// or a legacy submitted_intent. They never replace confirmed economy totals.
export function productionControlSettings(
  game: GameState,
  body: string,
  edits: Edits,
) {
  const view = game.view
  if (!view || view.protocol === 2) return
  const production = view.progression.production.find(
    (entry) => entry.body === body,
  )
  if (!production) return
  let settings = production.settings
  for (const attempt of game.attempts.values()) {
    const command = attempt.envelope.command
    if (
      command.type === 'SetProduction' &&
      command.body === body &&
      sameBinding(attempt.envelope.binding, view.binding) &&
      activeAttempt(attempt, view)
    )
      settings = command.settings
  }
  return { ...settings, ...edits }
}

// Retain user edits across panel/body navigation, scoped to this session. The game
// store remains the only source of confirmed settings, revisions and economy.
export class ProductionAutosave {
  readonly store = createStore<State>(() => ({
    edits: {},
    flight: null,
    error: null,
  }))
  private scheduled = false
  private debounce: ReturnType<typeof setTimeout> | undefined
  private readonly binding: string
  private readonly unsubscribe: () => void

  constructor(
    private readonly model: Coordinator,
    private readonly body: string,
  ) {
    this.binding = canonical(model.store.getState().binding)
    this.unsubscribe = model.store.subscribe(() => this.schedule())
  }

  change = (key: keyof Settings, value: Settings[typeof key]) => {
    if (!confirmedProduction(this.model, this.body)?.editable.includes(key))
      return
    this.store.setState(({ edits }) => ({ edits: { ...edits, [key]: value } }))
    this.schedule()
  }

  // Edits live in the session queue immediately, including when navigation
  // unmounts the control before this trailing save runs.
  changeDeferred = (key: keyof Settings, value: Settings[typeof key]) => {
    clearTimeout(this.debounce)
    this.debounce = setTimeout(this.flush, 300)
    this.change(key, value)
  }

  flush = () => {
    clearTimeout(this.debounce)
    this.debounce = undefined
    this.schedule()
  }

  retry = async () => {
    // A rejection may mean another client changed the revision. Refresh first;
    // the next command merges only this user's edited fields into that snapshot.
    await this.model.refresh()
    if (this.model.store.getState().stale) return
    this.store.setState({ error: null })
    this.schedule()
  }

  private schedule() {
    if (this.scheduled) return
    this.scheduled = true
    queueMicrotask(() => {
      this.scheduled = false
      this.advance()
    })
  }

  private advance() {
    const game = this.model.store.getState()
    if (canonical(game.binding) !== this.binding) {
      clearTimeout(this.debounce)
      this.debounce = undefined
      this.unsubscribe()
      this.store.setState({ edits: {}, flight: null, error: null })
      return
    }
    const { flight, error } = this.store.getState()
    let { edits } = this.store.getState()
    if (flight) {
      if (!flight.id) return // The original delivery is still running.
      const attempt = [...game.attempts.values()].find(
        (entry) => entry.envelope.command_id === flight.id,
      )
      if (attempt?.status === 'rejected') {
        this.store.setState({
          flight: null,
          error:
            'Production changes were rejected. Your edits are retained. Retry to apply them to the latest settings.',
        })
        return
      }
      if (!attempt) {
        this.fail(
          'Unable to confirm production changes. Your edits are retained.',
        )
        return
      }
      if (!attempt.reconciled) return
      edits = { ...edits }
      for (const key of Object.keys(flight.edits) as (keyof Settings)[])
        if (edits[key] === flight.edits[key]) delete edits[key]
      this.store.setState({ edits, flight: null })
    }
    if (error || !game.ready || this.debounce !== undefined) return
    // Include restored/uncertain commands and committed receipts whose snapshot
    // has not arrived. Never send a second settings command against an old base.
    if (
      [...game.attempts.values()].some(
        (attempt) =>
          attempt.envelope.command.type === 'SetProduction' &&
          attempt.envelope.command.body === this.body &&
          !attempt.reconciled &&
          attempt.status !== 'rejected',
      )
    )
      return
    const production = confirmedProduction(this.model, this.body)
    if (!production) return
    const changes: Edits = {}
    for (const key of Object.keys(edits) as (keyof Settings)[])
      if (
        production.editable.includes(key) &&
        edits[key] !== production.settings[key]
      )
        changes[key] = edits[key]
    if (!Object.keys(changes).length) {
      if (Object.keys(edits).length) this.store.setState({ edits: {} })
      return
    }
    const command: Command = {
      type: 'SetProduction',
      body: this.body,
      settings: { ...production.settings, ...changes },
      expected_settings_revision: production.settings_revision,
    }
    // Restored commands without intents can fence all actions on this body.
    // Keep edits queued until the same admission guard used by send permits it.
    if (pendingCommand(game, command)) return
    const next: Flight = { edits: changes }
    this.store.setState({ edits: changes, flight: next })
    void this.model
      .send(command)
      .then((id) => {
        if (this.store.getState().flight !== next) return
        if (id) this.store.setState({ flight: { ...next, id } })
        else this.fail('')
        this.schedule()
      })
      .catch(() => this.fail('Unable to save production changes.'))
  }

  private fail(message: string) {
    this.store.setState({
      flight: null,
      error:
        message ||
        this.model.store.getState().message ||
        'Unable to save production changes. Your edits are retained.',
    })
  }
}

const sessions = new WeakMap<Coordinator, Map<string, ProductionAutosave>>()
export function productionAutosave(model: Coordinator, body: string) {
  let session = sessions.get(model)
  if (!session) sessions.set(model, (session = new Map()))
  const key = `${canonical(model.store.getState().binding)}:${body}`
  let autosave = session.get(key)
  if (!autosave)
    session.set(key, (autosave = new ProductionAutosave(model, body)))
  return autosave
}
