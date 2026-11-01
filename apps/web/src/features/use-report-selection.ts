import { useRef, useState } from 'react'
import type { Coordinator } from '../client-model/coordinator'
import {
  markReportSelectionRead,
  toggleReportSelection,
} from './report-selection'

export function useReportSelection(model: Coordinator) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const anchor = useRef<string | null>(null)
  const [markingRead, setMarkingRead] = useState(false)
  const [error, setError] = useState('')
  function select(ids: Set<string>) {
    anchor.current = null
    setError('')
    setSelected(ids)
  }
  function toggle(
    visible: string[],
    id: string,
    checked: boolean,
    shift: boolean,
  ) {
    setError('')
    const from = shift ? anchor.current : null
    setSelected((ids) => toggleReportSelection(ids, visible, id, checked, from))
    anchor.current = id
  }
  async function markRead(ids: string[]) {
    if (markingRead) return
    setMarkingRead(true)
    setError('')
    try {
      await markReportSelectionRead(model, ids)
      select(new Set())
    } catch {
      setError(
        'Could not mark all selected reports as read. Retry the remaining unread reports.',
      )
    } finally {
      setMarkingRead(false)
    }
  }
  return { selected, select, toggle, markingRead, markRead, error }
}
