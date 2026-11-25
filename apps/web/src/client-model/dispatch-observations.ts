import type { ClientPlatform } from './commands'
import type { components } from '../contracts'

export type DispatchObservation = components['schemas']['DispatchObservation']
export type DispatchPhase = DispatchObservation['phase']

export class DispatchObservations {
  private readonly starts = new Map<
    string,
    { at: number; phases: Set<DispatchPhase> }
  >()
  private hiddenAt = Number.NEGATIVE_INFINITY
  suspend() {
    this.hiddenAt = this.platform.monotonicNowMs()
  }
  private reviewReadCount = 0
  private readonly reviewStarts = new Map<string, number>()
  requestedFleetTerms() {
    this.reviewReadCount++
  }
  constructor(
    private readonly platform: ClientPlatform,
    private readonly publish: (observation: DispatchObservation) => void,
  ) {}
  start(
    id: string,
    phase: 'review_started_warm' | 'review_started_cold' | 'send_started',
    at: number,
  ) {
    if (this.starts.size >= 512) {
      const oldest = this.starts.keys().next().value!
      this.starts.delete(oldest)
      this.reviewStarts.delete(oldest)
    }
    if (phase !== 'send_started')
      this.reviewStarts.set(id, this.reviewReadCount)
    this.starts.set(id, { at, phases: new Set() })
    this.mark(id, phase, at)
  }
  ready(id: string) {
    const start = this.starts.get(id)
    if (
      start &&
      !start.phases.has('review_ready_reused') &&
      !start.phases.has('review_ready_fetched')
    )
      this.mark(
        id,
        start.phases.has('review_started_warm') &&
          this.reviewStarts.get(id) === this.reviewReadCount
          ? 'review_ready_reused'
          : 'review_ready_fetched',
      )
  }
  mark(id: string, phase: DispatchPhase, at = this.platform.monotonicNowMs()) {
    const start = this.starts.get(id)
    if (!start || start.phases.has(phase)) return
    start.phases.add(phase)
    this.publish({
      id,
      phase,
      elapsed_ms: Math.min(86_400_000, Math.max(0, Math.ceil(at - start.at))),
      foreground:
        (this.platform.isVisible?.() ?? true) && start.at > this.hiddenAt,
    })
  }
  clear() {
    this.starts.clear()
    this.reviewStarts.clear()
  }
}
