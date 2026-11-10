import type { Coordinator } from '../../client-model/coordinator'
import type { BoundProgressionOptions } from '../../client-model/commands'
import type { ProgressionRequest } from './options'

export type ProgressionInspection = {
  key: string
  proposal: BoundProgressionOptions | null
  error: string
}

/** An effect-owned inspection. Cleanup fences both late success and failure;
 * the response key also prevents old data flashing before the next effect. */
export function inspectProgressionOptions(
  model: Pick<Coordinator, 'options'>,
  request: ProgressionRequest,
  key: string,
  receive: (response: ProgressionInspection) => void,
) {
  let active = true
  const settled = model.options(request).then(
    (proposal) => {
      if (active)
        receive({
          key,
          proposal,
          error: proposal
            ? ''
            : 'Construction is unavailable. Retry after reconnecting.',
        })
    },
    () => {
      if (active)
        receive({
          key,
          proposal: null,
          error:
            'Unable to inspect this action. Check your connection and try again.',
        })
    },
  )
  return {
    cancel: () => {
      active = false
    },
    settled,
  }
}

export function currentInspection(
  request: ProgressionRequest | null,
  key: string,
  response: ProgressionInspection | null,
) {
  const current = request && response?.key === key ? response : null
  return {
    proposal: current?.proposal ?? null,
    loading: !!request && !current,
    error: current?.error ?? '',
  }
}
