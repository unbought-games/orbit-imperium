import { useEffect, useState } from 'react'
import type { TutorialData } from '../../client-model/tutorial-engine'
import { advisorHistory } from './advisor-history'

export const receiptEvent = (id: string) => `receipt:${id}`

/** Continue after this celebration, rather than restarting at earlier unfinished work. */
export function celebrationNextDirective(
  data: TutorialData,
  receipts: TutorialData['receipts'],
) {
  const objectives = data.chapters.flatMap((chapter) => chapter.objectives)
  const completed = new Set(receipts.map((receipt) => receipt.objective))
  const last = objectives.reduce(
    (previous, objective, index) =>
      completed.has(objective.id) ? index : previous,
    -1,
  )
  if (last < 0) return null
  return (
    objectives.slice(last + 1).find((objective) => !objective.completed) ?? null
  )
}

/** Only server-issued receipts prove both completion and automatic payment. */
export function celebrationReceipts(
  data: TutorialData | null,
  selected: readonly string[],
) {
  return data?.enrolled
    ? data.receipts.filter((receipt) => selected.includes(receipt.id))
    : []
}

export function celebrationReward(receipts: TutorialData['receipts']) {
  return receipts.reduce(
    (total, receipt) => ({
      metal: String(BigInt(total.metal) + BigInt(receipt.resources.metal)),
      crystal: String(
        BigInt(total.crystal) + BigInt(receipt.resources.crystal),
      ),
      deuterium: String(
        BigInt(total.deuterium) + BigInt(receipt.resources.deuterium),
      ),
    }),
    { metal: '0', crystal: '0', deuterium: '0' },
  )
}

/** Selected IDs and seen receipts are presentation history, never game state. */
export function useAdvisorCelebration(
  scope: string,
  data: TutorialData | null,
) {
  const [selection, setSelection] = useState<{ scope: string; ids: string[] }>({
    scope,
    ids: [],
  })
  const unseen = data?.enrolled
    ? data.receipts.filter(
        (receipt) => !advisorHistory.seen(scope, receiptEvent(receipt.id)),
      )
    : []
  if (selection.scope !== scope) setSelection({ scope, ids: [] })
  else if (unseen.some((receipt) => !selection.ids.includes(receipt.id)))
    setSelection({ scope, ids: unseen.map((receipt) => receipt.id) })
  const receipts = celebrationReceipts(
    data,
    selection.scope === scope ? selection.ids : [],
  )
  return {
    receipts,
    event: receipts.length
      ? receiptEvent(receipts.map((receipt) => receipt.id).join(':'))
      : null,
    clear: () => setSelection({ scope, ids: [] }),
  }
}

export function useRememberCelebration(
  scope: string,
  ids: string[],
  open: boolean,
) {
  useEffect(() => {
    if (open)
      ids.forEach((id) => advisorHistory.remember(scope, receiptEvent(id)))
  }, [scope, ids, open])
}
