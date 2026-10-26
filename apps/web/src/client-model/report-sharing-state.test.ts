import { expect, it } from 'vitest'
import { acceptReportSharing, reportShareStatus } from './report-sharing-state'
import { mergeReportHeaders } from './report-state'
const header = {
  id: 'report',
  kind: 'Combat',
  observed_at: 1,
  read: true,
  hidden: false,
  starred: false,
  shared: false,
}
const initial = { reportHeaders: mergeReportHeaders(new Map(), [header], '1') }
const publication = {
  token: 'token',
  options: { include_identity: false, include_coordinates: false },
  viewer_revision: '2',
  header: { ...header, starred: true, shared: true },
}
it('accepts the publication and protection together without duplicating the header', () => {
  const result = acceptReportSharing(initial, 'scope', 'report', publication)!
  expect(result.reportHeaders.get('report')).toEqual({
    header: publication.header,
    revision: '2',
  })
  expect(result.reportShares.scope.token).toBe('token')
  expect(result.reportShares.scope).not.toHaveProperty('header')
})
it('rejects delayed publication/status responses after revocation, deletion, or a later unstar', () => {
  const published = acceptReportSharing(
    initial,
    'scope',
    'report',
    publication,
  )!
  for (const latest of [
    {
      ...publication,
      token: null,
      options: null,
      header: { ...publication.header, shared: false },
    },
    {
      ...publication,
      token: null,
      options: null,
      header: { ...header, hidden: true },
    },
    { ...publication, header: { ...publication.header, starred: false } },
  ]) {
    const current = acceptReportSharing(published, 'scope', 'report', {
      ...latest,
      viewer_revision: '3',
    })!
    expect(
      acceptReportSharing(current, 'scope', 'report', publication),
    ).toBeNull()
  }
  const current = {
    ...published,
    reportHeaders: mergeReportHeaders(
      published.reportHeaders,
      [{ ...header, hidden: true }],
      '3',
    ),
  }
  expect(
    acceptReportSharing(current, 'scope', 'report', publication),
  ).toBeNull()
})
it('rejects a response belonging to a different report', () => {
  expect(
    acceptReportSharing(initial, 'scope', 'other-report', publication),
  ).toBeNull()
})

it('does not expose a cached link after a newer deletion or restoration header', () => {
  const published = acceptReportSharing(
    initial,
    'scope',
    'report',
    publication,
  )!
  expect(reportShareStatus(published, 'scope', 'report')?.token).toBe('token')
  for (const hidden of [true, false]) {
    const current = {
      ...published,
      reportHeaders: mergeReportHeaders(
        published.reportHeaders,
        [{ ...header, hidden }],
        '3',
      ),
    }
    expect(reportShareStatus(current, 'scope', 'report')).toBeUndefined()
  }
})
