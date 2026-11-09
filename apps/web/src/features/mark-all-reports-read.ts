import type { Coordinator } from '../client-model/coordinator'
import { bindingKey } from '../client-model/commands'
import { markReportSelectionRead } from './report-selection'

/** Collect a complete server cursor window, independent of loaded UI pages/filters.
 * Include archived and starred reports; the read action changes no other preferences.
 * Do not submit a partial batch when pagination fails or the player context changes.
 */
export async function markAllReportsRead(
  model: Pick<Coordinator, 'store' | 'send' | 'reportPage'>,
) {
  const initial = model.store.getState()
  if (!initial.ready || !initial.binding)
    throw new Error('Report context changed')
  const binding = bindingKey(initial.binding)
  const current = () => {
    const state = model.store.getState()
    if (!state.ready || !state.binding || bindingKey(state.binding) !== binding)
      throw new Error('Report context changed')
  }
  const reports = new Set<string>()
  const cursors = new Set<string>()
  let cursor: string | null = null
  do {
    current()
    const page = await model.reportPage(cursor, true)
    current()
    if (!page) throw new Error('Reports unavailable')
    for (const report of page.items) if (!report.read) reports.add(report.id)
    if (!page.has_more) break
    if (!page.next_cursor || cursors.has(page.next_cursor))
      throw new Error('Incomplete report history')
    cursor = page.next_cursor
    cursors.add(cursor)
  } while (cursor !== null)
  await markReportSelectionRead(model, [...reports])
}
