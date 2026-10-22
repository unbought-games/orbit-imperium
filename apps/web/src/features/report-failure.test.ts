import { expect, it } from 'vitest'
import { ContractDataError } from '../client-model/schema'
import { reportFailure } from './report-failure'

it('separates incompatible data from access and transient failures', () => {
  expect(reportFailure(new ContractDataError('BoundReport4'))).toMatchObject({
    reload: true,
    message: expect.stringContaining('cannot read'),
  })
  expect(reportFailure({ status: 401 }).message).toContain('session expired')
  for (const status of [403, 404])
    expect(reportFailure({ status }).message).toContain(
      'not available to your account',
    )
  for (const error of [{ status: 503 }, new TypeError('Failed to fetch')])
    expect(reportFailure(error)).toEqual({
      message: 'Unable to load reports. Please try again.',
      reload: false,
    })
})
