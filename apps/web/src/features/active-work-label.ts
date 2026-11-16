/** Labels describe observed operation state; passing a deadline never completes work. */
export function activeWorkLabel(
  kind: string,
  direction: string | undefined,
  status: string,
  secondsRemaining: number | null,
) {
  if (status !== 'In progress') return status
  if (secondsRemaining === null) return 'Awaiting confirmation'
  return kind === 'Research'
    ? 'Researching now'
    : direction === 'down'
      ? 'Tearing down'
      : 'Upgrading now'
}
