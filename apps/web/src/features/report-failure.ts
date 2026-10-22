import {
  ContractDataError,
  incompatibleResponseMessage,
} from '../client-model/schema'

export function reportFailure(error: unknown) {
  if (error instanceof ContractDataError)
    return { message: incompatibleResponseMessage, reload: true }
  const status =
    error && typeof error === 'object' && 'status' in error
      ? error.status
      : null
  const message =
    status === 401
      ? 'Your session expired. Sign in again to read your reports.'
      : status === 403 || status === 404
        ? 'This report was not found or is not available to your account.'
        : typeof error === 'string'
          ? error
          : 'Unable to load reports. Please try again.'
  return { message, reload: false }
}
