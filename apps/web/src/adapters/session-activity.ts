/** Only opening/returning to a visible page and real input count as activity. */
export function startSessionActivity(
  page: Document,
  browser: Window,
  renew: () => Promise<unknown>,
  now = Date.now,
) {
  let next = 0,
    running = false,
    stopped = false
  const activity = (event?: Event) => {
    if (event && !event.isTrusted) return
    if (stopped || running || page.visibilityState === 'hidden' || now() < next)
      return
    running = true
    next = now() + 60000
    void renew()
      .catch(() => {
        next = now() + 5000
      })
      .finally(() => {
        running = false
      })
  }
  const events = ['pointerdown', 'keydown', 'wheel', 'visibilitychange']
  for (const event of events)
    page.addEventListener(event, activity, { passive: true })
  browser.addEventListener('focus', activity)
  activity()
  return () => {
    stopped = true
    for (const event of events) page.removeEventListener(event, activity)
    browser.removeEventListener('focus', activity)
  }
}
