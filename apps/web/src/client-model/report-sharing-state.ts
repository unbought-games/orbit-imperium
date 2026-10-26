import type { ShareStatus } from '../adapters/report-sharing'
import type { GameState } from './game-store'
import { mergeReportHeaders } from './report-state'

/** One response supplies the link and complete authoritative report header. */
export function acceptReportSharing(
  state: Pick<GameState, 'reportHeaders' | 'reportShares'>,
  scope: string,
  report: string,
  result: ShareStatus,
) {
  const { header, ...status } = result
  const known = state.reportHeaders.get(report)
  const previous = state.reportShares?.[scope]
  if (
    header.id !== report ||
    (known && BigInt(known.revision) > BigInt(status.viewer_revision)) ||
    (previous &&
      BigInt(previous.viewer_revision) > BigInt(status.viewer_revision))
  )
    return null
  return {
    reportHeaders: mergeReportHeaders(
      state.reportHeaders,
      [header],
      status.viewer_revision,
    ),
    reportShares: { ...state.reportShares, [scope]: status },
  }
}

/** A later report command/read invalidates cached sharing controls until checked. */
export function reportShareStatus(
  state: Pick<GameState, 'reportHeaders' | 'reportShares'>,
  scope: string,
  report: string,
) {
  const status = state.reportShares?.[scope]
  const header = state.reportHeaders.get(report)
  return status &&
    header &&
    BigInt(status.viewer_revision) >= BigInt(header.revision)
    ? status
    : undefined
}
