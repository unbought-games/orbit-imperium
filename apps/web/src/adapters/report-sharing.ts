import { request } from './http'
import { validate } from '../client-model/schema'
import type { components } from '../contracts'
import type { Binding } from '../client-model/commands'
export type ShareOptions = components['schemas']['ReportShareOptions']
export type ShareStatus = components['schemas']['ReportShareStatus']
export type SharedReport = components['schemas']['SharedReport']
export type ShareAction = components['schemas']['ReportShareAction']
export async function reportSharing(
  binding: Binding,
  csrf: string,
  report: string,
  action: ShareAction,
) {
  return validate<ShareStatus>(
    'ReportShareStatus',
    await request(
      `/api/v4/universes/${binding.universe}/reports/${report}/share`,
      'POST',
      { context: { binding, request_id: crypto.randomUUID() }, action },
      csrf,
    ),
  )
}
export async function readSharedReport(token: string, signal: AbortSignal) {
  const response = await fetch(
    `/api/v4/shared-reports/${encodeURIComponent(token)}`,
    {
      signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    },
  )
  if (response.status === 404 || response.status === 400)
    throw new Error(
      'This report is unavailable. Its owner may have revoked the link or deleted the report.',
    )
  if (!response.ok)
    throw new Error('The report could not be loaded. Please try again.')
  return validate<SharedReport>('SharedReport', await response.json())
}
export function sharedReportPath(token: string) {
  return `/reports/shared/${token}`
}
