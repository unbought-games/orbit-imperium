/** Keep the countdown prominent, adding only states that need attention. */
export function workSummaryTiming(status: string, countdown: string) {
  return status === 'In progress' || status === countdown
    ? countdown
    : `${countdown} · ${status}`
}
