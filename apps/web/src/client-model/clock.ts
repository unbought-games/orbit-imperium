/** Presentation only: logical completion always comes from a validated server snapshot. */
export function remaining(
  deadline: number,
  sample: number,
  receivedAt: number,
  monotonicNow: number,
): number | null {
  const left = deadline - (sample + Math.max(0, monotonicNow - receivedAt))
  return left <= 0 ? null : Math.ceil(left / 1000)
}

export function formatRemaining(seconds: number | null): string {
  return seconds === null
    ? 'Awaiting confirmation'
    : [
        seconds >= 3600 ? `${Math.floor(seconds / 3600)}h` : '',
        seconds >= 60 ? `${Math.floor(seconds / 60) % 60}m` : '',
        `${seconds % 60}s`,
      ]
        .filter(Boolean)
        .join(' ')
}
