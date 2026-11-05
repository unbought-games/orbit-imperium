const maxTimerDelay = 2_147_483_647

/** Browser timers cannot represent longer delays. Recheck wall time after each
 * bounded interval, including when the clock moves backward or the tab resumes. */
export function atDeadline(deadline: number, notify: () => void) {
  let timer: ReturnType<typeof setTimeout>
  const schedule = () => {
    timer = setTimeout(
      () => {
        if (Date.now() < deadline) schedule()
        else notify()
      },
      Math.max(0, Math.min(maxTimerDelay, deadline - Date.now())),
    )
  }
  schedule()
  return () => clearTimeout(timer)
}
