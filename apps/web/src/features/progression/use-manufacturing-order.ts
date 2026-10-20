import { useLayoutEffect, useRef, useState } from 'react'
import {
  canonical,
  type BoundProgressionOptions,
} from '../../client-model/commands'
import {
  canSubmitQuote,
  manufacturingPending,
} from '../../client-model/game-projection'
import { label } from '../../ui/format'
import {
  currentProgressionOptions,
  progressionCommand,
  progressionContext,
} from './options'
import {
  manufacturingPreview,
  matchesManufacturingPreview,
} from './manufacturing-preview'
import type { ProgressionProps } from './shared'

export function useManufacturingOrder(
  model: ProgressionProps['coordinator'],
  view: ProgressionProps['view'],
  source: BoundProgressionOptions | null,
  quantity: string,
  refresh: () => void,
) {
  const preview = manufacturingPreview(source, view, quantity)
  const key = canonical([
    preview?.request,
    source?.terms,
    progressionContext(view),
  ])
  const errorKey = canonical([view.binding, preview?.request])
  const generation = useRef(0)
  const running = useRef(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<{
    key: string
    message: string
  } | null>(null)
  useLayoutEffect(() => {
    generation.current += 1
    return () => {
      generation.current += 1
    }
  }, [key])
  const canBuild =
    !!preview &&
    !preview.blockers.length &&
    !busy &&
    model.ready &&
    !model.stale &&
    !manufacturingPending(model.store.getState(), preview.request.body)

  async function build() {
    if (!preview || !canBuild || running.current) return
    const started = generation.current
    running.current = true
    setBusy(true)
    setFailure(null)
    try {
      const validated = await model.options(preview.request)
      if (generation.current !== started) return
      if (!validated)
        throw new Error('Unable to build. Check your connection and try again.')
      if (!matchesManufacturingPreview(preview, validated)) {
        refresh()
        throw new Error(
          'Cost or build time changed. Check the updated order and build again.',
        )
      }
      const currentView = model.store.getState().view
      const current =
        currentView && currentView.protocol !== 2
          ? currentProgressionOptions(validated, currentView)
          : null
      const command = progressionCommand(current)
      if (
        !current ||
        !command ||
        current.blockers.length ||
        !canSubmitQuote(model.store.getState(), command, current)
      ) {
        throw new Error(
          current?.blockers.length
            ? `Unable to build: ${current.blockers.map((entry) => label(entry.code)).join(', ')}.`
            : 'This order is no longer available. Check the updated order and try again.',
        )
      }
      await model.send(command, current)
    } catch (error) {
      if (generation.current === started)
        setFailure({
          key: errorKey,
          message:
            error instanceof Error
              ? error.message
              : 'Unable to build. Try again.',
        })
    } finally {
      running.current = false
      setBusy(false)
    }
  }
  return {
    preview,
    canBuild,
    busy,
    build,
    error: failure?.key === errorKey ? failure.message : '',
  }
}
