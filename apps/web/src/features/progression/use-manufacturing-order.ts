import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
} from 'react'
import { useStore } from 'zustand'
import type { BoundProgressionOptions } from '../../client-model/commands'
import { manufacturingPreview } from './manufacturing-preview'
import {
  canBuildManufacturingOrder,
  createManufacturingOrder,
  manufacturingOrderIdentity,
} from './manufacturing-order'
import type { ProgressionProps } from './shared'

export function useManufacturingOrder(
  model: ProgressionProps['coordinator'],
  view: ProgressionProps['view'],
  source: BoundProgressionOptions | null,
  quantity: string,
  refresh: () => void,
  onSuccess: () => void,
) {
  const preview = manufacturingPreview(source, view, quantity)
  const identity = manufacturingOrderIdentity(source, view, quantity, preview)
  const order = useMemo(() => createManufacturingOrder(model), [model])
  const { busy, failure, submitted } = useSyncExternalStore(
    order.subscribe,
    order.getSnapshot,
    order.getSnapshot,
  )
  const submittedStatus = useStore(model.store, (state) =>
    submitted ? state.attempts.get(submitted.key)?.status : undefined,
  )
  useLayoutEffect(() => {
    order.invalidateDraft()
    return order.invalidateDraft
  }, [order, identity.draft])
  useLayoutEffect(() => {
    order.invalidateValidation()
    return order.invalidateValidation
  }, [order, identity.validation])
  useEffect(() => {
    if (order.consumeCommitted()) onSuccess()
  }, [order, submitted, submittedStatus, onSuccess])
  return {
    preview,
    canBuild: canBuildManufacturingOrder(model, preview, busy),
    busy,
    build: () => order.build(preview, view.binding, identity.error, refresh),
    error: failure?.key === identity.error ? failure.message : '',
  }
}
