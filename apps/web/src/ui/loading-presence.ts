/** Temporal presentation state; request/data state remains with the caller. */
export class LoadingPresence {
  private shownAt: number | null = null
  private timer?: ReturnType<typeof setTimeout>
  private listeners = new Set<() => void>()

  constructor(
    private readonly delay = 200,
    private readonly minimum = 500,
  ) {}

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  readonly snapshot = () => this.shownAt !== null

  update(loading: boolean) {
    this.cancel()
    if (loading) {
      if (this.shownAt === null)
        this.timer = setTimeout(() => this.show(), this.delay)
    } else if (this.shownAt !== null) {
      const remaining = this.minimum - (performance.now() - this.shownAt)
      if (remaining > 0) this.timer = setTimeout(() => this.hide(), remaining)
      else this.hide()
    }
  }

  cancel() {
    clearTimeout(this.timer)
    this.timer = undefined
  }

  private show() {
    this.shownAt = performance.now()
    this.listeners.forEach((listener) => listener())
  }

  private hide() {
    this.shownAt = null
    this.listeners.forEach((listener) => listener())
  }
}
