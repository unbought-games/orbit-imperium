// Each resource gets a cleanup attempt, even when a prior release/stop fails.
// Report every failure after all steps have run; never silently pass cleanup.
export async function cleanupAll(steps) {
  const errors = []
  for (const step of steps) {
    try {
      await step()
    } catch (error) {
      errors.push(error)
    }
  }
  if (errors.length)
    throw new AggregateError(errors, 'Acceptance cleanup failed')
}
